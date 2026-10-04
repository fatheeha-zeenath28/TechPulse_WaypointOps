const { tripMinutes, TRIP_BUDGET_PREDAWN, TRIP_BUDGET_DAYTIME, MAX_TRIPS_PER_VEHICLE } = require('./triptime');

/**
 * Allocates confirmed orders for one date+depot to vehicles and trips.
 * Respects: temperature capability, van_only access, home depot, one
 * brand+district per trip, capacity (weight+volume), 2 trips/vehicle max,
 * and the Fresh (pre-dawn) vs Style+Tech (daytime) time budgets.
 *
 * Orders that already carry times_deferred > 0 are force-fit ahead of
 * first-time orders, so the same outlet is not skipped twice in a row
 * without the dispatcher being shown exactly why.
 */
async function allocateDay(db, { date, depot }) {
  const ordersRes = await db.query(
    `SELECT o.*, ot.dock_type, ot.parking_constraint
     FROM orders o JOIN outlets ot ON ot.outlet_id = o.outlet_id
     WHERE o.order_date = $1 AND o.depot = $2 AND o.dispatch_status = 'confirmed'`,
    [date, depot]
  );
  const vehiclesRes = await db.query(
    `SELECT * FROM vehicles WHERE depot = $1 AND status = 'available' ORDER BY vehicle_id`,
    [depot]
  );
  const travelRes = await db.query(`SELECT * FROM district_travel`);
  const allowRes = await db.query(`SELECT * FROM service_allowance`);

  const districtTravel = Object.fromEntries(travelRes.rows.map(r => [r.district, r]));
  const serviceAllowance = Object.fromEntries(allowRes.rows.map(r => [`${r.brand}::${r.dock_type}`, r.service_allowance_min]));

  // vehicle runtime state
  const vState = {};
  for (const v of vehiclesRes.rows) {
    vState[v.vehicle_id] = { vehicle: v, trips: [] }; // trips: [{tripNo, brand, district, stops:[order], dockTypes:[]}]
  }

  const result = { served: [], deferred: [], trips: [] };

  // group orders by brand+district
  const groups = {};
  for (const o of ordersRes.rows) {
    const key = `${o.brand}::${o.district}`;
    (groups[key] = groups[key] || []).push(o);
  }

  for (const key of Object.keys(groups)) {
    const [brand, district] = key.split('::');
    // priority: previously-deferred orders first (force-fit), then smaller volume first (best fit)
    const orders = groups[key].sort((a, b) => {
      if (b.times_deferred !== a.times_deferred) return b.times_deferred - a.times_deferred;
      return Number(a.order_volume_m3) - Number(b.order_volume_m3);
    });

    for (const order of orders) {
      const placed = tryPlace(order, brand, district, vState, districtTravel, serviceAllowance);
      if (placed) {
        result.served.push({ order_id: order.order_id, vehicle_id: placed.vehicleId, trip_no: placed.tripNo });
      } else {
        const forced = order.times_deferred > 0;
        result.deferred.push({
          order_id: order.order_id,
          reason: forced
            ? 'capacity — repeated deferral, could not be force-fit onto remaining capacity'
            : 'capacity — demand exceeds available reefer/van/trip capacity for this run',
        });
      }
    }
  }

  // flatten vehicle trip state into trips/stops for persistence
  for (const vehicleId of Object.keys(vState)) {
    for (const trip of vState[vehicleId].trips) {
      if (trip.stops.length === 0) continue;
      const minutes = tripMinutes({
        district: trip.district, brand: trip.brand,
        dockTypes: trip.dockTypes, districtTravel, serviceAllowance,
      });
      result.trips.push({
        trip_key: `${vehicleId}:${trip.tripNo}:${date}`,
        vehicle_id: vehicleId, trip_no: trip.tripNo, date, depot,
        brand: trip.brand, district: trip.district, planned_minutes: minutes,
        stops: trip.stops.map((o, i) => ({ order_id: o.order_id, seq: i })),
      });
    }
  }

  return result;
}

function tryPlace(order, brand, district, vState, districtTravel, serviceAllowance) {
  const needsReefer = order.temp_requirement === 'chilled';
  const needsVan = order.parking_constraint === 'van_only';

  // Reserve reefer capacity for chilled demand: an ambient order tries
  // ambient-capable vehicles first and only falls back to a reefer vehicle
  // if no ambient vehicle has room. A chilled order only ever considers
  // reefer vehicles, so this ordering never affects chilled placement.
  const candidateIds = Object.keys(vState).sort((a, b) => {
    if (needsReefer) return 0;
    const aAmbient = vState[a].vehicle.temp === 'ambient' ? 0 : 1;
    const bAmbient = vState[b].vehicle.temp === 'ambient' ? 0 : 1;
    return aAmbient - bAmbient;
  });

  for (const vehicleId of candidateIds) {
    const vs = vState[vehicleId];
    const v = vs.vehicle;
    if (needsReefer && v.temp !== 'reefer') continue;
    if (needsVan && v.type !== 'van') continue;

    // try existing open trip for this brand+district on this vehicle
    for (const trip of vs.trips) {
      if (trip.brand !== brand || trip.district !== district) continue;
      if (fits(trip, order, v, brand, district, districtTravel, serviceAllowance, vs)) {
        commit(trip, order);
        return { vehicleId, tripNo: trip.tripNo };
      }
    }
    // try opening a new trip on this vehicle, if under the 2-trip cap
    if (vs.trips.length < MAX_TRIPS_PER_VEHICLE) {
      const tripNo = vs.trips.length + 1;
      const trip = { tripNo, brand, district, stops: [], dockTypes: [], volume: 0, weight: 0 };
      if (fits(trip, order, v, brand, district, districtTravel, serviceAllowance, vs)) {
        vs.trips.push(trip);
        commit(trip, order);
        return { vehicleId, tripNo };
      }
    }
  }
  return null;
}

function fits(trip, order, vehicle, brand, district, districtTravel, serviceAllowance, vs) {
  const newVolume = trip.volume + Number(order.order_volume_m3);
  const newWeight = trip.weight + Number(order.order_weight_kg);
  if (newVolume > Number(vehicle.volume_cap_m3) + 1e-6) return false;
  if (newWeight > Number(vehicle.weight_cap_kg) + 1e-6) return false;

  const newDockTypes = [...trip.dockTypes, order.dock_type];
  const newTripMinutes = tripMinutes({ district, brand, dockTypes: newDockTypes, districtTravel, serviceAllowance });

  // total minutes across this vehicle's OTHER trips in the same budget bucket
  const isFresh = brand === 'Fresh';
  let otherMinutes = 0;
  for (const t of vs.trips) {
    if (t === trip) continue;
    const tIsFresh = t.brand === 'Fresh';
    if (tIsFresh !== isFresh) continue;
    otherMinutes += tripMinutes({ district: t.district, brand: t.brand, dockTypes: t.dockTypes, districtTravel, serviceAllowance });
  }
  const budget = isFresh ? 270 /* TRIP_BUDGET_PREDAWN */ : 480 /* TRIP_BUDGET_DAYTIME */;
  if (otherMinutes + newTripMinutes > budget + 1e-6) return false;

  return true;
}

function commit(trip, order) {
  trip.stops.push(order);
  trip.dockTypes.push(order.dock_type);
  trip.volume += Number(order.order_volume_m3);
  trip.weight += Number(order.order_weight_kg);
}

module.exports = { allocateDay };

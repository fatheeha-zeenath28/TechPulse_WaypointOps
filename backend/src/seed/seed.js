const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../db');

const DATA_DIR = path.join(__dirname, 'data');
const DEMO_DATE = '2026-02-16'; // real, operating, non-festival Monday in the supplied calendar

function parseCsv(file) {
  const text = fs.readFileSync(path.join(DATA_DIR, file), 'utf8').trim();
  const [headerLine, ...lines] = text.split('\n');
  const headers = headerLine.split(',');
  return lines.filter(Boolean).map(line => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = cells[i] !== undefined ? cells[i].trim() : ''; });
    return row;
  });
}

function toBool(v) { return v === '1' || v === 'true' || v === 'True'; }

async function main() {
  console.log(`Seeding Waypoint Ops — demo date ${DEMO_DATE}`);
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await db.query(schema);

  // wipe existing data (safe for a fresh seed / demo reset)
  await db.query(`TRUNCATE events, trip_stops, trips, orders, users RESTART IDENTITY CASCADE`);
  await db.query(`TRUNCATE outlets, vehicles, calendar, district_travel, service_allowance CASCADE`);

  // ---- reference tables ----
  const outlets = parseCsv('outlets.csv');
  for (const o of outlets) {
    await db.query(
      `INSERT INTO outlets (outlet_id, brand, district, depot, dock_type, parking_constraint, mall_window, window_open_time, window_close_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [o.outlet_id, o.brand, o.district, o.depot, o.dock_type, o.parking_constraint, o.mall_window || null, o.window_open_time || null, o.window_close_time || null]
    );
  }
  console.log(`  outlets: ${outlets.length}`);

  const vehicles = parseCsv('vehicles.csv');
  for (const v of vehicles) {
    await db.query(
      `INSERT INTO vehicles (vehicle_id, type, temp, weight_cap_kg, volume_cap_m3, fuel_type, km_per_l, weekly_fuel_quota_l, depot, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'available')`,
      [v.vehicle_id, v.type, v.temp, v.weight_cap_kg, v.volume_cap_m3, v.fuel_type, v.km_per_l, v.weekly_fuel_quota_l, v.depot]
    );
  }
  // simulate the brief's S1 scenario: a few reefer trucks are in the workshop
  // ahead of the festival ramp, which is what creates the capacity shortfall.
  const inWorkshop = ['VEH005', 'VEH006', 'VEH007'];
  for (const id of inWorkshop) {
    await db.query(`UPDATE vehicles SET status = 'in_workshop' WHERE vehicle_id = $1`, [id]);
  }
  console.log(`  vehicles: ${vehicles.length} (in_workshop: ${inWorkshop.join(', ')})`);

  const calendar = parseCsv('calendar.csv');
  for (const c of calendar) {
    await db.query(
      `INSERT INTO calendar (date, dow, dow_name, is_weekend, iso_year, iso_week, is_payday, festival, festival_ramp, is_holiday, monsoon, is_operating)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [c.date, c.dow, c.dow_name, toBool(c.is_weekend), c.iso_year, c.iso_week, toBool(c.is_payday), c.festival || null, c.festival_ramp || 0, toBool(c.is_holiday), toBool(c.monsoon), toBool(c.is_operating)]
    );
  }
  console.log(`  calendar days: ${calendar.length}`);

  const travel = parseCsv('district_travel.csv');
  for (const t of travel) {
    await db.query(
      `INSERT INTO district_travel (district, depot, road_class, free_flow_kmh, depot_to_district_km, depot_to_district_freeflow_min, inter_stop_km, inter_stop_freeflow_min)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [t.district, t.depot, t.road_class, t.free_flow_kmh, t.depot_to_district_km, t.depot_to_district_freeflow_min, t.inter_stop_km, t.inter_stop_freeflow_min]
    );
  }
  console.log(`  districts: ${travel.length}`);

  const allowance = parseCsv('service_allowance.csv');
  for (const a of allowance) {
    await db.query(
      `INSERT INTO service_allowance (brand, dock_type, service_allowance_min) VALUES ($1,$2,$3)`,
      [a.brand, a.dock_type, a.service_allowance_min]
    );
  }
  console.log(`  service allowance rows: ${allowance.length}`);

  // ---- seeded accounts, one per role ----
  const users = [
    { username: 'dispatcher', password: 'dispatcher123', role: 'dispatcher', display_name: 'Priyantha (Dispatcher)', outlet_id: null, vehicle_id: null },
    { username: 'loader', password: 'loader123', role: 'loader', display_name: 'Nadeeka (Loader)', outlet_id: null, vehicle_id: null },
    { username: 'driver', password: 'driver123', role: 'driver', display_name: 'Sunil (Driver)', outlet_id: null, vehicle_id: 'VEH037' },
    { username: 'storemanager', password: 'store123', role: 'storemanager', display_name: 'Kumari (OUT001 — Colombo Fresh)', outlet_id: 'OUT001', vehicle_id: null },
  ];
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await db.query(
      `INSERT INTO users (username, password_hash, role, display_name, outlet_id, vehicle_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [u.username, hash, u.role, u.display_name, u.outlet_id, u.vehicle_id]
    );
  }
  console.log(`  users: ${users.length} (see README for credentials)`);

  // ---- one realistic demo delivery day, generated from the real outlets ----
  // Fresh: a dry (ambient) order every operating day; a chilled order on
  //        roughly three days in five, matching "separate chilled orders on
  //        several days each week" in the brief.
  // Style: a weekly order, sized to fill volume before weight.
  // Tech:  occasional — about half of outlets order on a given run.
  let orderCount = 0;
  const preDeferred = new Set(); // outlets whose chilled order rolls in already once-deferred

  const freshOutlets = outlets.filter(o => o.brand === 'Fresh');
  // pick 3 Peliyagoda chilled outlets (not OUT001) to carry a prior deferral into this run
  freshOutlets.filter(o => o.depot === 'Peliyagoda' && o.outlet_id !== 'OUT001').slice(3, 6).forEach(o => preDeferred.add(o.outlet_id));

  for (let i = 0; i < outlets.length; i++) {
    const o = outlets[i];
    const idx = parseInt(o.outlet_id.replace('OUT', ''), 10);

    if (o.brand === 'Fresh') {
      // dry / ambient order
      await insertOrder({
        order_id: `ORD-${DEMO_DATE}-${o.outlet_id}-DRY`, outlet_id: o.outlet_id, brand: 'Fresh',
        district: o.district, depot: o.depot, temp_requirement: 'ambient',
        order_units: 10 + (idx % 6) * 3, order_weight_kg: 90 + (idx % 7) * 18, order_volume_m3: 0.6 + (idx % 5) * 0.25,
      });
      orderCount++;
      // chilled order, ~60% of outlets
      if (idx % 5 !== 0) {
        const deferred = preDeferred.has(o.outlet_id) ? 1 : 0;
        await insertOrder({
          order_id: `ORD-${DEMO_DATE}-${o.outlet_id}-CHILLED`, outlet_id: o.outlet_id, brand: 'Fresh',
          district: o.district, depot: o.depot, temp_requirement: 'chilled',
          order_units: 8 + (idx % 5) * 2, order_weight_kg: 150 + (idx % 9) * 28, order_volume_m3: 1.0 + (idx % 6) * 0.35,
          times_deferred: deferred,
          defer_note: deferred ? 'capacity — deferred on previous run, retrying' : null,
        });
        orderCount++;
      }
    } else if (o.brand === 'Style') {
      await insertOrder({
        order_id: `ORD-${DEMO_DATE}-${o.outlet_id}-STYLE`, outlet_id: o.outlet_id, brand: 'Style',
        district: o.district, depot: o.depot, temp_requirement: 'ambient',
        order_units: 40 + (idx % 8) * 10, order_weight_kg: 220 + (idx % 6) * 45, order_volume_m3: 3.2 + (idx % 7) * 0.8,
      });
      orderCount++;
    } else if (o.brand === 'Tech') {
      if (idx % 2 === 0) {
        await insertOrder({
          order_id: `ORD-${DEMO_DATE}-${o.outlet_id}-TECH`, outlet_id: o.outlet_id, brand: 'Tech',
          district: o.district, depot: o.depot, temp_requirement: 'ambient',
          order_units: 2 + (idx % 4), order_weight_kg: 120 + (idx % 5) * 60, order_volume_m3: 0.4 + (idx % 4) * 0.3,
        });
        orderCount++;
      }
    }
  }
  console.log(`  orders generated for ${DEMO_DATE}: ${orderCount}`);
  console.log('Seed complete.');
  await db.pool.end();
}

async function insertOrder(o) {
  await db.query(
    `INSERT INTO orders (order_id, outlet_id, brand, district, depot, temp_requirement, order_units, order_weight_kg, order_volume_m3, order_date, dispatch_status, times_deferred, defer_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'confirmed',$11,$12)`,
    [o.order_id, o.outlet_id, o.brand, o.district, o.depot, o.temp_requirement, o.order_units, o.order_weight_kg, o.order_volume_m3, DEMO_DATE, o.times_deferred || 0, o.defer_note || null]
  );
}

main().catch(e => { console.error(e); process.exit(1); });

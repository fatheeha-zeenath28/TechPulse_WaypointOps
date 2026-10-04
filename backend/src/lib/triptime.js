// Trip duration, using the planning standard published in the challenge booklet:
//   trip_minutes = outbound travel + inter-stop travel + total handling time
//
// - outbound travel: depot_to_district_freeflow_min, once per trip
// - inter-stop travel: inter_stop_freeflow_min * (stops - 1)
// - handling time: service_allowance_min per stop, looked up by (brand, dock_type)

function tripMinutes({ district, brand, dockTypes, districtTravel, serviceAllowance }) {
  const d = districtTravel[district];
  if (!d) throw new Error(`Unknown district in district_travel: ${district}`);
  const n = dockTypes.length;
  if (n === 0) return 0;
  const outbound = Number(d.depot_to_district_freeflow_min);
  const interStop = Number(d.inter_stop_freeflow_min) * (n - 1);
  const handling = dockTypes.reduce((sum, dk) => {
    const key = `${brand}::${dk}`;
    const allowance = serviceAllowance[key];
    if (allowance === undefined) throw new Error(`No service_allowance for ${key}`);
    return sum + Number(allowance);
  }, 0);
  return outbound + interStop + handling;
}

const TRIP_BUDGET_PREDAWN = 270;  // Fresh, 03:30-08:00
const TRIP_BUDGET_DAYTIME = 480;  // Style + Tech combined
const MAX_TRIPS_PER_VEHICLE = 2;

module.exports = { tripMinutes, TRIP_BUDGET_PREDAWN, TRIP_BUDGET_DAYTIME, MAX_TRIPS_PER_VEHICLE };

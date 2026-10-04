const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/auth');
const { allocateDay } = require('../lib/allocate');

const router = express.Router();
router.use(requireAuth(['dispatcher']));

// Summary + order queue + fleet capacity for a date/depot
router.get('/board', async (req, res) => {
  const date = req.query.date;
  const depot = req.query.depot || 'Peliyagoda';
  if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });

  const orders = await db.query(
    `SELECT o.*, ot.dock_type, ot.parking_constraint, ot.window_open_time, ot.window_close_time
     FROM orders o JOIN outlets ot ON ot.outlet_id = o.outlet_id
     WHERE o.order_date = $1 AND o.depot = $2
     ORDER BY o.brand, o.district, o.outlet_id`,
    [date, depot]
  );

  const vehicles = await db.query(`SELECT * FROM vehicles WHERE depot = $1`, [depot]);
  const trips = await db.query(
    `SELECT t.*, COUNT(ts.id) AS stop_count
     FROM trips t LEFT JOIN trip_stops ts ON ts.trip_key = t.trip_key
     WHERE t.date = $1 AND t.depot = $2
     GROUP BY t.trip_key`,
    [date, depot]
  );

  const reefer = vehicles.rows.filter(v => v.temp === 'reefer');
  const ambient = vehicles.rows.filter(v => v.temp === 'ambient' && v.type === 'truck');
  const vans = vehicles.rows.filter(v => v.type === 'van');

  const counts = { confirmed: 0, served: 0, deferred: 0, not_run: 0 };
  for (const o of orders.rows) counts[o.dispatch_status] = (counts[o.dispatch_status] || 0) + 1;

  res.json({
    date, depot,
    orders: orders.rows,
    trips: trips.rows,
    counts,
    fleet: {
      reefer: { total: reefer.length, available: reefer.filter(v => v.status === 'available').length },
      ambient: { total: ambient.length, available: ambient.filter(v => v.status === 'available').length },
      vans: { total: vans.length, available: vans.filter(v => v.status === 'available').length },
    },
  });
});

// Run the allocation engine for a date/depot
router.post('/allocate', async (req, res) => {
  const { date, depot } = req.body || {};
  if (!date || !depot) return res.status(400).json({ error: 'date and depot are required' });

  const result = await allocateDay(db, { date, depot });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    for (const trip of result.trips) {
      await client.query(
        `INSERT INTO trips (trip_key, vehicle_id, trip_no, date, depot, brand, district, planned_minutes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (trip_key) DO UPDATE SET planned_minutes = EXCLUDED.planned_minutes`,
        [trip.trip_key, trip.vehicle_id, trip.trip_no, trip.date, trip.depot, trip.brand, trip.district, trip.planned_minutes]
      );
      for (const stop of trip.stops) {
        await client.query(
          `INSERT INTO trip_stops (trip_key, order_id, seq) VALUES ($1,$2,$3)`,
          [trip.trip_key, stop.order_id, stop.seq]
        );
        await client.query(`UPDATE orders SET dispatch_status = 'served' WHERE order_id = $1`, [stop.order_id]);
      }
    }
    for (const d of result.deferred) {
      await client.query(
        `UPDATE orders SET dispatch_status = 'deferred', defer_reason = $2, times_deferred = times_deferred + 1 WHERE order_id = $1`,
        [d.order_id, d.reason]
      );
      await client.query(
        `INSERT INTO events (event_type, order_id, actor_role, payload) VALUES ('deferral', $1, 'dispatcher', $2)`,
        [d.order_id, JSON.stringify({ reason: d.reason, auto: true })]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  res.json({ served: result.served.length, deferred: result.deferred.length, trips: result.trips.length, detail: result });
});

// Capacity Shortfall Resolution screen: ranked deferral candidates for a date/depot
router.get('/shortfall', async (req, res) => {
  const date = req.query.date;
  const depot = req.query.depot || 'Peliyagoda';
  const r = await db.query(
    `SELECT o.*, ot.district AS outlet_district
     FROM orders o JOIN outlets ot ON ot.outlet_id = o.outlet_id
     WHERE o.order_date = $1 AND o.depot = $2 AND o.dispatch_status = 'deferred'
     ORDER BY o.times_deferred DESC, o.order_volume_m3 ASC`,
    [date, depot]
  );
  res.json({ candidates: r.rows });
});

// Confirm/override a single deferral decision with a reason (manual dispatcher action)
router.post('/orders/:orderId/decision', async (req, res) => {
  const { orderId } = req.params;
  const { decision, reason, vehicle_id, trip_no } = req.body || {};
  if (!['served', 'deferred'].includes(decision)) return res.status(400).json({ error: 'decision must be served or deferred' });

  if (decision === 'deferred') {
    await db.query(
      `UPDATE orders SET dispatch_status='deferred', defer_reason=$2, times_deferred = times_deferred + 1 WHERE order_id=$1`,
      [orderId, reason || 'capacity — dispatcher decision']
    );
    await db.query(
      `INSERT INTO events (event_type, order_id, actor_role, payload) VALUES ('deferral', $1, 'dispatcher', $2)`,
      [orderId, JSON.stringify({ reason: reason || 'capacity — dispatcher decision', auto: false })]
    );
  } else {
    if (!vehicle_id || !trip_no) return res.status(400).json({ error: 'vehicle_id and trip_no required to force-fit a served order' });
    const order = (await db.query('SELECT * FROM orders WHERE order_id=$1', [orderId])).rows[0];
    const tripKey = `${vehicle_id}:${trip_no}:${order.order_date.toISOString().slice(0,10)}`;
    await db.query(
      `INSERT INTO trips (trip_key, vehicle_id, trip_no, date, depot, brand, district)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (trip_key) DO NOTHING`,
      [tripKey, vehicle_id, trip_no, order.order_date, order.depot, order.brand, order.district]
    );
    const seqRes = await db.query(`SELECT COALESCE(MAX(seq),-1)+1 AS next FROM trip_stops WHERE trip_key=$1`, [tripKey]);
    await db.query(`INSERT INTO trip_stops (trip_key, order_id, seq) VALUES ($1,$2,$3)`, [tripKey, orderId, seqRes.rows[0].next]);
    await db.query(`UPDATE orders SET dispatch_status='served', defer_reason=NULL WHERE order_id=$1`, [orderId]);
    await db.query(
      `INSERT INTO events (event_type, order_id, actor_role, payload) VALUES ('deferral', $1, 'dispatcher', $2)`,
      [orderId, JSON.stringify({ forced_fit: true, vehicle_id, trip_no })]
    );
  }
  res.json({ ok: true });
});

module.exports = router;

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth(['driver']));

// Today's stops for this driver's vehicle, in delivery order
router.get('/stops', async (req, res) => {
  const vehicleId = req.user.vehicle_id;
  const { date } = req.query;
  const r = await db.query(
    `SELECT ts.*, o.order_id, o.outlet_id, o.temp_requirement, o.order_units,
            ot.district, ot.dock_type, ot.parking_constraint, ot.window_open_time, ot.window_close_time, ot.mall_window,
            t.trip_no, t.trip_key
     FROM trip_stops ts
     JOIN trips t ON t.trip_key = ts.trip_key
     JOIN orders o ON o.order_id = ts.order_id
     JOIN outlets ot ON ot.outlet_id = o.outlet_id
     WHERE t.vehicle_id = $1 AND t.date = $2
     ORDER BY t.trip_no, ts.seq ASC`,
    [vehicleId, date]
  );
  res.json({ stops: r.rows });
});

// Live, online status update for a single stop
router.post('/stops/:stopId/status', async (req, res) => {
  const { stopId } = req.params;
  const { status, note } = req.body || {}; // arrived | delivered | blocked
  if (!['arrived', 'delivered', 'blocked'].includes(status)) return res.status(400).json({ error: 'invalid status' });

  const field = status === 'arrived' ? 'arrived_at' : status === 'delivered' ? 'delivered_at' : null;
  const sets = [`delivery_status = $2`, `pod_note = $3`];
  const vals = [stopId, status, note || null];
  let sql = `UPDATE trip_stops SET ${sets.join(', ')}`;
  if (field) sql += `, ${field} = now()`;
  sql += ` WHERE id = $1 RETURNING order_id`;
  const r = await db.query(sql, vals);
  if (r.rows[0]) {
    await db.query(`INSERT INTO events (event_type, order_id, actor_role, payload) VALUES ('delivery', $1, 'driver', $2)`,
      [r.rows[0].order_id, JSON.stringify({ status, note, offline: false })]);
  }
  res.json({ ok: true });
});

// Offline queue flush: applies a batch of events recorded while disconnected.
// Detects the one conflict the brief calls out explicitly: a driver delivers
// a stop offline while the dispatcher, working from a stale view, defers the
// same order. We surface the conflict instead of silently picking a winner.
router.post('/sync', async (req, res) => {
  const { events } = req.body || {};
  if (!Array.isArray(events)) return res.status(400).json({ error: 'events array required' });

  const applied = [];
  const conflicts = [];

  for (const ev of events) {
    const stopRes = await db.query(
      `SELECT ts.id, ts.order_id, o.dispatch_status FROM trip_stops ts JOIN orders o ON o.order_id = ts.order_id WHERE ts.id = $1`,
      [ev.stopId]
    );
    const stop = stopRes.rows[0];
    if (!stop) { conflicts.push({ ...ev, reason: 'stop not found' }); continue; }

    if (ev.status === 'delivered' && stop.dispatch_status === 'deferred') {
      conflicts.push({
        stopId: ev.stopId, order_id: stop.order_id,
        reason: `Order ${stop.order_id} was deferred by the dispatcher while you were offline, but you delivered it at ${ev.client_time}.`,
      });
      await db.query(`INSERT INTO events (event_type, order_id, actor_role, payload) VALUES ('conflict', $1, 'driver', $2)`,
        [stop.order_id, JSON.stringify(ev)]);
      continue;
    }

    const field = ev.status === 'arrived' ? 'arrived_at' : ev.status === 'delivered' ? 'delivered_at' : null;
    let sql = `UPDATE trip_stops SET delivery_status=$2, pod_note=$3, recorded_offline=true`;
    if (field) sql += `, ${field} = $4`;
    sql += ` WHERE id = $1`;
    await db.query(sql, field ? [ev.stopId, ev.status, ev.note || null, ev.client_time] : [ev.stopId, ev.status, ev.note || null]);
    await db.query(`INSERT INTO events (event_type, order_id, actor_role, payload) VALUES ('sync', $1, 'driver', $2)`,
      [stop.order_id, JSON.stringify({ ...ev, offline: true })]);
    applied.push(ev.stopId);
  }

  res.json({ applied, conflicts });
});

// Resolve a conflict: dispatcher or driver picks which record stands
router.post('/sync/resolve', async (req, res) => {
  const { stopId, keep } = req.body || {}; // keep: 'delivered' | 'deferred'
  const stopRes = await db.query(`SELECT order_id FROM trip_stops WHERE id = $1`, [stopId]);
  const orderId = stopRes.rows[0]?.order_id;
  if (!orderId) return res.status(404).json({ error: 'stop not found' });

  if (keep === 'delivered') {
    await db.query(`UPDATE orders SET dispatch_status='served' WHERE order_id=$1`, [orderId]);
    await db.query(`UPDATE trip_stops SET delivery_status='delivered' WHERE id=$1`, [stopId]);
  } else {
    await db.query(`UPDATE trip_stops SET delivery_status='blocked', pod_note='Reverted — order was deferred' WHERE id=$1`, [stopId]);
  }
  await db.query(`INSERT INTO events (event_type, order_id, actor_role, payload) VALUES ('conflict', $1, 'dispatcher', $2)`,
    [orderId, JSON.stringify({ resolved_to: keep })]);
  res.json({ ok: true });
});

module.exports = router;

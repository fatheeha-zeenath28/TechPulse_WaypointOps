const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth(['loader']));

// Trips ready to load for a date/depot
router.get('/trips', async (req, res) => {
  const { date, depot } = req.query;
  const r = await db.query(
    `SELECT t.*, COUNT(ts.id) AS stop_count,
            SUM(CASE WHEN ts.load_status = 'loaded' THEN 1 ELSE 0 END) AS loaded_count,
            SUM(CASE WHEN ts.load_status = 'flagged' THEN 1 ELSE 0 END) AS flagged_count
     FROM trips t JOIN trip_stops ts ON ts.trip_key = t.trip_key
     WHERE t.date = $1 AND t.depot = $2
     GROUP BY t.trip_key ORDER BY t.vehicle_id, t.trip_no`,
    [date, depot]
  );
  res.json({ trips: r.rows });
});

// Stops for one trip, in LOAD order (reverse of delivery order, per the brief)
router.get('/trips/:tripKey/stops', async (req, res) => {
  const { tripKey } = req.params;
  const r = await db.query(
    `SELECT ts.*, o.order_id, o.outlet_id, o.order_units, o.order_weight_kg, o.order_volume_m3, o.temp_requirement,
            ot.dock_type
     FROM trip_stops ts
     JOIN orders o ON o.order_id = ts.order_id
     JOIN outlets ot ON ot.outlet_id = o.outlet_id
     WHERE ts.trip_key = $1
     ORDER BY ts.seq DESC`, // reverse: last delivery stop is loaded first
    [tripKey]
  );
  res.json({ stops: r.rows });
});

router.post('/stops/:stopId/load', async (req, res) => {
  const { stopId } = req.params;
  await db.query(`UPDATE trip_stops SET load_status = 'loaded' WHERE id = $1`, [stopId]);
  res.json({ ok: true });
});

router.post('/stops/:stopId/flag', async (req, res) => {
  const { stopId } = req.params;
  const { note } = req.body || {};
  const r = await db.query(
    `UPDATE trip_stops SET load_status = 'flagged', flag_note = $2 WHERE id = $1 RETURNING order_id`,
    [stopId, note || 'Shortfall at loading dock']
  );
  if (r.rows[0]) {
    await db.query(
      `INSERT INTO events (event_type, order_id, actor_role, payload) VALUES ('flag', $1, 'loader', $2)`,
      [r.rows[0].order_id, JSON.stringify({ note: note || 'Shortfall at loading dock' })]
    );
  }
  res.json({ ok: true });
});

module.exports = router;

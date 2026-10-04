const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth(['storemanager']));

// Order timeline for this manager's outlet
router.get('/orders', async (req, res) => {
  const outletId = req.user.outlet_id;
  const { date } = req.query;
  const r = await db.query(
    `SELECT o.*, ts.delivery_status, ts.arrived_at, ts.delivered_at
     FROM orders o
     LEFT JOIN trip_stops ts ON ts.order_id = o.order_id
     WHERE o.outlet_id = $1 AND o.order_date = $2
     ORDER BY o.created_at`,
    [outletId, date]
  );
  res.json({ outlet_id: outletId, orders: r.rows });
});

// Confirm receipt, item-by-item outcome rather than one blanket tap
router.post('/orders/:orderId/confirm', async (req, res) => {
  const { orderId } = req.params;
  const { status, note } = req.body || {}; // received | short | damaged
  if (!['received', 'short', 'damaged'].includes(status)) return res.status(400).json({ error: 'invalid status' });

  const r = await db.query(
    `UPDATE orders SET receipt_status = $2, receipt_note = $3 WHERE order_id = $1 AND outlet_id = $4 RETURNING order_id`,
    [orderId, status, note || null, req.user.outlet_id]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'order not found for this outlet' });

  await db.query(`INSERT INTO events (event_type, order_id, actor_role, payload) VALUES ('receipt', $1, 'storemanager', $2)`,
    [orderId, JSON.stringify({ status, note })]);
  res.json({ ok: true });
});

module.exports = router;

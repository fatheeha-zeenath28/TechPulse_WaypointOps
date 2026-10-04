const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken } = require('../lib/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const r = await db.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = r.rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id, username: user.username, role: user.role, display_name: user.display_name,
      outlet_id: user.outlet_id, vehicle_id: user.vehicle_id,
    },
  });
});

module.exports = router;

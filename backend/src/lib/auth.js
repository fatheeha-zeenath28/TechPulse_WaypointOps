const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'waypoint-dev-secret-change-me';

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, username: user.username, display_name: user.display_name,
      outlet_id: user.outlet_id, vehicle_id: user.vehicle_id },
    SECRET,
    { expiresIn: '12h' }
  );
}

function requireAuth(roles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });
    try {
      const payload = jwt.verify(token, SECRET);
      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ error: 'Wrong role for this endpoint' });
      }
      req.user = payload;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

module.exports = { signToken, requireAuth, SECRET };

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://waypoint:waypoint@db:5432/waypoint',
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};

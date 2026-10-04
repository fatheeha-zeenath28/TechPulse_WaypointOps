const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const dispatcherRoutes = require('./routes/dispatcher');
const loaderRoutes = require('./routes/loader');
const driverRoutes = require('./routes/driver');
const storemanagerRoutes = require('./routes/storemanager');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'waypoint-ops-backend' }));
app.use('/api/auth', authRoutes);
app.use('/api/dispatcher', dispatcherRoutes);
app.use('/api/loader', loaderRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/storemanager', storemanagerRoutes);

// Serve the built frontend (single-container deployment)
const FRONTEND_DIST = path.join(__dirname, '..', 'public');
app.use(express.static(FRONTEND_DIST));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Waypoint Ops backend listening on :${PORT}`));

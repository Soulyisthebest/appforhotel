require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','X-Hotel-ID','SOAPAction'] }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Raw body for XML webhooks (Booking.com sends XML)
app.use('/api/channels/webhook', express.raw({ type: ['text/xml','application/xml','text/plain'], limit: '1mb' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 500, message: { error: 'Too many requests' } }));

// ─── CORE OPERATIONS ────────────────────────────────────────
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/hotels',         require('./routes/hotels'));
app.use('/api/rooms',          require('./routes/rooms'));
app.use('/api/reservations',   require('./routes/reservations'));
app.use('/api/guests',         require('./routes/guests'));
app.use('/api/folios',         require('./routes/folios'));
app.use('/api/payments',       require('./routes/payments'));
app.use('/api/checkin',        require('./routes/checkin'));
app.use('/api/checkout',       require('./routes/checkout'));
app.use('/api/walk-in',        require('./routes/walkin'));
app.use('/api/room-move',      require('./routes/roomMove'));

// ─── HOUSEKEEPING & MAINTENANCE ─────────────────────────────
app.use('/api/housekeeping',   require('./routes/housekeeping'));
app.use('/api/maintenance',    require('./routes/maintenance'));
app.use('/api/night-audit',    require('./routes/nightaudit'));
app.use('/api/cash-register',  require('./routes/cashRegister'));

// ─── CHANNEL MANAGER + OTA INTEGRATIONS ─────────────────────
app.use('/api/channels',       require('./routes/channels'));
app.use('/api/rates',          require('./routes/rates'));
app.use('/api/booking-engine', require('./routes/bookingEngine'));

// ─── REVENUE & BILLING ──────────────────────────────────────
app.use('/api/invoices',       require('./routes/invoices'));
app.use('/api/reports',        require('./routes/reports'));

// ─── CRM & COMMUNICATION ────────────────────────────────────
app.use('/api/companies',      require('./routes/companies'));
app.use('/api/email',          require('./routes/emailService'));
app.use('/api/police-report',  require('./routes/policeReport'));
app.use('/api/notifications',  require('./routes/notifications'));

// ─── ADMIN ──────────────────────────────────────────────────
app.use('/api/staff',          require('./routes/staff'));
app.use('/api/dashboard',      require('./routes/dashboard'));
app.use('/api/import',         require('./routes/import'));

// ─── HEALTH ─────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok', service: 'HotelOS PMS', version: '1.3.0',
    env: process.env.NODE_ENV, timestamp: new Date().toISOString(),
    modules: 28,
    integrations: {
      booking_webhook: '/api/channels/webhook/booking',
      expedia_webhook: '/api/channels/webhook/expedia',
      airbnb_webhook:  '/api/channels/webhook/airbnb',
      booking_widget:  '/widget.js',
      google_feed:     '/api/channels/google-feed/:hotelId'
    }
  });
});

// ─── SERVE REACT FRONTEND ───────────────────────────────────
const clientBuild = path.join(__dirname, '..', 'client', 'dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientBuild, { maxAge: '1y', etag: true }));
  // Serve widget.js from public folder
  app.get('/widget.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(path.join(__dirname, '..', 'client', 'public', 'widget.js'));
  });
  app.get('*', (req, res) => res.sendFile(path.join(clientBuild, 'index.html')));
} else {
  app.get('/widget.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(path.join(__dirname, '..', 'client', 'public', 'widget.js'));
  });
  app.get('/', (req, res) => res.json({
    message: 'HotelOS PMS API v1.3.0',
    health: '/health', widget: '/widget.js'
  }));
}

app.use('/api/*', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏨 HotelOS PMS v1.3.0`);
  console.log(`🚀 Port ${PORT} | ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 28 API modules | 3 OTA integrations`);
  console.log(`🌐 Widget: http://localhost:${PORT}/widget.js`);
  console.log(`📊 Health: http://localhost:${PORT}/health\n`);

  // Start automatic channel sync (every 5 minutes)
  if (process.env.NODE_ENV === 'production') {
    const { startAutoSync } = require('./integrations/channelSyncEngine');
    startAutoSync(5);
  }
});

module.exports = app;

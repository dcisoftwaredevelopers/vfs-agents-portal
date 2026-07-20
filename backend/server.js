const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIO = require('socket.io');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

// Load env vars
dotenv.config();

const app = express();
app.disable('x-powered-by');

const configuredOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const allowedOrigins = [
  ...configuredOrigins,
  'https://vfs-agents-portal.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174'
];

// Matches any Vercel preview URL for this project, e.g.
// https://vfs-agents-portal-ilpftayfs-vfs-team.vercel.app
// https://vfs-agents-portal-git-feature-xyz-vfs-team.vercel.app
const vercelPreviewPattern = /^https:\/\/vfs-agents-portal(-[a-z0-9]+)*\.vercel\.app$/;

const isOriginAllowed = (origin) => {
  if (!origin) return true; // non-browser requests (curl, server-to-server, health checks)
  if (allowedOrigins.includes(origin)) return true;
  if (vercelPreviewPattern.test(origin)) return true;
  return false;
};

// 1. Secure HTTP headers with Helmet (configured to allow external Google Scripts, Fonts and WebSockets)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://accounts.google.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        frameSrc: ["'self'", 'https://accounts.google.com'],
        // Static allowedOrigins + wildcard for Vercel preview subdomains,
        // since CSP directives can't evaluate a regex like the CORS check below.
        connectSrc: ["'self'", ...allowedOrigins, 'https://*.vercel.app']
      }
    }
  })
);

// 2. Prevent NoSQL query injection attacks
app.use(mongoSanitize());

// 3. CORS
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }
      console.warn(`Blocked by CORS: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 4. Rate Limiting configurations
const publicLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { message: 'Too many requests, please try again after a minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5,
  message: { message: 'Too many login attempts from this IP, please try again after a minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

const bookingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: { message: 'Too many booking attempts, please try again after a minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply public limiter globally to all API routes
app.use('/api', publicLimiter);

// Apply specific rate limiters to target endpoints
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/admin-login', loginLimiter);
app.use('/api/booking/lock', bookingLimiter);
app.use('/api/booking/payment', bookingLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/booking', require('./routes/booking'));
app.use('/api/agents', require('./routes/agentroutes'));
app.use('/api/tracking', require('./routes/tracking'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/referral', require('./routes/referral'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    // Use the same dynamic origin check as the REST API so Socket.IO
    // connections from Vercel preview deployments aren't blocked either.
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Global Socket IO instance
global.io = io;

io.on('connection', (socket) => {
  console.log(`Socket client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`Socket client disconnected: ${socket.id}`);
  });
});

const startServer = (port) => {
  server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });

  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop the existing backend process before starting another one.`);
      process.exit(1);
      return;
    }

    console.error('Server startup failed:', error);
    process.exit(1);
  });
};

const PORT = Number(process.env.PORT || 5000);

const startApp = async () => {
  await connectDB();

  // Initialize expiration background sweepers/workers only after MongoDB is ready.
  const { initQueueService } = require('./services/queueService');
  const { startExpirationWorker } = require('./workers/expirationWorker');

  initQueueService(io);
  startExpirationWorker(io);
  startServer(PORT);
};

startApp();
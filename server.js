require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 7000;

// Security
app.use(helmet());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos (FRONTEND)
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax'
  }
}));

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || '';

function requireAuth(req, res, next) {
  if (req.session?.user === ADMIN_USER) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Login
app.post('/api/login', async (req, res) => {
  const { user, pass } = req.body;

  if (user !== ADMIN_USER) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const valid = await bcrypt.compare(pass, ADMIN_PASS_HASH);
  if (!valid) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  req.session.user = ADMIN_USER;
  res.json({ ok: true });
});

// Logout
app.post('/api/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// Protected route
app.get('/api/admin', requireAuth, (req, res) => {
  res.json({ message: 'Admin access granted' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🔐 OpenClaw Control rodando em http://127.0.0.1:${PORT}`);
});

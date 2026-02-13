const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { env } = require('./env');

function parseOrigins() {
  return env.CORS_ORIGIN.split(',').map((item) => item.trim()).filter(Boolean);
}

function corsMiddleware(req, res, next) {
  const allowedOrigins = parseOrigins();
  const origin = req.headers.origin;

  if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return next();
}

function applySecurity(app) {
  app.use(helmet());
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 250,
    standardHeaders: true,
    legacyHeaders: false
  }));
  app.use(corsMiddleware);
}

module.exports = {
  applySecurity,
  corsMiddleware
};

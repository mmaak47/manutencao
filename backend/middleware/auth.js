const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}

function normalizeRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (['comercial', 'commercial', 'sales'].includes(normalized)) return 'comercial';
  return 'user';
}

function isAdminUser(user) {
  return normalizeRole(user?.role) === 'admin';
}

function isCommercialUser(user) {
  return normalizeRole(user?.role) === 'comercial';
}

function isReadMethod(method) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase());
}

function isContractsPath(pathname) {
  return /^\/contracts(\/|$)/.test(String(pathname || ''));
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

function extractCookieToken(req) {
  return req.cookies?.access_token || null;
}

async function authenticateToken(req, res, next) {
  const token = extractBearerToken(req) || extractCookieToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload?.type && payload.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const user = await User.findByPk(payload?.id, {
      attributes: ['id', 'username', 'email', 'role', 'active', 'tokenVersion']
    });

    if (!user || user.active === false) {
      return res.status(401).json({ error: 'Invalid user session' });
    }

    if (Number(payload?.tokenVersion || 0) !== Number(user.tokenVersion || 0)) {
      return res.status(401).json({ error: 'Session expired' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: normalizeRole(user.role),
      tokenVersion: Number(user.tokenVersion || 0)
    };

    if (isCommercialUser(req.user) && !isReadMethod(req.method) && !isContractsPath(req.path)) {
      return res.status(403).json({ error: 'Comercial pode alterar apenas contratos.' });
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireAdmin,
  isAdminUser,
  isCommercialUser,
  JWT_SECRET
};

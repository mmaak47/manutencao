const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

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

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { ...payload, role: normalizeRole(payload?.role) };

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

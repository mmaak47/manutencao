const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { z } = require('zod');
const { Op, DataTypes } = require('sequelize');
const sequelize = require('./config/database');
const Screen = require('./models/Screen');
const ScreenEvent = require('./models/ScreenEvent');
const Note = require('./models/Note');
const Contact = require('./models/Contact');
const User = require('./models/User');
const Alert = require('./models/Alert');
const Ticket = require('./models/Ticket');
const Schedule = require('./models/Schedule');
const AuditLog = require('./models/AuditLog');
const Part = require('./models/Part');
const ChecklistTemplate = require('./models/ChecklistTemplate');
const NotificationConfig = require('./models/NotificationConfig');
const Contract = require('./models/Contract');
const Vendor = require('./models/Vendor');
const TelemetrySnapshot = require('./models/TelemetrySnapshot');
const TechRegistration = require('./models/TechRegistration');
const LoopAudit = require('./models/LoopAudit');
const { authenticateToken, requireAdmin, JWT_SECRET } = require('./middleware/auth');
const backup = require('./config/backup');

// Model associations
Ticket.belongsTo(Screen, { foreignKey: 'screenId' });
Screen.hasMany(Ticket, { foreignKey: 'screenId' });
Schedule.belongsTo(Screen, { foreignKey: 'screenId' });
Schedule.belongsTo(Ticket, { foreignKey: 'ticketId' });
Alert.belongsTo(Screen, { foreignKey: 'screenId' });
Screen.hasMany(Alert, { foreignKey: 'screenId' });
Contract.belongsTo(Vendor, { foreignKey: 'vendorId' });
Vendor.hasMany(Contract, { foreignKey: 'vendorId' });

const app = express();
app.set('trust proxy', 1);

const ALLOWED_ORIGINS = String(process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

if (!ALLOWED_ORIGINS.length) {
  throw new Error('Missing required environment variable: CORS_ALLOWED_ORIGINS');
}

const isProduction = process.env.NODE_ENV === 'production';
const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === 'true'
  : false;
const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_TTL || '7d';
const BCRYPT_ROUNDS = Math.max(12, Number(process.env.BCRYPT_ROUNDS || 12));
const BODY_LIMIT = process.env.BODY_LIMIT || '1mb';
const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || (15 * 60 * 1000));
const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 10);
const LOGIN_RATE_LIMIT_MAX = Number(process.env.LOGIN_RATE_LIMIT_MAX || 5);

const refreshTokenCookieOptions = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: 'strict',
  path: '/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

const csrfSecretCookieOptions = {
  key: '_csrf',
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: 'strict',
  path: '/'
};

const csrfSecretClearCookieOptions = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: 'strict',
  path: '/'
};

const csrfCookieOptions = {
  httpOnly: false,
  secure: COOKIE_SECURE,
  sameSite: 'strict',
  path: '/'
};

const accessTokenCookieOptions = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: 'strict',
  path: '/',
  maxAge: 15 * 60 * 1000
};

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      connectSrc: ["'self'", ...ALLOWED_ORIGINS]
    }
  },
  referrerPolicy: { policy: 'no-referrer' },
  frameguard: { action: 'sameorigin' },
  xssFilter: false
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin denied'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

app.use(cookieParser());
app.use(bodyParser.json({ limit: BODY_LIMIT }));

const csrfProtection = csurf({ cookie: csrfSecretCookieOptions });

function shouldSkipCsrf(pathname) {
  return [
    '/auth/login',
    '/auth/self-register',
    '/auth/refresh',
    '/auth/csrf'
  ].includes(String(pathname || ''));
}

app.use((req, res, next) => {
  if (shouldSkipCsrf(req.path)) return next();
  const hasCookieSession = Boolean(req.cookies?.access_token);
  if (!hasCookieSession) return next();

  return csrfProtection(req, res, next);
});

function publishCsrfToken(req, res) {
  const csrfToken = req.csrfToken();
  res.cookie('csrf_token', csrfToken, csrfCookieOptions);
  res.setHeader('X-CSRF-Token', csrfToken);
  return csrfToken;
}

const authLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente mais tarde.' }
});

const loginLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde e tente novamente.' }
});

const OFFLINE_TODO_THRESHOLD_MS = 12 * 60 * 60 * 1000;
const DEFAULT_TECHNICIAN_HOURLY_RATE = Number(process.env.DEFAULT_TECHNICIAN_HOURLY_RATE || 90);
const SLA_AUTOMATION_INTERVAL_MS = 15 * 60 * 1000;
const PREVENTIVE_LOOKBACK_DAYS = 45;
const PREVENTIVE_TELEMETRY_LOOKBACK_HOURS = 72;
const MAX_PREVENTIVE_PER_DAY = Number(process.env.MAX_PREVENTIVE_PER_DAY || 2);
const PREVENTIVE_LEARNING_DAYS = Math.max(0, Number(process.env.PREVENTIVE_LEARNING_DAYS || 30));
const PREVENTIVE_LEARNING_START = process.env.PREVENTIVE_LEARNING_START || '2026-03-13';
const CONTRACT_NOTIFY_THRESHOLDS_DAYS = [15, 5];
const CONTRACT_TOTAL_CYCLE_SLOTS = Number(process.env.CONTRACT_TOTAL_CYCLE_SLOTS || 3);
let preventiveLearningLastLogKey = null;

function normalizeUserRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (['comercial', 'commercial', 'sales'].includes(normalized)) return 'comercial';
  return 'user';
}

function calculateTicketCost(ticket) {
  const timeSpentMinutes = Number(ticket?.timeSpentMinutes) || 0;
  const laborCost = Number(((timeSpentMinutes / 60) * DEFAULT_TECHNICIAN_HOURLY_RATE).toFixed(2));
  const actualCost = ticket?.actualCost == null ? null : Number(ticket.actualCost);
  const totalCost = actualCost != null && Number.isFinite(actualCost) ? actualCost : laborCost;

  return {
    laborCost,
    totalCost: Number.isFinite(totalCost) ? Number(totalCost.toFixed(2)) : 0,
    usesActualCost: actualCost != null && Number.isFinite(actualCost)
  };
}

function getTicketSlaHours(ticket) {
  if (ticket.status === 'waiting_part') {
    return ticket.priority === 'critical' ? 12 : ticket.priority === 'high' ? 24 : ticket.priority === 'medium' ? 48 : 72;
  }

  if (ticket.priority === 'critical') return 2;
  if (ticket.priority === 'high') return 6;
  if (ticket.priority === 'medium') return 24;
  return 48;
}

function formatHoursDuration(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return '0h';
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function normalizeScheduleDate(date) {
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
}

function getPositiveInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

function parseNumericIdParam(req, res, name = 'id') {
  const value = Number.parseInt(String(req.params?.[name] ?? ''), 10);
  if (!Number.isInteger(value) || value <= 0) {
    res.status(400).json({ error: `Parâmetro ${name} inválido` });
    return null;
  }
  return value;
}

function getPreventiveLearningStatus(now = new Date()) {
  if (!PREVENTIVE_LEARNING_DAYS) {
    return {
      enabled: false,
      active: false,
      startDate: null,
      endDate: null,
      remainingDays: 0,
      progressPct: 100
    };
  }

  const parsedStart = new Date(PREVENTIVE_LEARNING_START);
  if (Number.isNaN(parsedStart.getTime())) {
    return {
      enabled: true,
      active: false,
      startDate: PREVENTIVE_LEARNING_START,
      endDate: null,
      remainingDays: 0,
      progressPct: 100,
      invalidStartDate: true
    };
  }

  const windowMs = PREVENTIVE_LEARNING_DAYS * 24 * 60 * 60 * 1000;
  const endDate = new Date(parsedStart.getTime() + windowMs);
  const remainingMs = endDate.getTime() - now.getTime();
  const active = remainingMs > 0;
  const elapsedMs = Math.max(0, now.getTime() - parsedStart.getTime());
  const progressPct = Math.max(0, Math.min(100, Math.round((elapsedMs / windowMs) * 100)));

  return {
    enabled: true,
    active,
    startDate: parsedStart.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    remainingDays: active ? Math.ceil(remainingMs / (24 * 60 * 60 * 1000)) : 0,
    progressPct
  };
}

// ===== SELF-REGISTER HELPERS =====
const selfRegisterAttempts = new Map();
function checkRegisterRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const attempts = (selfRegisterAttempts.get(ip) || []).filter(t => now - t < windowMs);
  if (attempts.length >= 5) return false;
  attempts.push(now);
  selfRegisterAttempts.set(ip, attempts);
  return true;
}

function validateCPF(cpf) {
  const n = cpf.replace(/\D/g, '');
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(n[i]) * (10 - i);
  let d1 = (sum * 10) % 11; if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(n[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(n[i]) * (11 - i);
  let d2 = (sum * 10) % 11; if (d2 >= 10) d2 = 0;
  return d2 === parseInt(n[10]);
}

function validatePasswordStrength(password) {
  return password.length >= 12
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /[0-9]/.test(password)
    && /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/]/.test(password);
}

function hashTokenValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function createAccessToken(user) {
  const tokenVersion = Number(user?.tokenVersion || 0);
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: normalizeUserRole(user.role), tokenVersion, type: 'access' },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function createRefreshToken(user) {
  const tokenVersion = Number(user?.tokenVersion || 0);
  return jwt.sign(
    { id: user.id, tokenVersion, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL }
  );
}

async function establishSession(res, user) {
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);
  await user.update({ refreshTokenHash: hashTokenValue(refreshToken) });
  res.cookie('access_token', accessToken, accessTokenCookieOptions);
  res.cookie('refresh_token', refreshToken, refreshTokenCookieOptions);
  return accessToken;
}

function clearSessionCookies(res) {
  res.clearCookie('access_token', { ...accessTokenCookieOptions, maxAge: undefined });
  res.clearCookie('refresh_token', { ...refreshTokenCookieOptions, maxAge: undefined });
  res.clearCookie('_csrf', { ...csrfSecretClearCookieOptions, maxAge: undefined });
  res.clearCookie('csrf_token', { ...csrfCookieOptions, maxAge: undefined });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function sanitizeUsernameCandidate(value) {
  return (value || '').toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

function normalizePersonName(value) {
  const cleaned = String(value || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return null;
  return cleaned
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function deriveNamesFromIdentifier(identifier) {
  const base = String(identifier || '').split('@')[0];
  const parts = base
    .replace(/[^a-zA-Z0-9._-]/g, ' ')
    .split(/[._\-\s]+/)
    .map((part) => normalizePersonName(part))
    .filter(Boolean);

  if (!parts.length) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
}

async function generateUniqueEmailFromBase(baseName, domain = 'intermidia.local') {
  const base = sanitizeUsernameCandidate(baseName) || 'user';
  let candidate = `${base}@${domain}`;
  let counter = 1;

  while (await User.findOne({ where: { email: candidate } })) {
    candidate = `${base}${counter++}@${domain}`;
  }

  return candidate;
}

async function generateUniqueUsername(email, fallback = 'user') {
  let base = sanitizeUsernameCandidate((email || '').split('@')[0]);
  if (!base) {
    base = sanitizeUsernameCandidate(fallback) || 'user';
  }

  let candidate = base;
  let counter = 1;
  while (await User.findOne({ where: { username: candidate } })) {
    candidate = `${base}${counter++}`;
  }
  return candidate;
}

async function getApprovedRegistrationPhotoByEmail(email) {
  const normalizedEmail = normalizeEmail(email || '');
  if (!normalizedEmail) return null;

  const reg = await TechRegistration.findOne({
    where: { status: 'approved', email: normalizedEmail },
    attributes: ['photoData']
  });

  return reg?.photoData || null;
}

// Initialize database
sequelize.sync().then(async () => {
  await sequelize.query('PRAGMA journal_mode = WAL;');
  await sequelize.query('PRAGMA busy_timeout = 5000;');
  await sequelize.query('PRAGMA foreign_keys = ON;');
  await ensureScreenColumns();
  await ensureUserColumns();
  await ensureTicketColumns();
  await ensureContractColumns();
  await ensureNotificationConfigColumns();
  console.log('Database synced');
  bootstrapAdmin();
  setTimeout(() => {
    runOperationalAutomation().catch((err) => console.error('Initial automation error:', err.message));
    setInterval(() => {
      runOperationalAutomation().catch((err) => console.error('Automation interval error:', err.message));
    }, SLA_AUTOMATION_INTERVAL_MS);
  }, 10000);

  // Backup on startup
  backup.createBackup('startup');

  // Scheduled backup every 6 hours
  setInterval(() => {
    backup.createBackup('scheduled');
  }, 6 * 60 * 60 * 1000);
}).catch(err => console.error('Database sync error:', err));

async function ensureScreenColumns() {
  try {
    const queryInterface = sequelize.getQueryInterface();
    const tableDefinition = await queryInterface.describeTable('screens');
    
    // Add contact column if missing
    if (!tableDefinition.contact) {
      await queryInterface.addColumn('screens', 'contact', {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: ''
      });
    }
    
    // Add priority column if missing
    if (!tableDefinition.priority) {
      await queryInterface.addColumn('screens', 'priority', {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'medium'
      });
    }

    // Add originId column if missing
    if (!tableDefinition.originId) {
      await queryInterface.addColumn('screens', 'originId', {
        type: DataTypes.INTEGER,
        allowNull: true
      });
      // Create unique index separately (SQLite doesn't support UNIQUE in ALTER TABLE)
      try {
        await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS screens_origin_id ON screens (originId) WHERE originId IS NOT NULL');
      } catch (e) { /* index may already exist */ }
    }

    // Add stats column if missing
    if (!tableDefinition.stats) {
      await queryInterface.addColumn('screens', 'stats', {
        type: DataTypes.TEXT,
        allowNull: true
      });
    }

    // Add orientation column if missing
    if (!tableDefinition.orientation) {
      await queryInterface.addColumn('screens', 'orientation', {
        type: DataTypes.STRING,
        allowNull: true
      });
    }

    // Add favorite column if missing
    if (!tableDefinition.favorite) {
      await queryInterface.addColumn('screens', 'favorite', {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      });
    }

    // Add assignedTo column if missing
    if (!tableDefinition.assignedTo) {
      await queryInterface.addColumn('screens', 'assignedTo', {
        type: DataTypes.STRING,
        allowNull: true
      });
    }

    // Add latitude/longitude columns if missing
    if (!tableDefinition.latitude) {
      await queryInterface.addColumn('screens', 'latitude', { type: DataTypes.FLOAT, allowNull: true });
    }
    if (!tableDefinition.longitude) {
      await queryInterface.addColumn('screens', 'longitude', { type: DataTypes.FLOAT, allowNull: true });
    }
  } catch (err) {
    console.error('Failed to ensure screens columns:', err.message);
  }
}

async function ensureUserColumns() {
  try {
    const queryInterface = sequelize.getQueryInterface();
    const tableDefinition = await queryInterface.describeTable('users');

    if (!tableDefinition.active) {
      await queryInterface.addColumn('users', 'active', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }

    if (!tableDefinition.email) {
      await queryInterface.addColumn('users', 'email', {
        type: DataTypes.STRING,
        allowNull: true
      });
      try {
        await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email) WHERE email IS NOT NULL');
      } catch (e) { /* index may already exist */ }
    }

    if (!tableDefinition.tokenVersion) {
      await queryInterface.addColumn('users', 'tokenVersion', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
    }

    if (!tableDefinition.refreshTokenHash) {
      await queryInterface.addColumn('users', 'refreshTokenHash', {
        type: DataTypes.STRING,
        allowNull: true
      });
    }

    if (!tableDefinition.firstName) {
      await queryInterface.addColumn('users', 'firstName', {
        type: DataTypes.STRING,
        allowNull: true
      });
    }

    if (!tableDefinition.lastName) {
      await queryInterface.addColumn('users', 'lastName', {
        type: DataTypes.STRING,
        allowNull: true
      });
    }

    const usersWithoutEmail = await User.findAll({ where: { email: null } });
    for (const user of usersWithoutEmail) {
      if (user.username && user.username.includes('@')) {
        const candidate = normalizeEmail(user.username);
        const taken = await User.findOne({ where: { email: candidate } });
        if (!taken) {
          await user.update({ email: candidate });
          continue;
        }
      }

      const reg = await TechRegistration.findOne({ where: { status: 'approved', passwordHash: user.passwordHash } });
      if (reg?.email) {
        const candidate = normalizeEmail(reg.email);
        const taken = await User.findOne({ where: { email: candidate } });
        if (!taken || taken.id === user.id) {
          await user.update({ email: candidate });
          continue;
        }
      }

      const fallbackEmail = await generateUniqueEmailFromBase(user.username || user.role || 'user');
      await user.update({ email: fallbackEmail });
    }

    // Normalize legacy role values (e.g. ADMIN/Admin) to prevent access issues.
    const allUsers = await User.findAll();
    for (const user of allUsers) {
      const updates = {};

      const normalizedRole = normalizeUserRole(user.role);
      if (user.role !== normalizedRole) {
        updates.role = normalizedRole;
      }

      if (!user.firstName && !user.lastName) {
        const regByEmail = user.email
          ? await TechRegistration.findOne({ where: { status: 'approved', email: normalizeEmail(user.email) } })
          : null;

        if (regByEmail?.firstName) {
          updates.firstName = normalizePersonName(regByEmail.firstName);
          updates.lastName = normalizePersonName(regByEmail.lastName);
        } else {
          const derived = deriveNamesFromIdentifier(user.username || user.email);
          updates.firstName = derived.firstName;
          updates.lastName = derived.lastName;
        }
      } else {
        if (user.firstName) updates.firstName = normalizePersonName(user.firstName);
        if (user.lastName) updates.lastName = normalizePersonName(user.lastName);
      }

      if (Object.keys(updates).length) {
        await user.update(updates);
      }
    }
  } catch (err) {
    console.error('Failed to ensure users columns:', err.message);
  }
}

async function ensureTicketColumns() {
  try {
    const queryInterface = sequelize.getQueryInterface();
    const tableDefinition = await queryInterface.describeTable('tickets');

    if (!tableDefinition.actualCost) {
      await queryInterface.addColumn('tickets', 'actualCost', {
        type: DataTypes.FLOAT,
        allowNull: true
      });
    }

    if (!tableDefinition.slaEscalatedAt) {
      await queryInterface.addColumn('tickets', 'slaEscalatedAt', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }
  } catch (err) {
    console.error('Failed to ensure tickets columns:', err.message);
  }
}

async function ensureContractColumns() {
  try {
    const queryInterface = sequelize.getQueryInterface();
    const tableDefinition = await queryInterface.describeTable('contracts');

    if (!tableDefinition.notified15d_at) {
      await queryInterface.addColumn('contracts', 'notified15d_at', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }

    if (!tableDefinition.notified5d_at) {
      await queryInterface.addColumn('contracts', 'notified5d_at', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }

    if (!tableDefinition.sales_follow_up_status) {
      await queryInterface.addColumn('contracts', 'sales_follow_up_status', {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending'
      });
    }

    if (!tableDefinition.sales_contacted_at) {
      await queryInterface.addColumn('contracts', 'sales_contacted_at', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }

    if (!tableDefinition.sales_outcome_at) {
      await queryInterface.addColumn('contracts', 'sales_outcome_at', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }

    if (!tableDefinition.sales_updated_by) {
      await queryInterface.addColumn('contracts', 'sales_updated_by', {
        type: DataTypes.STRING,
        allowNull: true
      });
    }

    // Backfill values from mistakenly created camelCase columns, if they exist.
    if (tableDefinition.notified15dAt) {
      await sequelize.query('UPDATE contracts SET notified15d_at = COALESCE(notified15d_at, notified15dAt)');
    }
    if (tableDefinition.notified5dAt) {
      await sequelize.query('UPDATE contracts SET notified5d_at = COALESCE(notified5d_at, notified5dAt)');
    }
    if (tableDefinition.salesFollowUpStatus) {
      await sequelize.query('UPDATE contracts SET sales_follow_up_status = COALESCE(sales_follow_up_status, salesFollowUpStatus, "pending")');
    }
    if (tableDefinition.salesContactedAt) {
      await sequelize.query('UPDATE contracts SET sales_contacted_at = COALESCE(sales_contacted_at, salesContactedAt)');
    }
    if (tableDefinition.salesOutcomeAt) {
      await sequelize.query('UPDATE contracts SET sales_outcome_at = COALESCE(sales_outcome_at, salesOutcomeAt)');
    }
    if (tableDefinition.salesUpdatedBy) {
      await sequelize.query('UPDATE contracts SET sales_updated_by = COALESCE(sales_updated_by, salesUpdatedBy)');
    }

    await sequelize.query("UPDATE contracts SET sales_follow_up_status = 'pending' WHERE sales_follow_up_status IS NULL OR sales_follow_up_status = ''");
  } catch (err) {
    console.error('Failed to ensure contracts columns:', err.message);
  }
}

async function ensureNotificationConfigColumns() {
  try {
    const queryInterface = sequelize.getQueryInterface();
    const tableDefinition = await queryInterface.describeTable('notification_configs');
    if (!tableDefinition.checkinLocationTypes) {
      await queryInterface.addColumn('notification_configs', 'checkinLocationTypes', {
        type: DataTypes.TEXT,
        allowNull: true
      });
    }
    if (!tableDefinition.checkinLocations) {
      await queryInterface.addColumn('notification_configs', 'checkinLocations', {
        type: DataTypes.TEXT,
        allowNull: true
      });
    }
    if (!tableDefinition.checkinLocationsUpdatedAt) {
      await queryInterface.addColumn('notification_configs', 'checkinLocationsUpdatedAt', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }
  } catch (err) {
    console.error('Failed to ensure notification_configs columns:', err.message);
  }
}

// Audit log helper
async function logAudit(req, action, entity, entityId, details) {
  try {
    await AuditLog.create({
      userId: req.user?.id || null,
      username: req.user?.username || 'system',
      action, entity, entityId,
      details: typeof details === 'string' ? details : JSON.stringify(details),
      ip: req.ip || req.connection?.remoteAddress
    });
  } catch (e) { /* silent */ }
}

async function ensureScreenContactColumn() {
  // Kept for backward compatibility, actual logic moved to ensureScreenColumns
}

// ===== WHATSAPP / NOTIFICATION HELPER =====
async function sendNotification(message, specificPhone) {
  try {
    let config = await NotificationConfig.findOne();
    if (!config || !config.whatsappEnabled || !config.whatsappApiUrl || !config.whatsappApiKey) return;
    const phones = [];
    if (specificPhone) {
      phones.push(specificPhone);
    } else {
      if (config.whatsappDefaultPhone) phones.push(config.whatsappDefaultPhone);
      const contacts = JSON.parse(config.technicianContacts || '[]');
      contacts.forEach(c => { if (c.phone && !phones.includes(c.phone)) phones.push(c.phone); });
    }
    for (const phone of phones) {
      try {
        // Format phone: ensure country code (55 for Brazil)
        let cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length <= 11) cleanPhone = '55' + cleanPhone;

        // Evolution API format
        await axios.post(config.whatsappApiUrl, {
          number: cleanPhone,
          text: message
        }, { headers: { 'apikey': config.whatsappApiKey, 'Content-Type': 'application/json' }, timeout: 10000 });
        console.log(`Notification sent to ${phone}`);
      } catch (e) { console.error(`Failed to send to ${phone}:`, e.response?.data || e.message); }
    }
  } catch (e) { console.error('Notification error:', e.message); }
}

async function createOperationalAlert({ screenId, title, message, severity = 'warning' }) {
  if (!screenId) return null;

  const existing = await Alert.findOne({
    where: { screenId, type: 'custom', title, dismissed: false }
  });

  if (existing) {
    await existing.update({ message, severity, read: false });
    return existing;
  }

  return Alert.create({
    screenId,
    type: 'custom',
    title,
    message,
    severity,
    read: false,
    dismissed: false
  });
}

async function notifyIfConfigured(message, severity = 'warning') {
  const config = await NotificationConfig.findOne();
  if (!config?.whatsappEnabled) return;
  if (severity === 'critical' && !config.notifyOnAlertCritical) return;
  if (severity === 'warning' && !config.notifyOnAlertWarning) return;
  await sendNotification(message);
}

async function processTicketSlaEscalations() {
  const tickets = await Ticket.findAll({
    where: {
      status: { [Op.in]: ['open', 'in_progress', 'waiting_part'] }
    },
    include: [{ model: Screen, attributes: ['id', 'name', 'location', 'address', 'priority'] }],
    order: [['createdAt', 'ASC']]
  });

  for (const ticket of tickets) {
    if (ticket.slaEscalatedAt) continue;

    const slaHours = getTicketSlaHours(ticket);
    const ageHours = (Date.now() - new Date(ticket.createdAt).getTime()) / (1000 * 60 * 60);
    if (ageHours < slaHours) continue;

    const severity = ticket.priority === 'critical' || ticket.priority === 'high' ? 'critical' : 'warning';
    const screenName = ticket.Screen?.name || ticket.location || 'Tela sem vínculo';
    const title = `SLA estourado no ticket #${ticket.id}`;
    const message = `Ticket "${ticket.title}" está em ${ticket.status} há ${formatHoursDuration(ageHours)}. SLA alvo: ${formatHoursDuration(slaHours)}. Tela/local: ${screenName}.`;

    await createOperationalAlert({ screenId: ticket.screenId || ticket.Screen?.id, title, message, severity });
    await ticket.update({ slaEscalatedAt: new Date() });
    await notifyIfConfigured(`⏰ *SLA ESTOURADO*\n\n🎫 Ticket #${ticket.id}: ${ticket.title}\n🖥️ ${screenName}\n📌 Status: ${ticket.status}\n⚠️ Atraso: ${formatHoursDuration(ageHours)} (SLA ${formatHoursDuration(slaHours)})${ticket.assignedTo ? `\n👤 Responsável: ${ticket.assignedTo}` : ''}`, severity);
  }
}

async function processPreventiveSchedules() {
  const learningStatus = getPreventiveLearningStatus();
  if (learningStatus.active) {
    const pendingAutoSchedules = await Schedule.findAll({
      where: {
        status: 'scheduled',
        createdBy: 'system',
        title: { [Op.like]: 'Preventiva automática%' }
      }
    });

    if (pendingAutoSchedules.length) {
      const scheduleIds = pendingAutoSchedules.map((item) => item.id);
      await Schedule.update(
        { status: 'cancelled' },
        { where: { id: { [Op.in]: scheduleIds } } }
      );
      console.log(`Preventive learning mode: cancelled ${pendingAutoSchedules.length} automatic preventive schedule(s).`);
    }

    const logKey = `${learningStatus.startDate}-${learningStatus.endDate}-${learningStatus.remainingDays}`;
    if (preventiveLearningLastLogKey !== logKey) {
      console.log(`Preventive automation paused (learning mode). Remaining: ${learningStatus.remainingDays} day(s). Start: ${learningStatus.startDate}. End: ${learningStatus.endDate}.`);
      preventiveLearningLastLogKey = logKey;
    }
    return;
  }

  const ticketSince = new Date(Date.now() - PREVENTIVE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const telemetrySince = new Date(Date.now() - PREVENTIVE_TELEMETRY_LOOKBACK_HOURS * 60 * 60 * 1000);
  const screens = await Screen.findAll({ where: { status: { [Op.notIn]: ['static', 'not_installed'] } } });

  // Collect all screens that need a preventive visit (skip those already scheduled)
  const candidates = [];
  for (const screen of screens) {
    const existingSchedule = await Schedule.findOne({
      where: {
        screenId: screen.id,
        status: { [Op.in]: ['scheduled', 'in_progress'] },
        title: { [Op.like]: 'Preventiva automática%' }
      }
    });
    if (existingSchedule) continue;

    const recentTickets = await Ticket.findAll({
      where: { screenId: screen.id, createdAt: { [Op.gte]: ticketSince } },
      order: [['createdAt', 'DESC']]
    });

    const snapshots = await TelemetrySnapshot.findAll({
      where: { screenId: screen.id, createdAt: { [Op.gte]: telemetrySince } },
      order: [['createdAt', 'DESC']]
    });

    const reasons = [];
    const categoryCounts = recentTickets.reduce((acc, ticket) => {
      acc[ticket.category] = (acc[ticket.category] || 0) + 1;
      return acc;
    }, {});

    if (recentTickets.length >= 3) {
      reasons.push(`${recentTickets.length} tickets nos últimos ${PREVENTIVE_LOOKBACK_DAYS} dias`);
    }

    const recurringCategory = Object.entries(categoryCounts).find(([, count]) => count >= 2);
    if (recurringCategory) {
      reasons.push(`recorrência na categoria ${recurringCategory[0]}`);
    }

    const isCritical = snapshots.some((s) => Number(s.cpuTemp) >= 80 || Number(s.diskPct) >= 85 || Number(s.cpuUsage) >= 90);
    if (snapshots.some((s) => Number(s.cpuTemp) >= 80)) reasons.push('temperatura crítica de player');
    if (snapshots.some((s) => Number(s.diskPct) >= 85)) reasons.push('disco em nível crítico');
    if (snapshots.some((s) => Number(s.cpuUsage) >= 90)) reasons.push('CPU sustentada em nível crítico');

    if (!reasons.length) continue;

    candidates.push({ screen, reasons, isCritical });
  }

  if (!candidates.length) return;

  // Sort: critical screens first, then by number of reasons descending
  candidates.sort((a, b) => {
    if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
    return b.reasons.length - a.reasons.length;
  });

  // Spread across days: MAX_PREVENTIVE_PER_DAY visits per day starting from baseOffsetDays
  // Critical triggers start next day (baseOffsetDays=1), others start in 3 days
  const hasCritical = candidates.some((c) => c.isCritical);
  const baseOffsetDays = hasCritical ? 1 : 3;

  for (let i = 0; i < candidates.length; i++) {
    const { screen, reasons } = candidates[i];
    const dayOffset = baseOffsetDays + Math.floor(i / MAX_PREVENTIVE_PER_DAY);
    const scheduledDate = normalizeScheduleDate(new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000));
    const description = `Gerado automaticamente pelo sistema com base em padrão operacional: ${reasons.join(', ')}.`;

    const schedule = await Schedule.create({
      screenId: screen.id,
      title: `Preventiva automática - ${screen.name}`,
      description,
      scheduledDate,
      assignedTo: null,
      location: screen.address || screen.location || null,
      city: null,
      recurrence: 'none',
      color: '#0ea5e9',
      createdBy: 'system'
    });

    await createOperationalAlert({
      screenId: screen.id,
      title: `Preventiva criada para ${screen.name}`,
      message: `Agendamento automático #${schedule.id} criado para ${scheduledDate}. Motivos: ${reasons.join(', ')}.`,
      severity: 'warning'
    });

    await notifyIfConfigured(`🛠️ *PREVENTIVA AUTOMÁTICA*\n\n🖥️ ${screen.name}\n📍 ${screen.address || screen.location || 'Local não informado'}\n📆 ${new Date(`${scheduledDate}T12:00:00`).toLocaleDateString('pt-BR')}\n📌 Motivos: ${reasons.join(', ')}`, 'warning');
  }
}

async function runOperationalAutomation() {
  await processTicketSlaEscalations();
  await processPreventiveSchedules();
}

app.get('/operational/preventive-status', authenticateToken, async (req, res) => {
  try {
    const learning = getPreventiveLearningStatus();
    const pendingPreventive = await Schedule.count({
      where: {
        status: { [Op.in]: ['scheduled', 'in_progress'] },
        title: { [Op.like]: 'Preventiva automática%' }
      }
    });

    res.json({
      automation: {
        maxPreventivePerDay: MAX_PREVENTIVE_PER_DAY,
        lookbackDays: PREVENTIVE_LOOKBACK_DAYS,
        telemetryLookbackHours: PREVENTIVE_TELEMETRY_LOOKBACK_HOURS
      },
      learning,
      pendingPreventive
    });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao consultar status da preventiva' });
  }
});

async function bootstrapAdmin() {
  try {
    const adminCount = await User.count({ where: { role: 'admin' } });
    if (adminCount > 0) return;

    const username = process.env.DEFAULT_ADMIN_USERNAME;
    const email = normalizeEmail(process.env.DEFAULT_ADMIN_EMAIL || '');
    const password = process.env.DEFAULT_ADMIN_PASSWORD;

    if (!username || !email || !password) {
      throw new Error('Missing DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_EMAIL or DEFAULT_ADMIN_PASSWORD for initial admin bootstrap');
    }

    if (!validatePasswordStrength(password)) {
      throw new Error('DEFAULT_ADMIN_PASSWORD does not meet password policy requirements');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await User.create({ username, email, passwordHash, role: 'admin' });
    console.log(`Default admin created: ${email}`);
  } catch (err) {
    console.error('Failed to bootstrap default admin:', err.message);
  }
}

const loginSchema = z.object({
  email: z.string().trim().email().optional(),
  username: z.string().trim().min(1).optional(),
  password: z.string().min(1)
}).refine((value) => Boolean(value.email || value.username), {
  message: 'E-mail ou usuário é obrigatório'
});

const registerSchema = z.object({
  username: z.string().trim().min(3).max(40).optional(),
  email: z.string().trim().email(),
  password: z.string().min(12),
  role: z.enum(['admin', 'user', 'comercial']).optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(120).optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12)
});

app.post('/auth/login', loginLimiter, authLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload de login inválido' });
    }

    const { email, username, password } = parsed.data;
    const identifier = normalizeEmail(email || username);
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Preencha e-mail e senha' });
    }

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { email: identifier },
          { username: identifier }
        ]
      }
    });
    if (!user) {
      await logAudit({ ip: req.ip, user: { username: identifier } }, 'login-failed', 'auth', null, { reason: 'user-not-found', identifier });
      return res.status(401).json({ error: 'E-mail ou senha incorreto' });
    }

    if (user.active === false) {
      await logAudit({ ip: req.ip, user: { id: user.id, username: user.username } }, 'login-failed', 'auth', user.id, { reason: 'user-inactive' });
      return res.status(403).json({ error: 'Usuário desativado. Fale com um administrador.' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      await logAudit({ ip: req.ip, user: { id: user.id, username: user.username } }, 'login-failed', 'auth', user.id, { reason: 'invalid-password' });
      return res.status(401).json({ error: 'E-mail ou senha incorreto' });
    }

    const token = await establishSession(res, user);
    const photoData = await getApprovedRegistrationPhotoByEmail(user.email);
    await logAudit({ ip: req.ip, user: { id: user.id, username: user.username } }, 'login-success', 'auth', user.id, { role: normalizeUserRole(user.role) });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        photoData,
        role: normalizeUserRole(user.role)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'role']
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const photoData = await getApprovedRegistrationPhotoByEmail(user.email);

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      photoData,
      role: normalizeUserRole(user.role)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/auth/register', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos para cadastro de usuário.' });
    }

    const { username, email, password, role, firstName, lastName } = parsed.data;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }

    const normalizedRole = normalizeUserRole(role);
    const existingEmail = await User.findOne({ where: { email: normalizedEmail } });
    if (existingEmail) {
      return res.status(409).json({ error: 'E-mail já cadastrado' });
    }

    const preferredUsername = sanitizeUsernameCandidate(username);
    const resolvedUsername = preferredUsername
      ? (await (async () => {
        let candidate = preferredUsername;
        let counter = 1;
        while (await User.findOne({ where: { username: candidate } })) {
          candidate = `${preferredUsername}${counter++}`;
        }
        return candidate;
      })())
      : await generateUniqueUsername(
        normalizedEmail,
        normalizedRole === 'admin' ? 'admin' : normalizedRole === 'comercial' ? 'comercial' : 'user'
      );

    if (!validatePasswordStrength(password)) {
      return res.status(400).json({ error: 'Senha fraca. Use no mínimo 12 caracteres com maiúscula, minúscula, número e símbolo.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const derivedNames = deriveNamesFromIdentifier(resolvedUsername || normalizedEmail);
    const newUser = await User.create({
      username: resolvedUsername,
      email: normalizedEmail,
      firstName: normalizePersonName(firstName) || derivedNames.firstName,
      lastName: normalizePersonName(lastName) || derivedNames.lastName,
      passwordHash,
      role: normalizedRole,
      active: true
    });

    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      role: newUser.role
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos para troca de senha.' });
    }

    const { currentPassword, newPassword } = parsed.data;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (!validatePasswordStrength(newPassword)) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 12 caracteres e incluir maiúscula, minúscula, número e símbolo.' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      return res.status(401).json({ error: 'Current password is invalid' });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await user.update({ passwordHash, tokenVersion: Number(user.tokenVersion || 0) + 1, refreshTokenHash: null });
    clearSessionCookies(res);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/auth/refresh', authLimiter, async (req, res) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token ausente' });

    const payload = jwt.verify(refreshToken, JWT_SECRET);
    if (payload?.type !== 'refresh') return res.status(401).json({ error: 'Refresh token inválido' });

    const user = await User.findByPk(payload.id);
    if (!user || user.active === false) return res.status(401).json({ error: 'Usuário inválido' });

    if (Number(user.tokenVersion || 0) !== Number(payload.tokenVersion || 0)) {
      clearSessionCookies(res);
      return res.status(401).json({ error: 'Sessão expirada' });
    }

    const hashed = hashTokenValue(refreshToken);
    if (!user.refreshTokenHash || user.refreshTokenHash !== hashed) {
      clearSessionCookies(res);
      return res.status(401).json({ error: 'Refresh token revogado' });
    }

    await establishSession(res, user);
    return res.json({ success: true });
  } catch (err) {
    clearSessionCookies(res);
    return res.status(401).json({ error: 'Falha ao renovar sessão' });
  }
});

app.post('/auth/logout', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (user) {
      await user.update({ tokenVersion: Number(user.tokenVersion || 0) + 1, refreshTokenHash: null });
    }
    clearSessionCookies(res);
    await logAudit(req, 'logout', 'auth', req.user?.id || null, { success: true });
    return res.json({ success: true });
  } catch (err) {
    clearSessionCookies(res);
    return res.status(500).json({ error: 'Falha ao encerrar sessão' });
  }
});

app.get('/auth/csrf', csrfProtection, (req, res) => {
  const csrfToken = publishCsrfToken(req, res);
  return res.json({ csrfToken });
});

// ===== SELF-REGISTER (public) =====
app.post('/auth/self-register', authLimiter, async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    if (!checkRegisterRateLimit(ip)) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde 1 hora e tente novamente.' });
    }

    const { firstName, lastName, cpf, email, password, photoData } = req.body;
    if (!firstName?.trim() || !lastName?.trim() || !cpf || !email || !password) {
      return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
    }

    if (!validateCPF(cpf)) {
      return res.status(400).json({ error: 'CPF inválido.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }

    if (!validatePasswordStrength(password)) {
      return res.status(400).json({ error: 'Senha fraca. Use no mínimo 12 caracteres com maiúscula, minúscula, número e símbolo.' });
    }

    const cpfClean = cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    const existing = await TechRegistration.findOne({ where: { cpf: cpfClean } });
    if (existing) {
      return res.status(409).json({ error: 'Este CPF já possui uma solicitação registrada.' });
    }
    const normalizedEmail = normalizeEmail(email);
    const existingEmail = await TechRegistration.findOne({ where: { email: normalizedEmail } });
    if (existingEmail) {
      return res.status(409).json({ error: 'Este e-mail já possui uma solicitação registrada.' });
    }

    const existingUserEmail = await User.findOne({ where: { email: normalizedEmail } });
    if (existingUserEmail) {
      return res.status(409).json({ error: 'Este e-mail já está em uso no sistema.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await TechRegistration.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      cpf: cpfClean,
      email: normalizedEmail,
      passwordHash,
      photoData: photoData || null,
      status: 'pending'
    });

    // Notify admins
    const nConfig = await NotificationConfig.findOne();
    if (nConfig?.whatsappEnabled) {
      sendNotification(`🆕 *NOVA SOLICITAÇÃO DE ACESSO*\n\n👤 ${firstName.trim()} ${lastName.trim()}\n📧 ${email}\n\nAcesse o sistema para aprovar ou rejeitar.`);
    }

    res.status(201).json({ success: true, message: 'Solicitação enviada. Aguarde aprovação do administrador.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== ADMIN: LIST REGISTRATIONS =====
app.get('/admin/registrations', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const status = z.enum(['pending', 'approved', 'rejected', 'all']).catch('pending').parse(req.query.status || 'pending');
    const where = status === 'all' ? {} : { status };
    const regs = await TechRegistration.findAll({ where, order: [['createdAt', 'DESC']] });
    // Never return passwordHash
    res.json(regs.map(r => ({
      id: r.id, firstName: r.firstName, lastName: r.lastName,
      cpf: r.cpf, email: r.email, photoData: r.photoData,
      status: r.status, rejectionReason: r.rejectionReason,
      reviewedAt: r.reviewedAt, reviewedBy: r.reviewedBy,
      createdAt: r.createdAt
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== ADMIN: APPROVE REGISTRATION =====
app.post('/admin/registrations/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const reg = await TechRegistration.findByPk(req.params.id);
    if (!reg || reg.status !== 'pending') return res.status(400).json({ error: 'Solicitação não encontrada ou já processada.' });

    const email = normalizeEmail(reg.email);
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'Já existe usuário ativo com este e-mail.' });
    }

    const username = await generateUniqueUsername(email, reg.firstName);
    const newUser = await User.create({
      username,
      email,
      firstName: normalizePersonName(reg.firstName),
      lastName: normalizePersonName(reg.lastName),
      passwordHash: reg.passwordHash,
      role: 'user',
      active: true
    });
    await reg.update({ status: 'approved', reviewedBy: req.user.username, reviewedAt: new Date() });
    await logAudit(req, 'approve', 'tech_registration', reg.id, { username, email, name: `${reg.firstName} ${reg.lastName}` });
    res.json({ success: true, username, email, userId: newUser.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== ADMIN: REJECT REGISTRATION =====
app.post('/admin/registrations/:id/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const reg = await TechRegistration.findByPk(req.params.id);
    if (!reg || reg.status !== 'pending') return res.status(400).json({ error: 'Solicitação não encontrada ou já processada.' });
    await reg.update({ status: 'rejected', rejectionReason: reason || null, reviewedBy: req.user.username, reviewedAt: new Date() });
    await logAudit(req, 'reject', 'tech_registration', reg.id, { reason, name: `${reg.firstName} ${reg.lastName}` });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get all screens
app.get('/screens', authenticateToken, async (req, res) => {
  try {
    const screens = await Screen.findAll({
      include: [{ model: Note, as: 'Notes' }],
      order: [['id', 'ASC']]
    });
    // Add computed outsideOperatingHours flag
    const result = screens.map(s => {
      const json = s.toJSON();
      json.outsideOperatingHours = !isWithinOperatingHours(s);
      json.totalFlow = (s.flowPeople || 0) + (s.flowVehicles || 0);
      return json;
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single screen
app.get('/screens/:id', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id, {
      include: [{ model: Note, as: 'Notes' }]
    });
    if (!screen) return res.status(404).json({ error: 'Screen not found' });
    res.json(screen);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// helper for logging status transitions
async function logStatusChange(screen, status) {
  try {
    await ScreenEvent.create({ screenId: screen.id, status });
  } catch (e) {
    console.error('Failed to record event', e);
  }
}

// Strip location prefix from monitor name (origin HTML concatenates location + name)
function cleanMonitorName(name, location) {
  if (!name || !location) return name || '';
  if (name.startsWith(location)) {
    const cleaned = name.substring(location.length).trim();
    return cleaned || name; // fallback to original if nothing remains
  }
  return name;
}

// Returns true if a screen is static media (FRONTLIGHT/BACKLIGHT) — no online/offline logic
function isStaticMedia(screen) {
  const name = ((screen.name || '') + ' ' + (screen.location || '')).toUpperCase();
  return name.includes('FRONTLIGHT') || name.includes('BACKLIGHT');
}

// Check if current time is within the screen's operating hours
function isWithinOperatingHours(screen) {
  if (!screen.operatingHoursStart || !screen.operatingHoursEnd) return true; // no hours set = always operating
  
  // Use Brasília timezone (UTC-3)
  const now = new Date();
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentHour = brTime.getHours();
  const currentMinute = brTime.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;
  
  const [startH, startM] = screen.operatingHoursStart.split(':').map(Number);
  const [endH, endM] = screen.operatingHoursEnd.split(':').map(Number);
  const startTime = startH * 60 + (startM || 0);
  const endTime = endH * 60 + (endM || 0);
  
  // Check day of week
  if (screen.operatingDays && screen.operatingDays !== 'all') {
    const dayIndex = brTime.getDay(); // 0=Sun, 1=Mon, ...
    const dayMap = { 'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6 };
    const days = screen.operatingDays;
    let isOperatingDay = true;
    
    if (days === 'mon-fri') isOperatingDay = dayIndex >= 1 && dayIndex <= 5;
    else if (days === 'mon-sat') isOperatingDay = dayIndex >= 1 && dayIndex <= 6;
    else if (days === 'tue-sun') isOperatingDay = dayIndex !== 1; // not Monday
    else if (days === 'tue-sat') isOperatingDay = dayIndex >= 2 && dayIndex <= 6;
    else if (days === 'mon-sun-except-wed') isOperatingDay = dayIndex !== 3;
    
    if (!isOperatingDay) return false;
  }
  
  // 24h operation
  if (startTime === 0 && endTime >= 23 * 60 + 59) return true;
  
  // Handle overnight hours (e.g., 17:30 to 00:30)
  if (endTime < startTime) {
    return currentTime >= startTime || currentTime <= endTime;
  }
  
  return currentTime >= startTime && currentTime <= endTime;
}

async function applyScreenStatus(screen, nextStatus, options = {}) {
  // Don't override origin-managed statuses (static, not_installed) via local heartbeat — unless manual
  if (!options.manual && (screen.status === 'static' || screen.status === 'not_installed')) return { changed: false, screen };
  const { heartbeatAt } = options;
  const updates = {};
  const previousStatus = screen.status;

  if (previousStatus !== nextStatus) {
    updates.status = nextStatus;
  }

  if (heartbeatAt) {
    updates.lastHeartbeat = heartbeatAt;
  }

  if (!Object.keys(updates).length) {
    return { changed: false, screen };
  }

  await screen.update(updates);

  if (previousStatus !== nextStatus) {
    await logStatusChange(screen, nextStatus);
  }

  return { changed: previousStatus !== nextStatus, screen };
}

async function moveToTodoIfOfflineTooLong(screen, now = new Date()) {
  // Disabled: workflow is now fully manual
  return false;
}

// Heartbeat - Display pings to report it's alive (by database ID)
app.post('/screens/:id/heartbeat', async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen) return res.status(404).json({ error: 'Display not found' });

    await applyScreenStatus(screen, 'online', { heartbeatAt: new Date() });
    res.json({ success: true, status: 'online' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Heartbeat - PlayBox format (by displayId)
app.post('/heartbeat/:displayId', async (req, res) => {
  try {
    const screen = await Screen.findOne({ where: { displayId: req.params.displayId } });
    if (!screen) return res.status(404).json({ error: 'Display not found' });

    await applyScreenStatus(screen, 'online', { heartbeatAt: new Date() });
    res.json({ 
      success: true, 
      status: 'online',
      displayId: screen.displayId,
      name: screen.name
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update display URL configuration
app.patch('/screens/:id/config', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen) return res.status(404).json({ error: 'Screen not found' });
    
    if (req.body.displayUrl) {
      await screen.update({ displayUrl: req.body.displayUrl });
    }
    res.json(screen);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Create a new screen
app.post('/screens', authenticateToken, async (req, res) => {
  try {
    const { name, address, displayId, location } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const screen = await Screen.create({
      name,
      address: address || '',
      displayId: displayId || null,
      // use provided location when present, otherwise fallback to name (legacy behavior)
      location: location || name,
      status: 'offline'
    });
    res.status(201).json(screen);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a screen
app.delete('/screens/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen) return res.status(404).json({ error: 'Screen not found' });
    await ScreenEvent.destroy({ where: { screenId: screen.id } });
    await Note.destroy({ where: { screenId: screen.id } });
    await screen.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete all screens (reset data)
app.delete('/screens', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await Note.destroy({ where: {} });
    await ScreenEvent.destroy({ where: {} });
    await Alert.destroy({ where: {} });
    await Screen.destroy({ where: {} });
    res.json({ success: true, message: 'All data reset' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update screen status
app.patch('/screens/:id/status', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen) return res.status(404).json({ error: 'Screen not found' });

    const nextStatus = req.body.status;
    if (!['online', 'offline', 'static', 'not_installed'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await applyScreenStatus(screen, nextStatus, { manual: true });

    res.json(screen);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update maintenance workflow status
app.patch('/screens/:id/workflow', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen) return res.status(404).json({ error: 'Screen not found' });
    const { workflowStatus } = req.body;
    if (!['none','todo','ontheway','complete'].includes(workflowStatus)) {
      return res.status(400).json({ error: 'Invalid workflow status' });
    }
    await screen.update({ workflowStatus });
    res.json(screen);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get events for a screen
app.get('/screens/:id/events', authenticateToken, async (req, res) => {
  try {
    const events = await ScreenEvent.findAll({
      where: { screenId: req.params.id },
      order: [['createdAt', 'ASC']]
    });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get notes for a screen
app.get('/screens/:id/notes', authenticateToken, async (req, res) => {
  try {
    const notes = await Note.findAll({
      where: { screenId: req.params.id },
      order: [['createdAt', 'DESC']]
    });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a note to a screen
app.post('/screens/:id/notes', authenticateToken, async (req, res) => {
  try {
    const note = await Note.create({
      screenId: req.params.id,
      author: req.user?.username || 'Unknown',
      content: req.body.content
    });
    res.status(201).json(note);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Contacts registry
app.get('/contacts', authenticateToken, async (req, res) => {
  try {
    const contacts = await Contact.findAll({
      order: [['targetType', 'ASC'], ['targetValue', 'ASC'], ['name', 'ASC']]
    });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/contacts', authenticateToken, async (req, res) => {
  try {
    const { name, phone, targetType, targetValue } = req.body;

    if (!name || !phone || !targetType || !targetValue) {
      return res.status(400).json({ error: 'name, phone, targetType and targetValue are required' });
    }

    if (!['local', 'screen'].includes(targetType)) {
      return res.status(400).json({ error: 'Invalid targetType' });
    }

    const existing = await Contact.findOne({ where: { targetType, targetValue } });
    if (existing) {
      await existing.update({ name: name.trim(), phone: phone.trim() });
      return res.json(existing);
    }

    const contact = await Contact.create({
      name: name.trim(),
      phone: phone.trim(),
      targetType,
      targetValue: String(targetValue)
    });

    res.status(201).json(contact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/contacts/:id', authenticateToken, async (req, res) => {
  try {
    const id = getPositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const contact = await Contact.findByPk(id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const { name, phone, targetType, targetValue } = req.body;
    if (!name || !phone || !targetType || !targetValue) {
      return res.status(400).json({ error: 'name, phone, targetType and targetValue are required' });
    }
    if (!['local', 'screen'].includes(targetType)) {
      return res.status(400).json({ error: 'Invalid targetType' });
    }

    // Check unique constraint for the new targetType/targetValue (if changed)
    if (targetType !== contact.targetType || targetValue !== contact.targetValue) {
      const existing = await Contact.findOne({ where: { targetType, targetValue } });
      if (existing && existing.id !== contact.id) {
        return res.status(409).json({ error: 'Já existe um contato para esse local/tela.' });
      }
    }

    await contact.update({ name: name.trim(), phone: phone.trim(), targetType, targetValue: String(targetValue) });
    res.json(contact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/contacts/:id', authenticateToken, async (req, res) => {
  try {
    const contact = await Contact.findByPk(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    await contact.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PlayBox Configuration Verification - GET endpoint
app.get('/heartbeat/:displayId/config', async (req, res) => {
  try {
    const screen = await Screen.findOne({ where: { displayId: req.params.displayId } });
    if (!screen) {
      return res.status(404).json({ 
        error: 'Display not registered', 
        hint: 'Please register this display ID in the management system' 
      });
    }
    
    res.json({
      success: true,
      displayId: screen.displayId,
      name: screen.name,
      address: screen.address,
      contact: screen.contact,
      status: screen.status,
      lastHeartbeat: screen.lastHeartbeat,
      message: 'Display is registered. Send POST requests to /heartbeat/{displayId} to report online'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ===== NEW ENDPOINTS FOR HIGH-IMPACT FEATURES =====

// 1. ANALYTICS/KPIs ENDPOINT
app.get('/analytics', authenticateToken, async (req, res) => {
  try {
    const allScreens = await Screen.findAll();
    const onlineScreens = allScreens.filter(s => s.status === 'online');
    const offlineScreens = allScreens.filter(s => s.status === 'offline');
    const staticScreens = allScreens.filter(s => s.status === 'static');
    const notInstalledScreens = allScreens.filter(s => s.status === 'not_installed');
    
    const workflowStats = {
      todo: allScreens.filter(s => s.workflowStatus === 'todo').length,
      ontheway: allScreens.filter(s => s.workflowStatus === 'ontheway').length,
      complete: allScreens.filter(s => s.workflowStatus === 'complete').length
    };

    const priorityStats = {
      critical: allScreens.filter(s => s.priority === 'critical').length,
      high: allScreens.filter(s => s.priority === 'high').length,
      medium: allScreens.filter(s => s.priority === 'medium').length,
      low: allScreens.filter(s => s.priority === 'low').length
    };

    // Location stats
    const locationsMap = {};
    allScreens.forEach(screen => {
      const loc = screen.location || 'Sem Local';
      if (!locationsMap[loc]) {
        locationsMap[loc] = { total: 0, online: 0, offline: 0, static: 0, not_installed: 0, pending: 0, completed: 0, critical: 0 };
      }
      locationsMap[loc].total++;
      if (screen.status === 'online') locationsMap[loc].online++;
      else if (screen.status === 'static') locationsMap[loc].static++;
      else if (screen.status === 'not_installed') locationsMap[loc].not_installed++;
      else locationsMap[loc].offline++;
      if (screen.workflowStatus === 'ontheway') locationsMap[loc].pending++;
      if (screen.workflowStatus === 'complete') locationsMap[loc].completed++;
      if (screen.priority === 'critical') locationsMap[loc].critical++;
    });

    res.json({
      overview: {
        totalScreens: allScreens.length,
        onlineCount: onlineScreens.length,
        offlineCount: offlineScreens.length,
        staticCount: staticScreens.length,
        notInstalledCount: notInstalledScreens.length,
        uptime: allScreens.length === 0 ? 0 : ((onlineScreens.length / allScreens.length) * 100).toFixed(1)
      },
      workflow: workflowStats,
      priority: priorityStats,
      locations: locationsMap,
      recentlyOffline: offlineScreens.length,
      criticalNeedsAttention: priorityStats.critical + allScreens.filter(s => s.status === 'offline' && s.priority !== 'low').length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. ALERTS ENDPOINTS
app.get('/alerts', authenticateToken, async (req, res) => {
  try {
    const alerts = await Alert.findAll({
      where: { dismissed: false },
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Screen,
          attributes: ['id', 'name', 'status', 'location']
        }
      ]
    });
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/alerts/count', authenticateToken, async (req, res) => {
  try {
    const unreadCount = await Alert.count({ where: { read: false, dismissed: false } });
    res.json({ unreadCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/alerts/:id/read', authenticateToken, async (req, res) => {
  try {
    const alert = await Alert.findByPk(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    
    await alert.update({ read: true });
    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/alerts/:id/dismiss', authenticateToken, async (req, res) => {
  try {
    const alert = await Alert.findByPk(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    
    await alert.update({ dismissed: true });
    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. BATCH OPERATIONS ENDPOINTS
app.patch('/screens/batch/priority', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { screenIds, priority } = req.body;
    if (!Array.isArray(screenIds) || !priority) {
      return res.status(400).json({ error: 'screenIds array and priority required' });
    }

    const screens = await Screen.findAll({ where: { id: screenIds } });
    await Promise.all(screens.map(screen => screen.update({ priority })));

    res.json({ updated: screens.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/screens/batch/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { screenIds, status } = req.body;
    if (!Array.isArray(screenIds) || !status) {
      return res.status(400).json({ error: 'screenIds array and status required' });
    }

    const screens = await Screen.findAll({ where: { id: screenIds } });
    await Promise.all(screens.map(async (screen) => {
      await applyScreenStatus(screen, status);
    }));

    res.json({ updated: screens.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/screens/batch/workflow', authenticateToken, async (req, res) => {
  try {
    const { screenIds, workflowStatus } = req.body;
    if (!Array.isArray(screenIds) || !workflowStatus) {
      return res.status(400).json({ error: 'screenIds array and workflowStatus required' });
    }

    const screens = await Screen.findAll({ where: { id: screenIds } });
    await Promise.all(screens.map(screen => screen.update({ workflowStatus })));

    res.json({ updated: screens.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update screen (general endpoint for multiple fields)
app.patch('/screens/:id', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen) return res.status(404).json({ error: 'Screen not found' });
    
    const { priority, displayUrl, name, address, location, operatingHoursStart, operatingHoursEnd, operatingDays, flowPeople, flowVehicles } = req.body;
    const updates = {};
    
    if (priority) {
      if (!['critical', 'high', 'medium', 'low'].includes(priority)) {
        return res.status(400).json({ error: 'Invalid priority value' });
      }
      updates.priority = priority;
    }
    
    if (displayUrl !== undefined) updates.displayUrl = displayUrl;
    if (name) updates.name = name;
    if (address !== undefined) updates.address = address;
    if (location !== undefined) updates.location = location;
    if (operatingHoursStart !== undefined) updates.operatingHoursStart = operatingHoursStart || null;
    if (operatingHoursEnd !== undefined) updates.operatingHoursEnd = operatingHoursEnd || null;
    if (operatingDays !== undefined) updates.operatingDays = operatingDays || null;
    if (flowPeople !== undefined) updates.flowPeople = flowPeople === '' ? null : Number(flowPeople);
    if (flowVehicles !== undefined) updates.flowVehicles = flowVehicles === '' ? null : Number(flowVehicles);
    
    if (Object.keys(updates).length > 0) {
      await screen.update(updates);
    }
    
    res.json(screen);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Screen diagnostics — historical telemetry analysis
app.get('/screens/:id/diagnostics', authenticateToken, async (req, res) => {
  try {
    const screenId = parseNumericIdParam(req, res, 'id');
    if (screenId === null) return;

    const screen = await Screen.findByPk(screenId);
    if (!screen) return res.status(404).json({ error: 'Screen not found' });

    const hours = getPositiveInt(req.query.hours, 24, { min: 1, max: 720 });
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const snapshots = await TelemetrySnapshot.findAll({
      where: { screenId: screen.id, createdAt: { [require('sequelize').Op.gte]: since } },
      order: [['createdAt', 'ASC']]
    });

    // Build time series
    const timeSeries = snapshots.map(s => ({
      t: s.createdAt,
      cpuTemp: s.cpuTemp,
      cpuUsage: s.cpuUsage,
      diskPct: s.diskPct,
      status: s.status,
      uptimeRaw: s.uptimeRaw
    }));

    // Compute diagnostics
    const onlineSnaps = snapshots.filter(s => s.cpuTemp != null);
    const diagnostics = [];

    if (onlineSnaps.length >= 2) {
      // Temperature analysis
      const temps = onlineSnaps.map(s => s.cpuTemp);
      const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
      const maxTemp = Math.max(...temps);
      const lastTemp = temps[temps.length - 1];
      const recentTemps = temps.slice(-10);
      const tempTrend = recentTemps.length >= 2 ? (recentTemps[recentTemps.length - 1] - recentTemps[0]) / recentTemps.length : 0;

      if (maxTemp > 80) diagnostics.push({ type: 'danger', category: 'temperature', title: 'Temperatura crítica detectada', detail: `Máxima de ${maxTemp.toFixed(1)}°C — risco de dano ao hardware. Verificar ventilação e ambiente.` });
      else if (avgTemp > 65) diagnostics.push({ type: 'warning', category: 'temperature', title: 'Temperatura elevada', detail: `Média de ${avgTemp.toFixed(1)}°C nas últimas ${hours}h. Player pode estar superaquecendo.` });
      else diagnostics.push({ type: 'ok', category: 'temperature', title: 'Temperatura normal', detail: `Média ${avgTemp.toFixed(1)}°C, máx ${maxTemp.toFixed(1)}°C.` });

      if (tempTrend > 1) diagnostics.push({ type: 'warning', category: 'temperature', title: 'Temperatura subindo', detail: `Tendência de +${tempTrend.toFixed(1)}°C por leitura nos últimos registros.` });

      // CPU usage analysis
      const cpus = onlineSnaps.filter(s => s.cpuUsage != null).map(s => s.cpuUsage);
      if (cpus.length > 0) {
        const avgCpu = cpus.reduce((a, b) => a + b, 0) / cpus.length;
        const maxCpu = Math.max(...cpus);
        const highCpuCount = cpus.filter(c => c > 80).length;
        const highCpuPct = (highCpuCount / cpus.length) * 100;

        if (highCpuPct > 50) diagnostics.push({ type: 'danger', category: 'cpu', title: 'CPU sobrecarregada', detail: `CPU acima de 80% em ${highCpuPct.toFixed(0)}% das leituras. Player pode travar ou reiniciar.` });
        else if (avgCpu > 60) diagnostics.push({ type: 'warning', category: 'cpu', title: 'CPU elevada', detail: `Uso médio de ${avgCpu.toFixed(0)}%. Pode indicar processo travado.` });
        else diagnostics.push({ type: 'ok', category: 'cpu', title: 'CPU normal', detail: `Uso médio ${avgCpu.toFixed(0)}%, máx ${maxCpu.toFixed(0)}%.` });
      }

      // Disk usage analysis
      const disks = onlineSnaps.filter(s => s.diskPct != null).map(s => s.diskPct);
      if (disks.length > 0) {
        const lastDisk = disks[disks.length - 1];
        const firstDisk = disks[0];
        const diskGrowth = lastDisk - firstDisk;

        if (lastDisk > 90) diagnostics.push({ type: 'danger', category: 'disk', title: 'Disco quase cheio', detail: `${lastDisk.toFixed(0)}% ocupado. Player pode parar de funcionar. Limpeza urgente necessária.` });
        else if (lastDisk > 75) diagnostics.push({ type: 'warning', category: 'disk', title: 'Disco em alerta', detail: `${lastDisk.toFixed(0)}% ocupado. Programar limpeza.` });
        else diagnostics.push({ type: 'ok', category: 'disk', title: 'Disco saudável', detail: `${lastDisk.toFixed(0)}% ocupado.` });

        if (diskGrowth > 5 && hours >= 24) diagnostics.push({ type: 'warning', category: 'disk', title: 'Disco crescendo', detail: `+${diskGrowth.toFixed(1)}% nas últimas ${hours}h. Verificar logs ou cache acumulando.` });
      }

      // Uptime / stability analysis
      const uptimes = onlineSnaps.filter(s => s.uptimeRaw).map(s => {
        const d = s.uptimeRaw.match(/(\d+)\s*day/i);
        const h = s.uptimeRaw.match(/(\d+)\s*hour/i);
        const m = s.uptimeRaw.match(/(\d+)\s*min/i);
        return (d ? parseInt(d[1]) * 1440 : 0) + (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0);
      });
      if (uptimes.length >= 2) {
        let reboots = 0;
        for (let i = 1; i < uptimes.length; i++) {
          if (uptimes[i] < uptimes[i - 1] - 5) reboots++;
        }
        if (reboots > 3) diagnostics.push({ type: 'danger', category: 'stability', title: 'Reinícios frequentes', detail: `${reboots} reinícios detectados nas últimas ${hours}h. Player instável — verificar fonte de energia e hardware.` });
        else if (reboots > 0) diagnostics.push({ type: 'warning', category: 'stability', title: 'Reinício detectado', detail: `${reboots} reinício(s) nas últimas ${hours}h.` });
        else diagnostics.push({ type: 'ok', category: 'stability', title: 'Estável', detail: `Sem reinícios detectados.` });
      }
    }

    // Connectivity analysis (all snapshots, including offline)
    if (snapshots.length > 0) {
      const offlineCount = snapshots.filter(s => s.status === 'offline').length;
      const offlinePct = (offlineCount / snapshots.length) * 100;
      if (offlinePct > 30) diagnostics.push({ type: 'danger', category: 'connectivity', title: 'Conectividade crítica', detail: `Offline em ${offlinePct.toFixed(0)}% das leituras. Verificar rede/energia.` });
      else if (offlinePct > 10) diagnostics.push({ type: 'warning', category: 'connectivity', title: 'Quedas de conexão', detail: `Offline em ${offlinePct.toFixed(0)}% das leituras.` });
      else diagnostics.push({ type: 'ok', category: 'connectivity', title: 'Conexão estável', detail: `Online em ${(100 - offlinePct).toFixed(0)}% do tempo.` });
    }

    // Overall health score
    const dangerCount = diagnostics.filter(d => d.type === 'danger').length;
    const warnCount = diagnostics.filter(d => d.type === 'warning').length;
    let health = 'healthy';
    if (dangerCount > 0) health = 'critical';
    else if (warnCount > 0) health = 'attention';

    res.json({ screenId: screen.id, screenName: screen.name, hours, snapshotCount: snapshots.length, health, diagnostics, timeSeries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cleanup old telemetry (keep 7 days)
setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await TelemetrySnapshot.destroy({ where: { createdAt: { [require('sequelize').Op.lt]: cutoff } } });
  } catch (err) { /* ignore */ }
}, 6 * 60 * 60 * 1000); // every 6 hours

// Generate route link for screen address
app.get('/screens/:id/route-link', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen) return res.status(404).json({ error: 'Screen not found' });
    
    const addr = screen.address || screen.location;
    if (!addr) return res.status(400).json({ error: 'Screen has no address' });
    
    // Google Maps route link: opens Maps with current location as origin and screen address as destination
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}&travelmode=driving`;
    const appleMapsUrl = `maps://maps.apple.com/?daddr=${encodeURIComponent(addr)}&dirflg=d`;
    
    res.json({ 
      address: addr, 
      screenName: screen.name,
      googleMapsUrl: mapsUrl, 
      appleMapsUrl: appleMapsUrl,
      shortUrl: `/route/${screen.id}` 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Redirect route link (for shorter URLs in messages)
app.get('/route/:screenId', async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.screenId);
    if (!screen || !screen.address) {
      return res.status(404).send('<h1>Endereço não encontrado</h1>');
    }
    const addr = screen.address || screen.location;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}&travelmode=driving`;
    res.redirect(mapsUrl);
  } catch (err) {
    res.status(500).send('<h1>Erro ao gerar rota</h1>');
  }
});

// Generate route link for any address
app.post('/route-link', authenticateToken, (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Address is required' });
    
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
    const appleMapsUrl = `maps://maps.apple.com/?daddr=${encodeURIComponent(address)}&dirflg=d`;
    
    res.json({ address, googleMapsUrl: mapsUrl, appleMapsUrl: appleMapsUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. EXPORT DATA ENDPOINT
app.get('/screens/export/:format', authenticateToken, async (req, res) => {
  try {
    const { format } = req.params;
    const screens = await Screen.findAll({
      include: [
        { model: Note, attributes: ['id', 'content', 'author', 'createdAt'] },
        { model: ScreenEvent, attributes: ['id', 'status', 'createdAt'] }
      ]
    });

    if (format === 'csv') {
      let csv = 'ID,Name,Location,Status,Priority,WorkflowStatus,Address,URL,LastHeartbeat\n';
      screens.forEach(s => {
        const row = [
          s.id,
          `"${s.name}"`,
          `"${s.location || ''}"`,
          s.status,
          s.priority,
          s.workflowStatus,
          `"${s.address || ''}"`,
          `"${s.displayUrl || ''}"`,
          s.lastHeartbeat ? new Date(s.lastHeartbeat).toISOString() : ''
        ].join(',');
        csv += row + '\n';
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="screens_export.csv"');
      res.send(csv);
    } else if (format === 'json') {
      res.json({
        export_date: new Date().toISOString(),
        total_screens: screens.length,
        screens: screens.map(s => ({
          id: s.id,
          name: s.name,
          location: s.location,
          status: s.status,
          priority: s.priority,
          workflowStatus: s.workflowStatus,
          address: s.address,
          displayUrl: s.displayUrl,
          lastHeartbeat: s.lastHeartbeat,
          notes: s.Notes ? s.Notes.length : 0,
          events: s.ScreenEvents ? s.ScreenEvents.length : 0
        }))
      });
    } else {
      res.status(400).json({ error: 'Invalid format. Use csv or json' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === BACKUP ENDPOINTS ===
app.get('/backups', authenticateToken, requireAdmin, (req, res) => {
  try {
    const backups = backup.listBackups();
    logAudit(req, 'list', 'backup', null, { total: backups.length });
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/backups', authenticateToken, requireAdmin, (req, res) => {
  try {
    const result = backup.createBackup('manual');
    if (!result) {
      return res.status(400).json({ error: 'Backup failed — database may be empty or missing' });
    }
    const backupName = String(result).split(/[/\\]/).pop();
    logAudit(req, 'create', 'backup', null, { backup: backupName });
    res.json({ message: 'Backup criado com sucesso', name: backupName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/backups/restore', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const parsed = z.object({ name: z.string().min(1).max(200) }).strict().safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Backup name is required' });
    }
    const { name } = parsed.data;

    backup.restoreBackup(name);
    // Re-sync Sequelize after restore
    await sequelize.sync();
    await logAudit(req, 'restore', 'backup', null, { backup: name });
    res.json({ message: 'Backup restaurado com sucesso. Reinicie o servidor para garantir consistência.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Origin system CRUD proxy (edit/add monitors) ===

// Get monitor form data for editing
app.get('/origin/monitor-form/:originId', authenticateToken, async (req, res) => {
  try {
    const { originId } = req.params;
    const resp = await axios.get(`${ORIGIN_BASE}/locais/adicionar-monitor/id/${originId}`, {
      headers: { Cookie: originCookies },
      timeout: 15000,
      httpsAgent: originHttpsAgent,
      validateStatus: () => true
    });
    if (resp.status !== 200) return res.status(502).json({ error: 'Failed to fetch monitor form' });

    const html = resp.data;
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);

    const getValue = (name) => {
      const el = $(`[name="${name}"]`);
      if (el.is('select')) return el.find('option:selected').val() || '';
      return el.val() || '';
    };

    const getOptions = (name) => {
      const opts = [];
      $(`[name="${name}"] option`).each((_, el) => {
        opts.push({ value: $(el).val(), text: $(el).text().trim(), selected: $(el).is(':selected') });
      });
      return opts;
    };

    const data = {
      id: getValue('id'),
      nome: getValue('nome'),
      polegadas: getValue('polegadas'),
      tipo_tela: getValue('tipo_tela'),
      player: getValue('player'),
      barra: getValue('barra'),
      orientacao: getValue('orientacao'),
      player_width: getValue('player_width'),
      player_height: getValue('player_height'),
      vinculo: getValue('vinculo'),
      tempo_ciclo: getValue('tempo_ciclo'),
      informacoes: $('[name="informacoes"]').text() || '',
      options: {
        tipo_tela: getOptions('tipo_tela'),
        player: getOptions('player'),
        barra: getOptions('barra'),
        orientacao: getOptions('orientacao'),
        vinculo: getOptions('vinculo'),
      }
    };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save monitor (add or edit) to origin system
app.post('/origin/monitor-save', authenticateToken, async (req, res) => {
  try {
    const { id, nome, polegadas, tipo_tela, player, barra, orientacao, player_width, player_height, vinculo, tempo_ciclo, informacoes } = req.body;

    if (!nome || !vinculo || !tipo_tela) {
      return res.status(400).json({ error: 'Nome, tipo de tela e local são obrigatórios' });
    }

    const formData = new URLSearchParams();
    formData.append('id', id || '');
    formData.append('nome', nome);
    formData.append('polegadas', polegadas || '');
    formData.append('tipo_tela', tipo_tela);
    formData.append('player', player || 'Android');
    formData.append('barra', barra || '');
    formData.append('orientacao', orientacao || 'H,100,0');
    formData.append('player_width', player_width || '100%');
    formData.append('player_height', player_height || '100%');
    formData.append('vinculo', vinculo);
    formData.append('tempo_ciclo', tempo_ciclo || '300');
    formData.append('informacoes', informacoes || '');

    const resp = await axios.post(`${ORIGIN_BASE}/locais/monitores/adicionar-monitor`, formData.toString(), {
      headers: {
        Cookie: originCookies,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
      maxRedirects: 5,
      httpsAgent: originHttpsAgent,
      validateStatus: () => true
    });

    if (resp.status >= 200 && resp.status < 400) {
      res.json({ success: true, message: id ? 'Monitor atualizado no sistema de origem' : 'Monitor adicionado no sistema de origem' });
    } else {
      res.status(502).json({ error: 'Erro ao salvar no sistema de origem', status: resp.status });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Live view & remote control proxy (origin system) ===
const ORIGIN_MONITOR_IP = '45.225.128.134';

// Screenshot proxy (static cached image from monitoring page)
app.get('/screens/:id/screenshot', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen || !screen.originId) return res.status(404).json({ error: 'Screen not found' });

    const url = `${ORIGIN_BASE}/pontos/intermidia/${screen.originId}/controle.png`;
    const resp = await axios.get(url, {
      headers: { Cookie: originCookies },
      responseType: 'arraybuffer',
      timeout: 10000,
      validateStatus: () => true
    });

    if (resp.status !== 200 || !resp.data || resp.data.length < 100) {
      return res.status(502).json({ error: 'Screenshot unavailable' });
    }

    res.set('Content-Type', resp.headers['content-type'] || 'image/png');
    res.set('Cache-Control', 'no-cache, no-store');
    res.send(Buffer.from(resp.data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activate live video streaming
app.post('/screens/:id/video/start', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen || !screen.originId) return res.status(404).json({ error: 'Screen not found' });

    const resp = await axios.post(`${ORIGIN_BASE}/sudp/vid_ativ.php`, 
      `id=${screen.originId}&ip=${ORIGIN_MONITOR_IP}`,
      { headers: { Cookie: originCookies, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000, httpsAgent: originHttpsAgent, validateStatus: () => true }
    );
    res.json({ success: true, data: resp.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get live video frame
app.post('/screens/:id/video/frame', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen || !screen.originId) return res.status(404).json({ error: 'Screen not found' });

    const resp = await axios.post(`${ORIGIN_BASE}/sudp/vid_rem.php`,
      `id=${screen.originId}&ip=${ORIGIN_MONITOR_IP}`,
      { headers: { Cookie: originCookies, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000, httpsAgent: originHttpsAgent, validateStatus: () => true }
    );

    // vid_rem.php returns the image data URL directly (data:image/...) or "NY" if not ready
    if (resp.data && resp.data !== 'NY') {
      res.json({ success: true, frame: resp.data });
    } else {
      res.json({ success: false, frame: null });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stop live video streaming
app.post('/screens/:id/video/stop', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen || !screen.originId) return res.status(404).json({ error: 'Screen not found' });

    await axios.post(`${ORIGIN_BASE}/sudp/vid_desativ.php`,
      `id=${screen.originId}&ip=${ORIGIN_MONITOR_IP}`,
      { headers: { Cookie: originCookies, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000, httpsAgent: originHttpsAgent, validateStatus: () => true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remote control commands (f1=restart playlist, f4=force update, f6=player/updater, reboot)
app.post('/screens/:id/command', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen || !screen.originId) return res.status(404).json({ error: 'Screen not found' });

    const { action } = req.body;
    const allowedActions = ['f1', 'f4', 'f6', 'reboot'];
    if (!allowedActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Allowed: ' + allowedActions.join(', ') });
    }

    const resp = await axios.post(`${ORIGIN_BASE}/sudp/btn_rem.php`,
      `acao=${action}&id=${screen.originId}&ip=${ORIGIN_MONITOR_IP}`,
      { headers: { Cookie: originCookies, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000, httpsAgent: originHttpsAgent, validateStatus: () => true }
    );
    res.json({ success: true, data: resp.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3001;

// ===== AUTOMATION: Auto-generate alerts =====
async function generateAutomatedAlerts() {
  try {
    const screens = await Screen.findAll();
    const now = new Date();

    for (const screen of screens) {
      if (screen.status === 'static' || screen.status === 'not_installed') continue;

      // Alert: offline for more than 4 hours — but only if within operating hours
      if (screen.status === 'offline' && screen.lastHeartbeat) {
        // Skip offline alert if outside operating hours (wifi is off, expected)
        if (!isWithinOperatingHours(screen)) continue;
        const offlineMs = now - new Date(screen.lastHeartbeat);
        const offlineHours = offlineMs / (1000 * 60 * 60);
        if (offlineHours >= 4) {
          const existing = await Alert.findOne({
            where: { screenId: screen.id, type: 'offline', dismissed: false }
          });
          if (!existing) {
            const severity = offlineHours >= 24 ? 'critical' : offlineHours >= 12 ? 'error' : 'warning';
            await Alert.create({
              screenId: screen.id, type: 'offline',
              title: `${screen.name} offline há ${Math.floor(offlineHours)}h`,
              message: `Display offline desde ${new Date(screen.lastHeartbeat).toLocaleString('pt-BR')}`,
              severity
            });
            // Send notification
            const config = await NotificationConfig.findOne();
            if (config && config.notifyOnOffline4h) {
              const prioMap = { critical: '🔴 Crítica', high: '🟠 Alta', medium: '🟡 Média', low: '🟢 Baixa' };
              const prio = prioMap[screen.priority] || '';
              const addr = screen.address || screen.location || '';
              let msg = `⚠️ *ALERTA — OFFLINE*\n\n💺 *${screen.name}*\nOffline há ${Math.floor(offlineHours)} horas`;
              if (addr) msg += `\n📍 ${addr}`;
              msg += `\n🕒 Última conexão: ${new Date(screen.lastHeartbeat).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
              if (prio) msg += `\n${prio}`;
              if (offlineHours >= 24) msg += `\n\n‼️ *Atenção: mais de 24h offline*`;
              if (addr) {
                const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}&travelmode=driving`;
                msg += `\n\n🗺️ *Abrir Rota:* ${routeUrl}`;
              }
              sendNotification(msg);
            }
          }
        }
      }

      // Alert: stale maintenance (todo for more than 48h)
      if (screen.workflowStatus === 'todo') {
        const events = await ScreenEvent.findAll({
          where: { screenId: screen.id }, order: [['createdAt', 'DESC']], limit: 1
        });
        if (events.length && (now - new Date(events[0].createdAt)) > 48 * 60 * 60 * 1000) {
          const existing = await Alert.findOne({
            where: { screenId: screen.id, type: 'maintenance_overdue', dismissed: false }
          });
          if (!existing) {
            await Alert.create({
              screenId: screen.id, type: 'maintenance_overdue',
              title: `Manutenção pendente: ${screen.name}`,
              message: 'Este display está em "A Fazer" há mais de 48 horas.',
              severity: 'warning'
            });
          }
        }
      }

      // Alert: oscillation detection (5+ status changes in 6 hours)
      const recentEvents = await ScreenEvent.findAll({
        where: {
          screenId: screen.id,
          createdAt: { [Op.gte]: new Date(now - 6 * 60 * 60 * 1000) }
        }
      });
      if (recentEvents.length >= 5) {
        const existing = await Alert.findOne({
          where: { screenId: screen.id, type: 'high_priority', dismissed: false,
            title: { [Op.like]: '%oscilando%' }
          }
        });
        if (!existing) {
          await Alert.create({
            screenId: screen.id, type: 'high_priority',
            title: `${screen.name} oscilando`,
            message: `${recentEvents.length} mudanças de status nas últimas 6 horas. Verificar conexão/energia.`,
            severity: 'error'
          });
          const config = await NotificationConfig.findOne();
          if (config && config.notifyOnOscillation) {
            const addr = screen.address || screen.location || '';
            let msg = `🔄 *OSCILAÇÃO DETECTADA*\n\n💺 *${screen.name}*\n${recentEvents.length} mudanças de status nas últimas 6h`;
            if (addr) msg += `\n📍 ${addr}`;
            msg += `\n\n⚡ Possíveis causas: queda de energia, rede instável ou player reiniciando.`;
            sendNotification(msg);
          }
        }
      }
    }
  } catch (err) {
    console.error('Alert generation error:', err.message);
  }
}

// Run alert generation every 10 minutes
setInterval(generateAutomatedAlerts, 10 * 60 * 1000);

// Pattern detection: identify screens that go offline at same time regularly
async function detectPatterns() {
  try {
    const screens = await Screen.findAll({ where: { status: { [Op.in]: ['online', 'offline'] } } });
    const patterns = [];
    for (const screen of screens) {
      const events = await ScreenEvent.findAll({
        where: { screenId: screen.id, status: 'offline',
          createdAt: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }, order: [['createdAt', 'ASC']]
      });
      if (events.length < 3) continue;
      // Group by hour
      const hourCounts = {};
      events.forEach(e => {
        const h = new Date(e.createdAt).getHours();
        hourCounts[h] = (hourCounts[h] || 0) + 1;
      });
      const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
      if (peakHour && peakHour[1] >= 3) {
        patterns.push({
          screenId: screen.id, screenName: screen.name, location: screen.location,
          peakHour: parseInt(peakHour[0]), occurrences: peakHour[1],
          totalOfflineEvents: events.length
        });
      }
    }
    return patterns;
  } catch (err) {
    console.error('Pattern detection error:', err.message);
    return [];
  }
}

// SLA/Uptime calculation
async function calculateSLA(screenId, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const events = await ScreenEvent.findAll({
    where: { screenId, createdAt: { [Op.gte]: since } },
    order: [['createdAt', 'ASC']]
  });
  const totalMs = days * 24 * 60 * 60 * 1000;
  let onlineMs = 0;
  let lastOnline = null;
  for (const evt of events) {
    if (evt.status === 'online') {
      lastOnline = new Date(evt.createdAt);
    } else if (evt.status === 'offline' && lastOnline) {
      onlineMs += new Date(evt.createdAt) - lastOnline;
      lastOnline = null;
    }
  }
  if (lastOnline) onlineMs += Date.now() - lastOnline;
  return { uptimePercent: totalMs > 0 ? ((onlineMs / totalMs) * 100).toFixed(2) : '0.00', onlineMs, totalMs };
}

// ===== TICKETS CRUD =====
app.get('/tickets', authenticateToken, async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.assignedTo) where.assignedTo = req.query.assignedTo;
    if (req.query.screenId) where.screenId = req.query.screenId;
    const tickets = await Ticket.findAll({ where, include: [{ model: Screen, attributes: ['id', 'name', 'location', 'status'] }], order: [['createdAt', 'DESC']] });
    res.json(tickets.map((ticket) => {
      const json = ticket.toJSON();
      return { ...json, ...calculateTicketCost(json) };
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/tickets/:id', authenticateToken, async (req, res) => {
  try {
    const ticket = await Ticket.findByPk(req.params.id, { include: [{ model: Screen }] });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const json = ticket.toJSON();
    res.json({ ...json, ...calculateTicketCost(json) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/tickets', authenticateToken, async (req, res) => {
  try {
    const { screenId, title, description, category, priority, assignedTo, location, city, checklist, actualCost, timeSpentMinutes } = req.body;
    if (!title) return res.status(400).json({ error: 'Título é obrigatório' });
    
    // Auto-populate location from screen if not provided
    let finalLocation = location;
    let finalCity = city;
    if (screenId && !location) {
      const screen = await Screen.findByPk(screenId);
      if (screen) {
        finalLocation = screen.address || screen.location || location;
      }
    }
    
    const ticket = await Ticket.create({
      screenId: screenId || null, title, description, category: category || 'general',
      priority: priority || 'medium', assignedTo, location: finalLocation, city: finalCity, checklist,
      createdBy: req.user.username, status: 'open',
      actualCost: actualCost === '' || actualCost == null ? null : Number(actualCost),
      timeSpentMinutes: timeSpentMinutes === '' || timeSpentMinutes == null ? 0 : Number(timeSpentMinutes)
    });
    await logAudit(req, 'create', 'ticket', ticket.id, { title });
    // Send notification on ticket create
    const nConfig = await NotificationConfig.findOne();
    if (nConfig && nConfig.notifyOnTicketCreate && nConfig.whatsappEnabled) {
      const catMap = { general: 'Geral', hardware: 'Hardware', software: 'Software', network: 'Rede', power: 'Energia', display: 'Display', other: 'Outro' };
      const prioMap = { low: '🟢 Baixa', medium: '🟡 Média', high: '🟠 Alta', critical: '🔴 Crítica' };
      const cat = catMap[category] || category || 'Geral';
      const prio = prioMap[priority] || priority || '🟡 Média';
      let msg = `🎫 *NOVO TICKET #${ticket.id}*\n\n📋 *${title}*`;
      if (description) msg += `\n${description}`;
      msg += `\n\n📁 Categoria: ${cat}\n⚡ Prioridade: ${prio}`;
      if (assignedTo) msg += `\n👤 Atribuído: ${assignedTo}`;
      if (screenId) {
        const scr = await Screen.findByPk(screenId);
        if (scr) {
          msg += `\n🖥️ Tela: ${scr.name}`;
          if (scr.address) msg += `\n📍 ${scr.address}`;
        }
      } else if (finalLocation) {
        msg += `\n📍 ${finalLocation}`;
      }
      msg += `\n🕐 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
      if (screenId) {
        const scr = await Screen.findByPk(screenId);
        if (scr && scr.address) {
          const mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(scr.address);
          msg += `\n\n🗺️ *Abrir Rota:* ${mapsUrl}`;
        }
      } else if (finalLocation) {
        const mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(finalLocation);
        msg += `\n\n🗺️ *Abrir Rota:* ${mapsUrl}`;
      }
      sendNotification(msg);
    }
    const json = ticket.toJSON();
    res.status(201).json({ ...json, ...calculateTicketCost(json) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.patch('/tickets/:id', authenticateToken, async (req, res) => {
  try {
    const ticket = await Ticket.findByPk(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const { status, priority, assignedTo, description, timeSpentMinutes, checklist, title, category, actualCost } = req.body;
    const updates = {};
    if (status) {
      updates.status = status;
      if (status === 'resolved') updates.resolvedAt = new Date();
      if (status === 'closed') updates.closedAt = new Date();
    }
    if (priority) updates.priority = priority;
    if (assignedTo !== undefined) updates.assignedTo = assignedTo;
    if (description !== undefined) updates.description = description;
    if (timeSpentMinutes !== undefined) updates.timeSpentMinutes = timeSpentMinutes;
    if (actualCost !== undefined) updates.actualCost = actualCost === '' || actualCost == null ? null : Number(actualCost);
    if (checklist !== undefined) updates.checklist = checklist;
    if (title) updates.title = title;
    if (category) updates.category = category;
    if (status && ['resolved', 'closed'].includes(status)) updates.slaEscalatedAt = ticket.slaEscalatedAt || new Date();
    await ticket.update(updates);
    await logAudit(req, 'update', 'ticket', ticket.id, updates);
    const json = ticket.toJSON();
    res.json({ ...json, ...calculateTicketCost(json) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/tickets/:id', authenticateToken, async (req, res) => {
  try {
    const ticket = await Ticket.findByPk(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    await ticket.destroy();
    await logAudit(req, 'delete', 'ticket', ticket.id, {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/tickets/stats/summary', authenticateToken, async (req, res) => {
  try {
    const all = await Ticket.findAll();
    const enriched = all.map((ticket) => ({ ...ticket.toJSON(), ...calculateTicketCost(ticket) }));
    const stats = {
      total: enriched.length,
      open: enriched.filter(t => t.status === 'open').length,
      in_progress: enriched.filter(t => t.status === 'in_progress').length,
      waiting_part: enriched.filter(t => t.status === 'waiting_part').length,
      resolved: enriched.filter(t => t.status === 'resolved').length,
      closed: enriched.filter(t => t.status === 'closed').length,
      avgTimeMinutes: enriched.filter(t => t.timeSpentMinutes > 0).reduce((a, t) => a + t.timeSpentMinutes, 0) / (enriched.filter(t => t.timeSpentMinutes > 0).length || 1),
      totalCost: enriched.reduce((acc, ticket) => acc + (ticket.totalCost || 0), 0),
      avgCost: enriched.reduce((acc, ticket) => acc + (ticket.totalCost || 0), 0) / (enriched.length || 1),
      byCategory: {},
      byAssignee: {}
    };
    enriched.forEach(t => {
      stats.byCategory[t.category] = (stats.byCategory[t.category] || 0) + 1;
      if (t.assignedTo) stats.byAssignee[t.assignedTo] = (stats.byAssignee[t.assignedTo] || 0) + 1;
    });
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/screens/:id/maintenance-history', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen) return res.status(404).json({ error: 'Screen not found' });

    const [tickets, schedules, alerts] = await Promise.all([
      Ticket.findAll({ where: { screenId: screen.id }, order: [['createdAt', 'DESC']], limit: 25 }),
      Schedule.findAll({ where: { screenId: screen.id }, order: [['scheduledDate', 'DESC']], limit: 15 }),
      Alert.findAll({ where: { screenId: screen.id }, order: [['createdAt', 'DESC']], limit: 15 })
    ]);

    const ticketItems = tickets.map((ticket) => {
      const json = ticket.toJSON();
      return { ...json, ...calculateTicketCost(json) };
    });
    const resolvedTickets = ticketItems.filter((ticket) => ticket.resolvedAt);
    const avgResolutionHours = resolvedTickets.length
      ? resolvedTickets.reduce((acc, ticket) => acc + ((new Date(ticket.resolvedAt) - new Date(ticket.createdAt)) / (1000 * 60 * 60)), 0) / resolvedTickets.length
      : 0;
    const categoryCounts = ticketItems.reduce((acc, ticket) => {
      acc[ticket.category] = (acc[ticket.category] || 0) + 1;
      return acc;
    }, {});

    const recommendations = [];
    if (ticketItems.filter((ticket) => ['open', 'in_progress', 'waiting_part'].includes(ticket.status)).length > 0) {
      recommendations.push('Existem tickets abertos nesta tela exigindo acompanhamento.');
    }
    if (schedules.some((schedule) => schedule.title.startsWith('Preventiva automática') && ['scheduled', 'in_progress'].includes(schedule.status))) {
      recommendations.push('Há preventiva automática pendente para este ponto.');
    }
    if (alerts.some((alert) => !alert.dismissed && alert.severity === 'critical')) {
      recommendations.push('Alertas críticos recentes indicam risco operacional elevado.');
    }

    res.json({
      screenId: screen.id,
      summary: {
        totalTickets: ticketItems.length,
        openTickets: ticketItems.filter((ticket) => ['open', 'in_progress', 'waiting_part'].includes(ticket.status)).length,
        resolvedTickets: ticketItems.filter((ticket) => ['resolved', 'closed'].includes(ticket.status)).length,
        preventiveSchedules: schedules.filter((schedule) => schedule.title.startsWith('Preventiva automática')).length,
        totalTimeMinutes: ticketItems.reduce((acc, ticket) => acc + (ticket.timeSpentMinutes || 0), 0),
        totalCost: Number(ticketItems.reduce((acc, ticket) => acc + (ticket.totalCost || 0), 0).toFixed(2)),
        avgResolutionHours: Number(avgResolutionHours.toFixed(1)),
        topCategories: Object.entries(categoryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([category, count]) => ({ category, count })),
        recommendations
      },
      tickets: ticketItems,
      schedules,
      alerts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== SCHEDULES/CALENDAR CRUD =====
app.get('/schedules', authenticateToken, async (req, res) => {
  try {
    const where = {};
    const month = getPositiveInt(req.query.month, null, { min: 1, max: 12 });
    const year = getPositiveInt(req.query.year, null, { min: 2000, max: 2100 });
    if (month && year) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      where.scheduledDate = { [Op.between]: [start.toISOString().split('T')[0], end.toISOString().split('T')[0]] };
    }
    if (req.query.assignedTo) where.assignedTo = req.query.assignedTo;
    const schedules = await Schedule.findAll({ where, include: [{ model: Screen, attributes: ['id', 'name', 'location'] }], order: [['scheduledDate', 'ASC']] });
    res.json(schedules);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/schedules', authenticateToken, async (req, res) => {
  try {
    const { screenId, ticketId, title, description, scheduledDate, scheduledTime, assignedTo, location, city, recurrence, color } = req.body;
    if (!title || !scheduledDate) return res.status(400).json({ error: 'Título e data são obrigatórios' });
    
    // Auto-populate location from screen if not provided
    let finalLocation = location;
    let finalCity = city;
    if (screenId && !location) {
      const screen = await Screen.findByPk(screenId);
      if (screen) {
        finalLocation = screen.address || screen.location || location;
      }
    }
    
    const schedule = await Schedule.create({
      screenId, ticketId, title, description, scheduledDate, scheduledTime,
      assignedTo, location: finalLocation, city: finalCity, recurrence: recurrence || 'none', color: color || '#E95D34',
      createdBy: req.user.username
    });
    await logAudit(req, 'create', 'schedule', schedule.id, { title, scheduledDate });
    // Send notification to technician
    const nConfig = await NotificationConfig.findOne();
    if (nConfig && nConfig.notifyOnScheduleCreate && nConfig.whatsappEnabled) {
      let msg = `📅 *NOVO AGENDAMENTO*\n\n📝 *${title}*`;
      if (description) msg += `\n${description}`;
      msg += `\n\n📆 Data: ${new Date(scheduledDate + 'T12:00:00').toLocaleDateString('pt-BR')}`;
      if (scheduledTime) msg += ` às ${scheduledTime}`;
      if (assignedTo) msg += `\n👤 Responsável: ${assignedTo}`;
      if (screenId) {
        const screen = await Screen.findByPk(screenId);
        if (screen) msg += `\n🖥️ Tela: ${screen.name}`;
      }
      if (finalLocation) msg += `\n📍 ${finalLocation}`;
      if (finalCity) msg += ` — ${finalCity}`;
      if (screenId) {
        const screen = await Screen.findByPk(screenId);
        if (screen && screen.address) {
          const mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(screen.address);
          msg += `\n\n🗺️ *Abrir Rota:* ${mapsUrl}`;
        }
      } else if (finalLocation) {
        const mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(finalLocation);
        msg += `\n\n🗺️ *Abrir Rota:* ${mapsUrl}`;
      }
      sendNotification(msg);
    }
    res.status(201).json(schedule);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.patch('/schedules/:id', authenticateToken, async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    const updates = {};
    for (const key of ['title', 'description', 'scheduledDate', 'scheduledTime', 'assignedTo', 'status', 'location', 'city', 'color', 'screenId']) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    await schedule.update(updates);
    res.json(schedule);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/schedules/:id', authenticateToken, async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    await schedule.destroy();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== PARTS/INVENTORY CRUD =====
app.get('/parts', authenticateToken, async (req, res) => {
  try {
    const parts = await Part.findAll({ order: [['category', 'ASC'], ['name', 'ASC']] });
    res.json(parts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/parts', authenticateToken, async (req, res) => {
  try {
    const { name, category, quantity, minQuantity, location, notes, unitCost } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const part = await Part.create({ name, category, quantity: quantity || 0, minQuantity: minQuantity || 1, location, notes, unitCost });
    await logAudit(req, 'create', 'part', part.id, { name });
    res.status(201).json(part);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.patch('/parts/:id', authenticateToken, async (req, res) => {
  try {
    const part = await Part.findByPk(req.params.id);
    if (!part) return res.status(404).json({ error: 'Part not found' });
    const updates = {};
    for (const key of ['name', 'category', 'quantity', 'minQuantity', 'location', 'notes', 'unitCost']) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    await part.update(updates);
    await logAudit(req, 'update', 'part', part.id, updates);
    res.json(part);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/parts/:id', authenticateToken, async (req, res) => {
  try {
    const part = await Part.findByPk(req.params.id);
    if (!part) return res.status(404).json({ error: 'Part not found' });
    await part.destroy();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== CHECKLIST TEMPLATES =====
app.get('/checklist-templates', authenticateToken, async (req, res) => {
  try {
    const templates = await ChecklistTemplate.findAll({ order: [['name', 'ASC']] });
    res.json(templates);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/checklist-templates', authenticateToken, async (req, res) => {
  try {
    const { name, category, items } = req.body;
    if (!name || !items) return res.status(400).json({ error: 'Nome e itens são obrigatórios' });
    const tmpl = await ChecklistTemplate.create({ name, category, items: typeof items === 'string' ? items : JSON.stringify(items) });
    res.status(201).json(tmpl);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/checklist-templates/:id', authenticateToken, async (req, res) => {
  try {
    const tmpl = await ChecklistTemplate.findByPk(req.params.id);
    if (!tmpl) return res.status(404).json({ error: 'Template not found' });
    await tmpl.destroy();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== SCREEN FAVORITES =====

// ===== NOTIFICATION CONFIG =====
app.get('/notification-config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    let config = await NotificationConfig.findOne();
    if (!config) config = await NotificationConfig.create({});
    res.json(config);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/notification-config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    let config = await NotificationConfig.findOne();
    if (!config) config = await NotificationConfig.create({});
    const allowedKeys = ['whatsappEnabled', 'whatsappApiUrl', 'whatsappApiKey', 'whatsappDefaultPhone',
      'notifyOnScheduleCreate', 'notifyOnAlertCritical', 'notifyOnAlertWarning',
      'notifyOnTicketCreate', 'notifyOnTicketAssign', 'notifyOnOffline4h', 'notifyOnOscillation', 'technicianContacts'];
    const updates = {};
    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    await config.update(updates);
    await logAudit(req, 'update', 'notification_config', config.id, Object.keys(updates));
    res.json(config);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/notification-config/test', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { phone } = req.body;
    const config = await NotificationConfig.findOne();
    if (!config || !config.whatsappEnabled || !config.whatsappApiUrl) {
      return res.status(400).json({ error: 'WhatsApp não configurado' });
    }
    const targetPhone = phone || config.whatsappDefaultPhone;
    if (!targetPhone) return res.status(400).json({ error: 'Nenhum telefone informado' });
    await sendNotification('✅ *TESTE* — Notificações do sistema Intermídia Manutenção estão funcionando!', targetPhone);
    res.json({ success: true, message: `Mensagem de teste enviada para ${targetPhone}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/screens/:id/favorite', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen) return res.status(404).json({ error: 'Screen not found' });
    await screen.update({ favorite: !screen.favorite });
    res.json(screen);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ===== SCREEN ASSIGN =====
app.patch('/screens/:id/assign', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen) return res.status(404).json({ error: 'Screen not found' });
    await screen.update({ assignedTo: req.body.assignedTo || null });
    await logAudit(req, 'assign', 'screen', screen.id, { assignedTo: req.body.assignedTo });
    res.json(screen);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ===== SCREEN COORDINATES (for map) =====
app.patch('/screens/:id/coordinates', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen) return res.status(404).json({ error: 'Screen not found' });
    await screen.update({ latitude: req.body.latitude, longitude: req.body.longitude });
    res.json(screen);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ===== SLA/UPTIME ENDPOINT =====
app.get('/screens/:id/sla', authenticateToken, async (req, res) => {
  try {
    const screenId = parseNumericIdParam(req, res, 'id');
    if (screenId === null) return;

    const days = getPositiveInt(req.query.days, 30, { min: 1, max: 365 });
    const sla = await calculateSLA(screenId, days);
    res.json(sla);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/sla/overview', authenticateToken, async (req, res) => {
  try {
    const days = getPositiveInt(req.query.days, 30, { min: 1, max: 365 });
    const screens = await Screen.findAll({ where: { status: { [Op.in]: ['online', 'offline'] } } });
    const results = [];
    for (const s of screens) {
      const sla = await calculateSLA(s.id, days);
      results.push({ id: s.id, name: s.name, location: s.location, status: s.status, ...sla });
    }
    const avgUptime = results.length ? (results.reduce((a, r) => a + parseFloat(r.uptimePercent), 0) / results.length).toFixed(2) : '0.00';
    res.json({ screens: results, averageUptime: avgUptime, period: `${days} days` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== PATTERNS ENDPOINT =====
app.get('/patterns', authenticateToken, async (req, res) => {
  try {
    const patterns = await detectPatterns();
    res.json(patterns);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== AUDIT LOG =====
app.get('/audit-logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const limit = getPositiveInt(req.query.limit, 100, { min: 1, max: 1000 });
    const logs = await AuditLog.findAll({ order: [['createdAt', 'DESC']], limit });
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== USERS LIST (for assignment dropdowns) =====
app.get('/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.findAll({
      where: { active: true },
      attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'role', 'active'],
      order: [['email', 'ASC']]
    });
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== ADMIN USERS MANAGEMENT =====
app.get('/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'role', 'active', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'ASC']]
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'ID inválido' });

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const updates = {};
    if (Object.prototype.hasOwnProperty.call(req.body, 'role')) {
      updates.role = normalizeUserRole(req.body.role);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'active')) {
      updates.active = Boolean(req.body.active);
    }

    // Prevent locking out the current admin account.
    if (user.id === req.user.id) {
      if (updates.active === false) {
        return res.status(400).json({ error: 'Você não pode desativar o seu próprio usuário.' });
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'role') && updates.role !== 'admin') {
        return res.status(400).json({ error: 'Você não pode remover seu próprio papel de admin.' });
      }
    }

    // Prevent removing the last active admin.
    const nextRole = normalizeUserRole(updates.role || user.role);
    const nextActive = Object.prototype.hasOwnProperty.call(updates, 'active') ? updates.active : user.active;
    const currentUserRole = normalizeUserRole(user.role);
    const isLosingAdmin = currentUserRole === 'admin' && nextRole !== 'admin';
    const isDeactivatingAdmin = currentUserRole === 'admin' && nextActive === false;
    if (isLosingAdmin || isDeactivatingAdmin) {
      const activeAdmins = await User.count({ where: { role: 'admin', active: true } });
      if (activeAdmins <= 1) {
        return res.status(400).json({ error: 'É necessário manter ao menos um admin ativo.' });
      }
    }

    await user.update(updates);
    await logAudit(req, 'update', 'user', user.id, updates);

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: normalizeUserRole(user.role),
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== AUTO-DIAGNOSIS: Try remote reboot on offline screen =====
app.post('/screens/:id/auto-diagnose', authenticateToken, async (req, res) => {
  try {
    const screen = await Screen.findByPk(req.params.id);
    if (!screen || !screen.originId) return res.status(404).json({ error: 'Screen not found or no origin ID' });
    if (screen.status !== 'offline') return res.status(400).json({ error: 'Screen is not offline' });

    // Attempt remote reboot
    const resp = await axios.post(`${ORIGIN_BASE}/sudp/btn_rem.php`,
      `acao=reboot&id=${screen.originId}&ip=${ORIGIN_MONITOR_IP}`,
      { headers: { Cookie: originCookies, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000, httpsAgent: originHttpsAgent, validateStatus: () => true }
    );

    // Log the auto-diagnosis attempt
    await Note.create({
      screenId: screen.id, author: 'Sistema',
      content: `Auto-diagnóstico: Tentativa de reboot remoto enviada. Resposta: ${resp.status}`
    });
    await logAudit(req, 'auto-diagnose', 'screen', screen.id, { action: 'reboot', response: resp.status });

    res.json({ success: true, message: 'Comando de reboot enviado. Aguarde 2-3 minutos para verificar.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== ENHANCED ANALYTICS WITH SLA =====
app.get('/analytics/enhanced', authenticateToken, async (req, res) => {
  try {
    const allScreens = await Screen.findAll();
    const activeScreens = allScreens.filter(s => s.status === 'online' || s.status === 'offline');
    const tickets = await Ticket.findAll();
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Ticket metrics
    const recentTickets = tickets.filter(t => new Date(t.createdAt) >= since30d);
    const resolvedTickets = tickets.filter(t => t.resolvedAt && new Date(t.resolvedAt) >= since30d);
    const avgResolutionMs = resolvedTickets.length ? resolvedTickets.reduce((a, t) => a + (new Date(t.resolvedAt) - new Date(t.createdAt)), 0) / resolvedTickets.length : 0;

    // Offline duration by location
    const locationHealth = {};
    for (const s of allScreens) {
      const loc = s.location || 'Sem Local';
      if (!locationHealth[loc]) locationHealth[loc] = { total: 0, online: 0, offline: 0, avgUptime: 0, screens: [] };
      locationHealth[loc].total++;
      if (s.status === 'online') locationHealth[loc].online++;
      else if (s.status === 'offline') locationHealth[loc].offline++;
    }

    res.json({
      overview: {
        totalScreens: allScreens.length,
        activeScreens: activeScreens.length,
        onlineCount: allScreens.filter(s => s.status === 'online').length,
        offlineCount: allScreens.filter(s => s.status === 'offline').length,
      },
      tickets: {
        total: tickets.length,
        openNow: tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length,
        resolvedLast30d: resolvedTickets.length,
        createdLast30d: recentTickets.length,
        avgResolutionHours: (avgResolutionMs / (1000 * 60 * 60)).toFixed(1)
      },
      locationHealth,
      patterns: await detectPatterns()
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== VENDORS CRUD (admin only) =====
app.get('/vendors', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const vendors = await Vendor.findAll({ order: [['name', 'ASC']] });
    res.json(vendors);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/vendors', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const parsed = z.object({
      name: z.string().trim().min(1).max(120),
      phone: z.string().trim().min(8).max(30),
      email: z.string().trim().email().optional().or(z.literal(''))
    }).strict().safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos para vendedor' });

    const { name, phone, email } = parsed.data;
    if (!name || !phone) return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
    const vendor = await Vendor.create({ name, phone, email });
    res.status(201).json(vendor);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.patch('/vendors/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const parsed = z.object({
      name: z.string().trim().min(1).max(120).optional(),
      phone: z.string().trim().min(8).max(30).optional(),
      email: z.string().trim().email().optional().or(z.literal('')),
      active: z.boolean().optional()
    }).strict().safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Payload inválido para atualização de vendedor' });

    const vendor = await Vendor.findByPk(req.params.id);
    if (!vendor) return res.status(404).json({ error: 'Vendedor não encontrado' });
    await vendor.update(parsed.data);
    res.json(vendor);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/vendors/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const vendor = await Vendor.findByPk(req.params.id);
    if (!vendor) return res.status(404).json({ error: 'Vendedor não encontrado' });
    await vendor.destroy();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== CONTRACTS =====
app.get('/contracts', authenticateToken, async (req, res) => {
  try {
    const contracts = await Contract.findAll({ include: [{ model: Vendor, required: false }], order: [['expirationDate', 'ASC']] });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const occupiedSlotsCurrentCycle = contracts.filter((contract) => {
      if (!contract.expirationDate) return false;
      const expDate = new Date(`${contract.expirationDate}T00:00:00`);
      return expDate >= today;
    }).length;

    res.json(contracts.map((contract) => ({
      ...contract.toJSON(),
      occupiedSlotsCurrentCycle,
      totalCycleSlots: CONTRACT_TOTAL_CYCLE_SLOTS
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/contracts/:id/follow-up', authenticateToken, async (req, res) => {
  try {
    const actorRole = normalizeUserRole(req.user?.role);
    if (!['admin', 'comercial'].includes(actorRole)) {
      return res.status(403).json({ error: 'Somente Comercial ou Admin pode atualizar follow-up de contratos.' });
    }

    const contract = await Contract.findByPk(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Contrato não encontrado' });

    const action = String(req.body?.action || '').trim();
    const now = new Date();

    if (!['contacted', 'renewed', 'not_renewed', 'reset'].includes(action)) {
      return res.status(400).json({ error: 'Ação inválida. Use: contacted, renewed, not_renewed ou reset.' });
    }

    const update = { salesUpdatedBy: req.user?.username || null };
    if (action === 'contacted') {
      update.salesFollowUpStatus = 'contacted';
      update.salesContactedAt = contract.salesContactedAt || now;
      update.salesOutcomeAt = null;
    } else if (action === 'renewed') {
      update.salesFollowUpStatus = 'renewed';
      update.salesContactedAt = contract.salesContactedAt || now;
      update.salesOutcomeAt = now;
    } else if (action === 'not_renewed') {
      update.salesFollowUpStatus = 'not_renewed';
      update.salesContactedAt = contract.salesContactedAt || now;
      update.salesOutcomeAt = now;
    } else {
      update.salesFollowUpStatus = 'pending';
      update.salesContactedAt = null;
      update.salesOutcomeAt = null;
      update.salesUpdatedBy = req.user?.username || null;
    }

    await contract.update(update);
    res.json(contract);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/contracts/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const contract = await Contract.findByPk(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Contrato não encontrado' });
    await contract.destroy();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Force notify vendor about a specific contract
app.post('/contracts/:id/notify', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const contract = await Contract.findByPk(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Contrato não encontrado' });
    const vendor = contract.vendorId ? await Vendor.findByPk(contract.vendorId) : null;
    if (!vendor) return res.status(400).json({ error: 'Contrato sem vendedor vinculado' });
    const msg = `📋 *CONTRATO A VENCER*\n\nAnunciante: ${contract.advertiser}\nVencimento: ${new Date(contract.expirationDate).toLocaleDateString('pt-BR')}\nValor: R$ ${(contract.value || 0).toLocaleString('pt-BR')}\nDias restantes: ${contract.daysRemaining}\n\n⚠️ Entre em contato para renovação.`;
    await sendNotification(msg, vendor.phone);
    await contract.update({ notified: true, lastNotifiedAt: new Date() });
    res.json({ success: true, message: `Notificação enviada para ${vendor.name} (${vendor.phone})` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(port, () => console.log(`API listening on ${port}`));

// ===== CHECKIN PHOTO REPORT =====
// In-memory client cache: { [originId]: { clients: string[], updatedAt: string } }
const checkinClientsCache = {};

function decodeHtmlEntities(text) {
  let value = String(text || '');
  value = value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code) || 0))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16) || 0));
  return value;
}

function normalizeClientName(rawName) {
  return decodeHtmlEntities(rawName)
    .replace(/\bamp;\b/gi, ' ')
    .replace(/^[;&\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clientCanonicalKey(name) {
  return normalizeClientName(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Parse group/client names from the campanhas-monitor HTML page
function parseMonitorClients(html) {
  const body = String(html || '');
  const clients = new Set();

  // Strategy 1: Text blocks matching [CODE] ClientName pattern in title/data attributes
  const attrBracket = /(?:title|data-nome|data-group)="([^"]*\[[A-Z0-9]+\][^"]*)"/gi;
  let m;
  while ((m = attrBracket.exec(body)) !== null) {
    extractClientFromGroupName(m[1], clients);
  }

  // Strategy 2: Raw text inside HTML that starts with [CODE]
  const rawBracket = /\[([A-Z0-9]{3,})\]\s*([^<|\n"]{2,80})/g;
  while ((m = rawBracket.exec(body)) !== null) {
    const raw = normalizeClientName(m[2]).replace(/\s*\|.*$/, '').trim();
    if (raw && raw.length > 2) {
      raw.split(/\s*&\s*|\s*\/\s*/).forEach(c => {
        const name = normalizeClientName(c);
        if (name && name.length > 2 && name.length < 80) clients.add(name);
      });
    }
  }

  // Strategy 3: anchor links to /grupos/ - extract their visible text
  const grupoLink = /href="[^"]*\/grupos\/[^"]*"[^>]*>([^<]{2,80})</gi;
  while ((m = grupoLink.exec(body)) !== null) {
    extractClientFromGroupName(m[1], clients);
  }

  return [...clients].filter(c => c.length > 2 && c.length < 100);
}

function extractClientFromGroupName(raw, set) {
  // Strip [CODE] prefix
  const withoutCode = normalizeClientName(String(raw || '').replace(/^\[([A-Z0-9]+)\]\s*/, '').trim());
  // Take portion before | (category marker)
  const beforePipe = withoutCode.split('|')[0].trim();
  if (!beforePipe || beforePipe.length < 2) return;
  // Split by & or / to handle multiple clients in one group
  beforePipe.split(/\s*&\s*|\s*\/\s*/).forEach(c => {
    const name = normalizeClientName(c);
    if (name && name.length > 2 && name.length < 80) set.add(name);
  });
}

async function scrapeCheckinClients(originId) {
  if (!originId || isOriginScrapeExcluded(originId)) return [];
  try {
    let resp = await axios.get(`${ORIGIN_BASE}/premium/campanhas-monitor/id/${originId}`, {
      headers: { Cookie: originCookies },
      timeout: 20000,
      httpsAgent: originHttpsAgent,
      validateStatus: () => true
    });
    if (!resp.data || String(resp.data).includes('action="/login/verifica"')) {
      const ok = await originLogin();
      if (!ok) return [];
      resp = await axios.get(`${ORIGIN_BASE}/premium/campanhas-monitor/id/${originId}`, {
        headers: { Cookie: originCookies },
        timeout: 20000,
        httpsAgent: originHttpsAgent,
        validateStatus: () => true
      });
    }
    if (!resp.data || resp.status !== 200) return [];
    return parseMonitorClients(resp.data);
  } catch (err) {
    console.warn(`checkin scrape [${originId}]: ${err.message}`);
    return [];
  }
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function normalizeLocationKey(locationName, locationType, city) {
  const raw = `${locationName || ''}|${locationType || ''}|${city || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, '-')
    .replace(/-+/g, '-');
  return raw.slice(0, 180);
}

function normalizeClientList(clients) {
  if (!Array.isArray(clients)) return [];
  const canonical = new Map();
  for (const c of clients) {
    const name = normalizeClientName(c);
    if (!name || name.length > 120) continue;

    const key = clientCanonicalKey(name);
    if (!key) continue;

    const existing = canonical.get(key);
    if (!existing || name.length > existing.length) {
      canonical.set(key, name);
    }
  }
  return [...canonical.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function normalizeCity(city) {
  // Strip trailing state suffix like "/PR", "/SP", etc., and normalize whitespace
  return String(city || '').trim().replace(/\s*\/\s*[A-Z]{2}$/i, '').trim();
}

function extractCityFromAddress(address) {
  const raw = String(address || '').trim();
  if (!raw) return '';

  const cityUfMatch = raw.match(/,\s*([^,\/]+)\s*\/\s*[A-Z]{2}\b/i);
  if (cityUfMatch) return normalizeCity(cityUfMatch[1].trim());

  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const candidate = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || '');
  return normalizeCity(candidate);
}

function isStaticLocation(locationName, locationType) {
  const text = `${locationName || ''} ${locationType || ''}`.toUpperCase();
  return text.includes('FRONTLIGHT') || text.includes('BACKLIGHT');
}

function normalizeCheckinLocations(locations) {
  const merged = new Map();
  for (const loc of (Array.isArray(locations) ? locations : [])) {
    const locationName = String(loc?.locationName || '').trim();
    const locationType = String(loc?.locationType || 'Sem categoria').trim() || 'Sem categoria';
    const city = normalizeCity(String(loc?.city || '').trim());
    if (!locationName) continue;
    if (isStaticLocation(locationName, locationType)) continue;

    const locationKey = String(loc?.locationKey || normalizeLocationKey(locationName, locationType, city));
    const clients = normalizeClientList(loc?.clients || []);

    if (!merged.has(locationKey)) {
      merged.set(locationKey, { locationKey, locationName, locationType, city, clients });
      continue;
    }

    const existing = merged.get(locationKey);
    existing.clients = normalizeClientList([...(existing.clients || []), ...clients]);
  }

  return [...merged.values()].sort((a, b) => {
    const typeCmp = a.locationType.localeCompare(b.locationType, 'pt-BR');
    if (typeCmp !== 0) return typeCmp;
    return a.locationName.localeCompare(b.locationName, 'pt-BR');
  });
}

async function getOrCreateNotificationConfig() {
  let cfg = await NotificationConfig.findOne();
  if (!cfg) cfg = await NotificationConfig.create({});
  return cfg;
}

async function loadStoredCheckinLocations() {
  const cfg = await getOrCreateNotificationConfig();
  const locations = normalizeCheckinLocations(parseJsonArray(cfg.checkinLocations));
  return { cfg, locations, updatedAt: cfg.checkinLocationsUpdatedAt || null };
}

async function saveStoredCheckinLocations(cfg, locations) {
  const normalized = normalizeCheckinLocations(locations);
  const updatedAt = new Date();
  await cfg.update({
    checkinLocations: JSON.stringify(normalized),
    checkinLocationsUpdatedAt: updatedAt
  });
  return { locations: normalized, updatedAt };
}

function parseSelectedOptionText(html, fieldName) {
  const source = String(html || '');
  const selectMatch = source.match(new RegExp(`<select[^>]*name=["']${fieldName}["'][^>]*>([\\s\\S]*?)<\\/select>`, 'i'));
  if (!selectMatch) return '';
  const selectBody = selectMatch[1];

  const selected = selectBody.match(/<option[^>]*selected[^>]*>([\s\S]*?)<\/option>/i);
  if (selected) {
    return selected[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  const firstOption = selectBody.match(/<option[^>]*>([\s\S]*?)<\/option>/i);
  if (firstOption) {
    return firstOption[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  return '';
}

async function scrapeOriginMonitorType(originId) {
  if (!originId || isOriginScrapeExcluded(originId)) return '';
  const url = `${ORIGIN_BASE}/locais/adicionar-monitor/id/${originId}`;
  try {
    let resp = await axios.get(url, {
      headers: { Cookie: originCookies },
      timeout: 15000,
      httpsAgent: originHttpsAgent,
      validateStatus: () => true
    });

    if (!resp.data || String(resp.data).includes('action="/login/verifica"')) {
      const ok = await originLogin();
      if (!ok) return '';
      resp = await axios.get(url, {
        headers: { Cookie: originCookies },
        timeout: 15000,
        httpsAgent: originHttpsAgent,
        validateStatus: () => true
      });
    }

    if (resp.status !== 200 || !resp.data) return '';
    return parseSelectedOptionText(resp.data, 'tipo_tela');
  } catch (err) {
    console.warn(`checkin type scrape [${originId}]: ${err.message}`);
    return '';
  }
}

// GET /checkin/report — returns persisted list (no automatic scraping)
app.get('/checkin/report', authenticateToken, async (req, res) => {
  try {
    const { locations, updatedAt } = await loadStoredCheckinLocations();
    const cities = [...new Set(locations.map((l) => l.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const types = [...new Set(locations.map((l) => l.locationType).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    res.json({
      locations,
      cities,
      types,
      updatedAt,
      total: locations.length,
      mode: 'snapshot'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /checkin/snapshot — one-time collection from origin (admin)
app.post('/checkin/snapshot', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const screens = await Screen.findAll({
      where: { originId: { [Op.not]: null } },
      attributes: ['id', 'name', 'location', 'address', 'originId'],
      order: [['location', 'ASC'], ['name', 'ASC']]
    });

    const grouped = new Map();
    for (const s of screens) {
      if (isStaticMedia(s)) continue;
      const locationName = String(s.location || '').trim();
      if (!locationName) continue;
      if (!grouped.has(locationName)) grouped.set(locationName, []);
      grouped.get(locationName).push(s);
    }

    const typeCache = new Map();
    const locations = [];

    for (const [locationName, locScreens] of grouped.entries()) {
      const primary = locScreens[0];
      const city = extractCityFromAddress(primary?.address);

      let locationType = '';
      if (primary?.originId) {
        if (!typeCache.has(primary.originId)) {
          typeCache.set(primary.originId, await scrapeOriginMonitorType(primary.originId));
        }
        locationType = typeCache.get(primary.originId) || '';
      }

      locationType = String(locationType || 'Sem categoria').trim() || 'Sem categoria';
      if (isStaticLocation(locationName, locationType)) continue;

      const clientsSet = new Set();
      const sampleScreens = locScreens.slice(0, 6);
      for (const s of sampleScreens) {
        const clients = await scrapeCheckinClients(s.originId);
        checkinClientsCache[s.originId] = { clients, updatedAt: new Date().toISOString() };
        for (const c of clients) clientsSet.add(c);
      }

      locations.push({
        locationKey: normalizeLocationKey(locationName, locationType, city),
        locationName,
        locationType,
        city,
        clients: normalizeClientList([...clientsSet])
      });
    }

    const cfg = await getOrCreateNotificationConfig();
    const saved = await saveStoredCheckinLocations(cfg, locations);

    res.json({
      success: true,
      message: `Snapshot concluído com ${saved.locations.length} locais`,
      total: saved.locations.length,
      updatedAt: saved.updatedAt,
      locations: saved.locations
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Backward compatibility: old sync endpoint now points to snapshot behavior
app.post('/checkin/sync', authenticateToken, requireAdmin, async (req, res) => {
  req.url = '/checkin/snapshot';
  req.path = '/checkin/snapshot';
  return res.status(410).json({
    error: 'Endpoint legado. Use POST /checkin/snapshot para coletar dados uma vez.'
  });
});

// POST /checkin/locations — manually add a location (admin)
app.post('/checkin/locations', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const locationName = String(req.body?.locationName || '').trim();
    const locationType = String(req.body?.locationType || '').trim() || 'Sem categoria';
    const city = normalizeCity(String(req.body?.city || '').trim());
    const clients = normalizeClientList(req.body?.clients || []);

    if (!locationName) {
      return res.status(400).json({ error: 'locationName é obrigatório' });
    }
    if (isStaticLocation(locationName, locationType)) {
      return res.status(400).json({ error: 'Frontlight/Backlight não devem entrar no checkin' });
    }

    const { cfg, locations } = await loadStoredCheckinLocations();
    const locationKey = normalizeLocationKey(locationName, locationType, city);
    const exists = locations.some((l) => l.locationKey === locationKey);
    if (exists) {
      return res.status(409).json({ error: 'Local já existe na lista' });
    }

    const saved = await saveStoredCheckinLocations(cfg, [
      ...locations,
      { locationKey, locationName, locationType, city, clients }
    ]);

    res.json({ success: true, locations: saved.locations, updatedAt: saved.updatedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /checkin/locations/:locationKey — remove location from list (admin)
app.delete('/checkin/locations/:locationKey', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const locationKey = String(req.params.locationKey || '').trim();
    if (!locationKey) return res.status(400).json({ error: 'locationKey é obrigatório' });

    const { cfg, locations } = await loadStoredCheckinLocations();
    const next = locations.filter((l) => l.locationKey !== locationKey);
    if (next.length === locations.length) {
      return res.status(404).json({ error: 'Local não encontrado' });
    }

    const saved = await saveStoredCheckinLocations(cfg, next);
    res.json({ success: true, locations: saved.locations, updatedAt: saved.updatedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Note: No local heartbeat interval — the origin system sync (every 2 min)
// is the single source of truth for all screen statuses.
// Local heartbeat endpoints (/screens/:id/heartbeat, /heartbeat/:displayId)
// are kept for future direct-device integrations but don't override origin status.

// === Periodic sync with original system (sistema.redeintermidia.com)
// Scrapes the monitoring page to get real-time status of all monitors
const https = require('https');
const ORIGIN_BASE = process.env.ORIGIN_BASE;
const ORIGIN_USER = process.env.ORIGIN_USER;
const ORIGIN_PASS = process.env.ORIGIN_PASS;
const SYNC_INTERVAL_MS = 120000; // 2 minutes
const LOOP_TARGET_SECONDS = parseInt(process.env.LOOP_TARGET_SECONDS || '180', 10);
const LOOP_SYNC_INTERVAL_MS = parseInt(process.env.LOOP_SYNC_INTERVAL_MS || String(7 * 24 * 60 * 60 * 1000), 10); // 1 week
const originHttpsAgent = new https.Agent({ rejectUnauthorized: false });

if (!ORIGIN_BASE || !ORIGIN_USER || !ORIGIN_PASS) {
  throw new Error('Missing ORIGIN_BASE, ORIGIN_USER or ORIGIN_PASS environment variables');
}

let originCookies = '';
let loopSyncInProgress = false;
let loopSyncLastRunAt = null;
let loopCityNotifyInProgress = false;
const ORIGIN_SCRAPE_EXCLUDED_IDS = new Set([318]);

function isOriginScrapeExcluded(originId) {
  const id = parseInt(originId, 10);
  return Number.isInteger(id) && ORIGIN_SCRAPE_EXCLUDED_IDS.has(id);
}

async function originLogin() {
  try {
    // Step 1: GET login page to obtain PHPSESSID cookie
    const loginPage = await axios.get(`${ORIGIN_BASE}/login`, {
      timeout: 15000, validateStatus: () => true, maxRedirects: 0, httpsAgent: originHttpsAgent
    });
    const initCookies = (loginPage.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    if (!initCookies) {
      console.error('Origin login: no session cookie received');
      return false;
    }

    // Step 2: POST credentials with the session cookie
    await axios.post(`${ORIGIN_BASE}/login/verifica`, 
      `login=${encodeURIComponent(ORIGIN_USER)}&senha=${encodeURIComponent(ORIGIN_PASS)}`,
      { 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: initCookies },
        maxRedirects: 0,
        timeout: 15000,
        httpsAgent: originHttpsAgent,
        validateStatus: () => true
      }
    );
    originCookies = initCookies;
    console.log('Origin login successful');
    return true;
  } catch (err) {
    console.error('Origin login failed:', err.message);
    return false;
  }
}

function parseMonitorBlock(block, id, isOnline) {
  const isVertical = block.includes('tv_vert');
  
  // Get name from the div title attribute (e.g. "267 - BIG WHEEL | LED - BCBIG WHEEL LED")
  const nameMatch = block.match(/title="(\d+\s*-\s*[^"]*)"/);
  const nameRaw = nameMatch ? nameMatch[1] : '';
  const nameParts = nameRaw.match(/^\d+\s*-\s*(.+)/);
  const name = nameParts ? nameParts[1].trim() : nameRaw.trim();

  // Check if this is static media (FRONTLIGHT/BACKLIGHT) — only check the monitor's own name
  const isStatic = /FRONTLIGHT|BACKLIGHT/i.test(name);

  if (isOnline) {
    const statsMatch = block.match(/title="(\d+ Minutos[^"]*)"/);
    const statsRaw = statsMatch ? statsMatch[1] : '';

    const minutesMatch = statsRaw.match(/^(\d+) Minutos/);
    const minutesAgo = minutesMatch ? parseInt(minutesMatch[1]) : null;
    const lastUpdateMatch = statsRaw.match(/Ult\. Atu: (\S+ \S+)/);
    const lastUpdate = lastUpdateMatch ? lastUpdateMatch[1] : null;
    const tempMatch = statsRaw.match(/CPU Temp: ([\d.]+)/);
    const cpuTemp = tempMatch ? parseFloat(tempMatch[1]) : null;
    const cpuMatch = statsRaw.match(/CPU Uso: ([^\n]+)/);
    const cpuUsage = cpuMatch ? cpuMatch[1].trim() : null;
    const diskMatch = statsRaw.match(/Disk: ([^\n]+)/);
    const disk = diskMatch ? diskMatch[1].trim() : null;
    const uptimeMatch = statsRaw.match(/Uptime:\s*([^\n]+)/);
    const uptime = uptimeMatch ? uptimeMatch[1].trim() : null;
    const appVerMatch = statsRaw.match(/App Ver: ([^\n]+)/);
    const appVersion = appVerMatch ? appVerMatch[1].trim() : null;

    return {
      originId: id, name, status: isStatic ? 'static' : 'online', minutesAgo, lastUpdate,
      orientation: isVertical ? 'vertical' : 'horizontal',
      stats: JSON.stringify({ cpuTemp, cpuUsage, disk, uptime, appVersion })
    };
  } else {
    const offlineMatch = block.match(/title="(Offline[^"]*)"/);
    const offlineInfo = offlineMatch ? offlineMatch[1] : '';
    const sinceDateMatch = offlineInfo.match(/Offline desde (\S+ \S+)/);
    const offlineSince = sinceDateMatch ? sinceDateMatch[1] : null;

    // "Offline desde 0000-00-00 00:00:00" = never connected = not installed
    const neverInstalled = offlineInfo.includes('0000-00-00');

    let status;
    if (isStatic) status = 'static';
    else if (neverInstalled) status = 'not_installed';
    else status = 'offline';

    return {
      originId: id, name, status, offlineSince: neverInstalled ? null : offlineSince,
      orientation: isVertical ? 'vertical' : 'horizontal',
      stats: null
    };
  }
}

function parseMonitorPage(html) {
  const monitors = [];
  const offlineIdx = html.indexOf('OFFLINE');
  const onlineHtml = offlineIdx > 0 ? html.substring(0, offlineIdx) : html;
  const offlineHtml = offlineIdx > 0 ? html.substring(offlineIdx) : '';

  function parseSection(sectionHtml, isOnline) {
    const pattern = /campanhas\/monitor\/(\d+)'/g;
    let m;
    const matches = [];
    while ((m = pattern.exec(sectionHtml)) !== null) {
      matches.push({ id: parseInt(m[1]), index: m.index });
    }
    for (let i = 0; i < matches.length; i++) {
      const start = Math.max(0, matches[i].index - 300);
      const end = i + 1 < matches.length ? matches[i + 1].index : matches[i].index + 3000;
      const block = sectionHtml.substring(start, end);
      try {
        monitors.push(parseMonitorBlock(block, matches[i].id, isOnline));
      } catch (e) { /* skip malformed entries */ }
    }
  }

  parseSection(onlineHtml, true);
  parseSection(offlineHtml, false);
  return monitors.filter((mon) => !isOriginScrapeExcluded(mon.originId));
}

async function syncWithOrigin() {
  try {
    // Try fetching the monitoring page
    let resp;
    try {
      resp = await axios.get(`${ORIGIN_BASE}/index/index3`, {
        headers: { Cookie: originCookies },
        timeout: 20000,
        maxRedirects: 5,
        httpsAgent: originHttpsAgent,
        validateStatus: () => true
      });
    } catch (err) {
      console.warn('Origin fetch failed:', err.message);
      return;
    }

    // If redirected to login, re-authenticate
    if (!resp.data || resp.data.length < 10000 || resp.data.includes('action="/login/verifica"')) {
      console.log('Origin session expired, re-authenticating...');
      const loggedIn = await originLogin();
      if (!loggedIn) return;
      
      resp = await axios.get(`${ORIGIN_BASE}/index/index3`, {
        headers: { Cookie: originCookies },
        timeout: 20000,
        maxRedirects: 5,
        httpsAgent: originHttpsAgent,
        validateStatus: () => true
      });
    }

    const monitors = parseMonitorPage(resp.data);
    if (!monitors.length) {
      console.warn('Origin sync: no monitors parsed');
      return;
    }

    console.log(`Origin sync: parsed ${monitors.length} monitors (${monitors.filter(m => m.status === 'online').length} online, ${monitors.filter(m => m.status === 'offline').length} offline, ${monitors.filter(m => m.status === 'not_installed').length} not_installed, ${monitors.filter(m => m.status === 'static').length} static)`);

    for (const mon of monitors) {
      try {
        // Find existing screen by originId
        let screen = await Screen.findOne({ where: { originId: mon.originId } });
        
        if (!screen) {
          // Try matching by displayId (legacy)
          screen = await Screen.findOne({ where: { displayId: String(mon.originId) } });
          if (screen && !screen.originId) {
            await screen.update({ originId: mon.originId });
          }
        }

        if (screen) {
          // Update existing screen — trust the parser's status detection
          const updates = {};
          if (screen.status !== mon.status) {
            updates.status = mon.status;
          }
          if (mon.stats) updates.stats = mon.stats;
          if (mon.orientation) updates.orientation = mon.orientation;
          if (mon.lastUpdate) {
            // Parse "10/03/26 11:16:08" format
            const parts = mon.lastUpdate.match(/(\d{2})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}:\d{2})/);
            if (parts) {
              const hb = new Date(`20${parts[3]}-${parts[2]}-${parts[1]}T${parts[4]}`);
              if (!isNaN(hb.getTime())) updates.lastHeartbeat = hb;
            }
          }

          if (Object.keys(updates).length) {
            const prevStatus = screen.status;
            await screen.update(updates);
            if (prevStatus !== mon.status) {
              await logStatusChange(screen, mon.status);
            }
          }

          // Record telemetry snapshot
          try {
            const snap = { screenId: screen.id, status: mon.status };
            if (mon.stats) {
              const parsed = JSON.parse(mon.stats);
              if (parsed.cpuTemp != null) snap.cpuTemp = parsed.cpuTemp;
              if (parsed.cpuUsage) {
                const pct = parseFloat(parsed.cpuUsage);
                if (!isNaN(pct)) snap.cpuUsage = pct;
              }
              if (parsed.disk) {
                const usedM = parsed.disk.match(/Used ([\d.]+)G/);
                const availM = parsed.disk.match(/Avail ([\d.]+)G/);
                const pctM = parsed.disk.match(/Pct:\s*(\d+)/);
                if (usedM) snap.diskUsedGB = parseFloat(usedM[1]);
                if (availM) snap.diskAvailGB = parseFloat(availM[1]);
                if (pctM) snap.diskPct = parseFloat(pctM[1]);
              }
              if (parsed.uptime) snap.uptimeRaw = parsed.uptime;
              if (parsed.appVersion) snap.appVersion = parsed.appVersion;
            }
            await TelemetrySnapshot.create(snap);
          } catch (telErr) { /* skip telemetry errors */ }
        }
        // Note: we don't auto-create screens from origin — use the import endpoint for that
      } catch (err) {
        // skip individual screen errors
      }
    }
  } catch (err) {
    console.error('Origin sync error:', err.message);
  }
}

// Initial login + sync on startup (delayed)
setTimeout(async () => {
  await originLogin();
  await syncWithOrigin();
}, 5000);

// Periodic sync
setInterval(syncWithOrigin, SYNC_INTERVAL_MS);

// Weekly loop/cycle audit for commercial capacity planning
setTimeout(() => {
  syncLoopAuditsFromOrigin('startup').catch(() => {});
}, 15000);
setInterval(async () => {
  try {
    await syncLoopAuditsFromOrigin('weekly');
    const notifyResult = await sendLoopCitySummariesToVendors({ trigger: 'weekly-auto' });
    if (notifyResult.success) {
      console.log(`Weekly loop city WhatsApp: ${notifyResult.sentMessages} mensagens enviadas`);
    } else {
      console.log(`Weekly loop city WhatsApp skipped: ${notifyResult.message || notifyResult.error || 'unknown reason'}`);
    }
  } catch (err) {
    console.error('Weekly loop city notify error:', err.message);
  }
}, LOOP_SYNC_INTERVAL_MS);

// Scrape /locais/monitores to get monitor -> location mapping
async function scrapeLocationMapping() {
  let resp;
  try {
    resp = await axios.get(`${ORIGIN_BASE}/locais/monitores`, {
      headers: { Cookie: originCookies },
      timeout: 30000,
      httpsAgent: originHttpsAgent,
      validateStatus: () => true
    });
  } catch (err) {
    console.warn('Location fetch failed:', err.message);
    return null;
  }

  if (!resp.data || resp.data.length < 5000 || resp.data.includes('action="/login/verifica"')) {
    await originLogin();
    resp = await axios.get(`${ORIGIN_BASE}/locais/monitores`, {
      headers: { Cookie: originCookies },
      timeout: 30000,
      httpsAgent: originHttpsAgent,
      validateStatus: () => true
    });
  }

  const html = resp.data;
  const locPattern = /<th class="col-md-3 local"><b>([^<]+)<\/b><\/th>/g;
  let m;
  const locations = [];
  while ((m = locPattern.exec(html)) !== null) {
    locations.push({ raw: m[1], index: m.index });
  }

  const mapping = {}; // monitorId -> { location, city }
  for (let i = 0; i < locations.length; i++) {
    const start = locations[i].index;
    const end = i + 1 < locations.length ? locations[i + 1].index : html.length;
    const section = html.substring(start, end);

    // Clean location name: remove " - N monitor(es)" suffix
    const locName = locations[i].raw.replace(/\s*-\s*\d+\s+monit\w+\s*$/, '').trim();

    // Find monitors from <tr class="tr_listagem" data-id="XXX">
    const trPattern = /tr_listagem"?\s+data-id="(\d+)"/g;
    let tm;
    while ((tm = trPattern.exec(section)) !== null) {
      const monId = parseInt(tm[1]);
      if (!Number.isInteger(monId) || isOriginScrapeExcluded(monId)) continue;
      const rowStart = tm.index;
      const rowEnd = section.indexOf('</tr>', rowStart);
      const row = section.substring(rowStart, rowEnd > 0 ? rowEnd : rowStart + 2000);
      const cityMatch = row.match(/<td class="col-md-1">([^<]+)<\/td>/);
      const city = cityMatch ? cityMatch[1].trim() : '';
      mapping[monId] = { location: locName, city };
    }
  }

  console.log(`Location mapping: ${Object.keys(mapping).length} monitors mapped to ${locations.length} locations`);
  return mapping;
}

function parseLoopSeconds(rawValue) {
  if (rawValue == null) return null;
  const raw = String(rawValue).trim();
  if (!raw) return null;

  const normalized = raw.replace(',', '.');
  const num = parseFloat(normalized.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(num)) return null;

  // tempo_ciclo from origin forms is usually in seconds (e.g. 300)
  if (/min/i.test(normalized)) {
    return Math.max(0, Math.round(num * 60));
  }
  return Math.max(0, Math.round(num));
}

function parseClockToSeconds(clockValue) {
  if (!clockValue) return null;
  const m = String(clockValue).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const minutes = parseInt(m[1], 10);
  const seconds = parseInt(m[2], 10);
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || seconds > 59) return null;
  return (minutes * 60) + seconds;
}

function parseLoopFromMonitorHtml(html) {
  const body = String(html || '');
  if (!body) return { loopSeconds: null, loopDisplay: null };

  // Preferred source: script assignment that updates the loop stat widget.
  // Example: document.getElementById('tempoCiclo').textContent = '02:07';
  const tempoCicloSetRegex = /getElementById\(['\"]tempoCiclo['\"]\)\.textContent\s*=\s*['\"](\d{1,2}:\d{2})['\"]/gi;
  const tempoCicloMatches = [...body.matchAll(tempoCicloSetRegex)];
  if (tempoCicloMatches.length) {
    const candidate = tempoCicloMatches[tempoCicloMatches.length - 1][1];
    const seconds = parseClockToSeconds(candidate);
    if (Number.isFinite(seconds)) return { loopSeconds: seconds, loopDisplay: candidate };
  }

  // Prefer the clock nearest to the "CICLO" badge (e.g. 02:07 CICLO)
  const cicloIdx = body.toUpperCase().indexOf('CICLO');
  if (cicloIdx >= 0) {
    const start = Math.max(0, cicloIdx - 240);
    const snippet = body.substring(start, cicloIdx + 120);
    const clocks = snippet.match(/\b\d{1,2}:\d{2}\b/g);
    if (clocks && clocks.length) {
      const candidate = clocks[clocks.length - 1];
      const seconds = parseClockToSeconds(candidate);
      if (Number.isFinite(seconds)) return { loopSeconds: seconds, loopDisplay: candidate };
    }
  }

  return { loopSeconds: null, loopDisplay: null };
}

function isStaticLoopMediaByText(...values) {
  const combined = values
    .map((value) => String(value || '').toUpperCase())
    .join(' ');
  return combined.includes('FRONTLIGHT') || combined.includes('BACKLIGHT');
}

function classifyLoopRisk(loopSeconds, targetSeconds = LOOP_TARGET_SECONDS) {
  if (!Number.isFinite(loopSeconds)) {
    return {
      riskLevel: 'unknown',
      riskScore: 0,
      riskMessage: 'Loop indisponível',
      remainingSeconds: 0,
      availableSlots10: 0,
      availableSlots15: 0,
      estimatedUsedSlots10: 0,
      estimatedUsedSlots15: 0
    };
  }

  const remainingSeconds = Math.max(0, targetSeconds - loopSeconds);
  const availableSlots10 = Math.floor(remainingSeconds / 10);
  const availableSlots15 = Math.floor(remainingSeconds / 15);
  const estimatedUsedSlots10 = Math.floor(loopSeconds / 10);
  const estimatedUsedSlots15 = Math.floor(loopSeconds / 15);
  const ratio = targetSeconds > 0 ? loopSeconds / targetSeconds : 0;

  let riskLevel = 'low';
  let riskMessage = 'Saudável para comercial';
  let riskScore = Math.round(ratio * 1000);

  if (loopSeconds >= targetSeconds) {
    riskLevel = 'critical';
    riskMessage = 'No limite ou acima do padrão';
    riskScore = 10000 + (loopSeconds - targetSeconds);
  } else if (ratio >= 0.9) {
    riskLevel = 'high';
    riskMessage = 'Muito próximo do limite';
    riskScore = 7000 + Math.round(ratio * 1000);
  } else if (ratio >= 0.75) {
    riskLevel = 'medium';
    riskMessage = 'Atenção comercial';
    riskScore = 4000 + Math.round(ratio * 1000);
  }

  return {
    riskLevel,
    riskScore,
    riskMessage,
    remainingSeconds,
    availableSlots10,
    availableSlots15,
    estimatedUsedSlots10,
    estimatedUsedSlots15
  };
}

function normalizeLoopCityName(rawCity, locationText = '') {
  const toSlug = (value = '') => String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const toTitle = (value = '') => value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

  const canonicalBySlug = {
    bc: 'Balneario Camboriu',
    'balneario camboriu': 'Balneario Camboriu',
    itajai: 'Itajai',
    londrina: 'Londrina',
    maringa: 'Maringa'
  };

  const candidates = [];
  const cityText = String(rawCity || '').trim();
  if (cityText) {
    const cityUfMatch = cityText.match(/([A-Za-zÀ-ÿ\s'\-]+)\s*\/[A-Za-z]{2}\b/i);
    if (cityUfMatch && cityUfMatch[1]) candidates.push(cityUfMatch[1]);
    const commaParts = cityText.split(',').map((part) => part.trim()).filter(Boolean);
    if (commaParts.length > 1) candidates.push(commaParts[commaParts.length - 1]);
    candidates.push(cityText);
  }

  const loc = String(locationText || '').trim();
  const locationCity = loc.match(/-\s*([A-Za-zÀ-ÿ\s'\-]+)$/);
  if (locationCity && locationCity[1]) candidates.push(locationCity[1]);

  for (const candidate of candidates) {
    const slug = toSlug(candidate);
    if (!slug) continue;
    const noUf = slug.replace(/\s+[a-z]{2}$/, '').trim();
    if (canonicalBySlug[noUf]) return canonicalBySlug[noUf];
    if (canonicalBySlug[slug]) return canonicalBySlug[slug];
    return toTitle(noUf || slug);
  }

  return 'Sem cidade';
}

function buildLoopCityMessage(cityName, rows, targetSeconds = LOOP_TARGET_SECONDS) {
  const lines = [
    `*Relatorio de Loops - ${cityName}*`,
    `Meta: ${Math.floor(targetSeconds / 60)}:${String(targetSeconds % 60).padStart(2, '0')}`,
    ''
  ];

  rows.forEach((row) => {
    const loopSeconds = Number.isFinite(row.loopSeconds) ? row.loopSeconds : 0;
    const freeSeconds = Number.isFinite(row.remainingSeconds) ? row.remainingSeconds : 0;
    const loopClock = `${String(Math.floor(loopSeconds / 60)).padStart(2, '0')}:${String(loopSeconds % 60).padStart(2, '0')}`;
    const freeClock = `${String(Math.floor(freeSeconds / 60)).padStart(2, '0')}:${String(freeSeconds % 60).padStart(2, '0')}`;
    const risk = String(row.riskLevel || 'unknown').toUpperCase();
    lines.push(`- ${row.location || row.screenName || `Monitor ${row.originId}`}: loop ${loopClock} | ${freeClock} livre | risco ${risk}`);
  });

  return lines.join('\n');
}

async function sendLoopCitySummariesToVendors({ cityFilter = 'all', vendorId = null, trigger = 'manual' } = {}) {
  if (loopCityNotifyInProgress) {
    return { success: false, skipped: true, message: 'Loop city notification already in progress' };
  }

  loopCityNotifyInProgress = true;
  try {
    let vendorsWhere = { active: true };
    if (vendorId) vendorsWhere = { ...vendorsWhere, id: vendorId };

    const vendors = await Vendor.findAll({ where: vendorsWhere, order: [['name', 'ASC']] });
    if (!vendors.length) return { success: false, message: 'Nenhum vendedor ativo encontrado para envio' };

    const auditsRaw = await LoopAudit.findAll({
      where: { originId: { [Op.notIn]: [...ORIGIN_SCRAPE_EXCLUDED_IDS] } },
      order: [['riskScore', 'DESC'], ['loopSeconds', 'DESC']]
    });

    const groupedByCity = {};
    for (const row of auditsRaw) {
      if (isStaticLoopMediaByText(row.screenName, row.location)) continue;
      const city = normalizeLoopCityName(row.city, row.location);
      if (cityFilter !== 'all' && city !== cityFilter) continue;
      if (!groupedByCity[city]) groupedByCity[city] = [];
      groupedByCity[city].push(row);
    }

    const cityNames = Object.keys(groupedByCity).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (!cityNames.length) return { success: false, message: 'Nenhum dado de loop encontrado para o filtro selecionado' };

    let sentMessages = 0;
    for (const cityName of cityNames) {
      const rows = groupedByCity[cityName];
      const message = buildLoopCityMessage(cityName, rows, LOOP_TARGET_SECONDS);
      for (const vendor of vendors) {
        if (!vendor.phone) continue;
        await sendNotification(message, vendor.phone);
        sentMessages += 1;
      }
    }

    return {
      success: true,
      trigger,
      cityCount: cityNames.length,
      vendorCount: vendors.length,
      sentMessages,
      cities: cityNames
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    loopCityNotifyInProgress = false;
  }
}

async function scrapePremiumMonitorIds() {
  let resp;
  try {
    resp = await axios.get(`${ORIGIN_BASE}/premium/locais`, {
      headers: { Cookie: originCookies },
      timeout: 30000,
      httpsAgent: originHttpsAgent,
      validateStatus: () => true
    });
  } catch (err) {
    console.warn('Premium locais fetch failed:', err.message);
    return [];
  }

  if (!resp.data || resp.data.includes('action="/login/verifica"')) {
    const loggedIn = await originLogin();
    if (!loggedIn) return [];
    resp = await axios.get(`${ORIGIN_BASE}/premium/locais`, {
      headers: { Cookie: originCookies },
      timeout: 30000,
      httpsAgent: originHttpsAgent,
      validateStatus: () => true
    });
  }

  const html = resp.data || '';
  const ids = new Set();
  const patterns = [
    /adicionar-monitor\/id\/(\d+)/g,
    /premium\/campanhas-monitor\/id\/(\d+)/g,
    /campanhas\/monitor\/(\d+)/g,
    /data-id="(\d+)"/g
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(html)) !== null) {
      const id = parseInt(m[1], 10);
      if (Number.isInteger(id) && id > 0 && !isOriginScrapeExcluded(id)) ids.add(id);
    }
  }

  return [...ids];
}

async function fetchOriginMonitorCycle(originId) {
  if (isOriginScrapeExcluded(originId)) return null;
  let resp;
  try {
    resp = await axios.get(`${ORIGIN_BASE}/locais/adicionar-monitor/id/${originId}`, {
      headers: { Cookie: originCookies },
      timeout: 20000,
      httpsAgent: originHttpsAgent,
      validateStatus: () => true
    });
  } catch (err) {
    return null;
  }

  if (!resp.data || String(resp.data).includes('action="/login/verifica"')) {
    const loggedIn = await originLogin();
    if (!loggedIn) return null;
    resp = await axios.get(`${ORIGIN_BASE}/locais/adicionar-monitor/id/${originId}`, {
      headers: { Cookie: originCookies },
      timeout: 20000,
      httpsAgent: originHttpsAgent,
      validateStatus: () => true
    });
  }

  if (!resp.data || resp.status !== 200) return null;

  const cheerio = require('cheerio');
  const $ = cheerio.load(resp.data);
  const tempoCicloRaw = String($('[name="tempo_ciclo"]').val() || '').trim();
  const nome = String($('[name="nome"]').val() || '').trim();
  const vinculoText = String($('[name="vinculo"] option:selected').text() || '').trim();
  const formLoopSeconds = parseLoopSeconds(tempoCicloRaw);

  // Also try scraping the monitor page itself to read the current loop clock (MM:SS)
  let monitorLoopSeconds = null;
  let monitorLoopDisplay = null;
  try {
    let monitorResp = await axios.get(`${ORIGIN_BASE}/premium/campanhas-monitor/id/${originId}`, {
      headers: { Cookie: originCookies },
      timeout: 20000,
      httpsAgent: originHttpsAgent,
      validateStatus: () => true
    });

    if (!monitorResp.data || String(monitorResp.data).includes('action="/login/verifica"')) {
      const loggedIn = await originLogin();
      if (loggedIn) {
        monitorResp = await axios.get(`${ORIGIN_BASE}/premium/campanhas-monitor/id/${originId}`, {
          headers: { Cookie: originCookies },
          timeout: 20000,
          httpsAgent: originHttpsAgent,
          validateStatus: () => true
        });
      }
    }

    const parsedMonitorLoop = parseLoopFromMonitorHtml(monitorResp.data || '');
    monitorLoopSeconds = parsedMonitorLoop.loopSeconds;
    monitorLoopDisplay = parsedMonitorLoop.loopDisplay;
  } catch (err) {
    // keep fallback from monitor form tempo_ciclo
  }

  const chosenLoopSeconds = Number.isFinite(monitorLoopSeconds) ? monitorLoopSeconds : formLoopSeconds;
  const chosenLoopRaw = monitorLoopDisplay || tempoCicloRaw;

  return {
    originId,
    tempoCicloRaw: chosenLoopRaw,
    loopSeconds: chosenLoopSeconds,
    name: nome,
    vinculo: vinculoText,
    sourceUrl: `${ORIGIN_BASE}/premium/campanhas-monitor/id/${originId}`
  };
}

async function syncLoopAuditsFromOrigin(reason = 'manual') {
  if (loopSyncInProgress) {
    return { success: false, skipped: true, message: 'Loop sync already in progress' };
  }

  loopSyncInProgress = true;
  const startedAt = new Date();
  try {
    const locationMap = await scrapeLocationMapping() || {};
    const premiumIds = await scrapePremiumMonitorIds();
    const fallbackIds = Object.keys(locationMap).map((id) => parseInt(id, 10)).filter(Number.isInteger);
    const ids = [...new Set([...premiumIds, ...fallbackIds])].filter((id) => !isOriginScrapeExcluded(id));

    if (!ids.length) {
      return { success: false, message: 'Nenhum monitor encontrado no scraping de loop' };
    }

    let updated = 0;
    let withLoop = 0;
    let missingLoop = 0;

    for (const originId of ids) {
      const cycle = await fetchOriginMonitorCycle(originId);
      if (!cycle) continue;

      const screen = await Screen.findOne({ where: { originId } });
      const locInfo = locationMap[originId] || {};
      const resolvedName = (screen && screen.name) || cycle.name || `Monitor ${originId}`;
      const resolvedLocation = (screen && screen.location) || locInfo.location || cycle.vinculo || null;

      // Static media (frontlight/backlight) must not participate in commercial loop/cota audit.
      const isStaticLoopMedia =
        (screen && screen.status === 'static') ||
        isStaticLoopMediaByText(resolvedName, resolvedLocation, cycle.vinculo);

      if (isStaticLoopMedia) {
        await LoopAudit.destroy({ where: { originId } });
        continue;
      }

      const risk = classifyLoopRisk(cycle.loopSeconds, LOOP_TARGET_SECONDS);
      if (Number.isFinite(cycle.loopSeconds)) withLoop++; else missingLoop++;

      await LoopAudit.upsert({
        originId,
        screenId: screen ? screen.id : null,
        screenName: resolvedName,
        location: resolvedLocation,
        city: locInfo.city || (screen && screen.address) || null,
        loopSeconds: Number.isFinite(cycle.loopSeconds) ? cycle.loopSeconds : null,
        loopRaw: cycle.tempoCicloRaw || null,
        targetSeconds: LOOP_TARGET_SECONDS,
        remainingSeconds: risk.remainingSeconds,
        availableSlots10: risk.availableSlots10,
        availableSlots15: risk.availableSlots15,
        estimatedUsedSlots10: risk.estimatedUsedSlots10,
        estimatedUsedSlots15: risk.estimatedUsedSlots15,
        riskLevel: risk.riskLevel,
        riskScore: risk.riskScore,
        riskMessage: risk.riskMessage,
        sourceUrl: cycle.sourceUrl,
        lastCheckedAt: new Date()
      });

      updated++;
    }

    loopSyncLastRunAt = new Date();
    console.log(`Loop sync (${reason}): ${updated} atualizados, ${withLoop} com loop, ${missingLoop} sem loop`);
    return {
      success: true,
      reason,
      startedAt,
      finishedAt: new Date(),
      totalIds: ids.length,
      updated,
      withLoop,
      missingLoop,
      targetSeconds: LOOP_TARGET_SECONDS
    };
  } catch (err) {
    console.error('Loop sync error:', err.message);
    return { success: false, error: err.message };
  } finally {
    loopSyncInProgress = false;
  }
}

app.get('/loops/summary', authenticateToken, async (req, res) => {
  try {
    const risk = z.enum(['all', 'critical', 'high', 'medium', 'low', 'unknown']).catch('all').parse(String(req.query.risk || 'all').toLowerCase());
    const limit = getPositiveInt(req.query.limit, 300, { min: 1, max: 1000 });
    const where = { originId: { [Op.notIn]: [...ORIGIN_SCRAPE_EXCLUDED_IDS] } };
    if (risk !== 'all') {
      where.riskLevel = risk;
    }

    const itemsRaw = await LoopAudit.findAll({
      where,
      order: [['riskScore', 'DESC'], ['loopSeconds', 'DESC'], ['updatedAt', 'DESC']],
      limit
    });

    const items = itemsRaw.filter((item) => !isStaticLoopMediaByText(item.screenName, item.location));

    const allRaw = await LoopAudit.findAll({
      where: { originId: { [Op.notIn]: [...ORIGIN_SCRAPE_EXCLUDED_IDS] } },
      attributes: ['riskLevel', 'loopSeconds', 'availableSlots10', 'availableSlots15', 'estimatedUsedSlots10', 'estimatedUsedSlots15', 'screenName', 'location']
    });
    const all = allRaw.filter((item) => !isStaticLoopMediaByText(item.screenName, item.location));
    let persistedLastSyncAt = loopSyncLastRunAt;
    if (!persistedLastSyncAt) {
      const latest = await LoopAudit.findOne({
        attributes: ['lastCheckedAt'],
        order: [['lastCheckedAt', 'DESC']]
      });
      if (latest && latest.lastCheckedAt) persistedLastSyncAt = latest.lastCheckedAt;
    }
    const summary = {
      total: all.length,
      critical: all.filter((i) => i.riskLevel === 'critical').length,
      high: all.filter((i) => i.riskLevel === 'high').length,
      medium: all.filter((i) => i.riskLevel === 'medium').length,
      low: all.filter((i) => i.riskLevel === 'low').length,
      unknown: all.filter((i) => i.riskLevel === 'unknown').length,
      avgLoopSeconds: all.length ? Math.round(all.reduce((acc, i) => acc + (i.loopSeconds || 0), 0) / all.length) : 0,
      totalOccupied: all.reduce((acc, i) => acc + (i.estimatedUsedSlots10 || 0), 0),
      totalOccupied10: all.reduce((acc, i) => acc + (i.estimatedUsedSlots10 || 0), 0),
      totalOccupied15: all.reduce((acc, i) => acc + (i.estimatedUsedSlots15 || 0), 0),
      totalSellable10: all.reduce((acc, i) => acc + (i.availableSlots10 || 0), 0),
      totalSellable15: all.reduce((acc, i) => acc + (i.availableSlots15 || 0), 0)
    };

    res.json({
      targetSeconds: LOOP_TARGET_SECONDS,
      syncInProgress: loopSyncInProgress,
      lastSyncAt: persistedLastSyncAt,
      summary,
      items
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/loops/sync', authenticateToken, requireAdmin, async (req, res) => {
  const result = await syncLoopAuditsFromOrigin('manual');
  if (result.skipped) return res.status(202).json(result);
  if (!result.success) return res.status(500).json(result);
  res.json(result);
});

app.post('/loops/notify-city-summary', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const city = String(req.body?.city || 'all').trim() || 'all';
    const vendorIdRaw = req.body?.vendorId;
    const vendorId = vendorIdRaw && String(vendorIdRaw) !== 'all' ? parseInt(vendorIdRaw, 10) : null;

    const result = await sendLoopCitySummariesToVendors({
      cityFilter: city,
      vendorId: Number.isInteger(vendorId) ? vendorId : null,
      trigger: 'manual'
    });

    if (result.skipped) return res.status(202).json(result);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual sync endpoint
app.post('/sync/origin', authenticateToken, async (req, res) => {
  try {
    await syncWithOrigin();
    res.json({ success: true, message: 'Sync completed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import all monitors from origin system (with locations)
app.post('/sync/import', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Fetch monitors
    let resp = await axios.get(`${ORIGIN_BASE}/index/index3`, {
      headers: { Cookie: originCookies },
      timeout: 20000,
      httpsAgent: originHttpsAgent,
      validateStatus: () => true
    });

    if (!resp.data || resp.data.length < 10000 || resp.data.includes('action="/login/verifica"')) {
      await originLogin();
      resp = await axios.get(`${ORIGIN_BASE}/index/index3`, {
        headers: { Cookie: originCookies },
        timeout: 20000,
        httpsAgent: originHttpsAgent,
        validateStatus: () => true
      });
    }

    const monitors = parseMonitorPage(resp.data);

    // Also fetch location mapping
    const locationMap = await scrapeLocationMapping() || {};

    let created = 0, updated = 0, skipped = 0;
    const locationsList = new Set(); // track unique locations for frontend

    for (const mon of monitors) {
      if (isOriginScrapeExcluded(mon.originId)) continue;
      const locInfo = locationMap[mon.originId];
      const location = locInfo ? locInfo.location : '';
      const address = locInfo ? locInfo.city : '';
      if (location) locationsList.add(JSON.stringify({ name: location, address }));

      let screen = await Screen.findOne({ where: { originId: mon.originId } });
      
      const cleanedName = cleanMonitorName(mon.name, location);

      if (screen) {
        const updates = {};
        updates.status = mon.status;
        updates.name = cleanedName;
        if (mon.stats) updates.stats = mon.stats;
        if (mon.orientation) updates.orientation = mon.orientation;
        if (location) updates.location = location;
        if (address) updates.address = address;
        await screen.update(updates);
        updated++;
      } else {
        await Screen.create({
          name: cleanedName,
          originId: mon.originId,
          displayId: String(mon.originId),
          status: mon.status,
          orientation: mon.orientation || 'vertical',
          stats: mon.stats,
          location: location,
          address: address
        });
        created++;
      }
    }

    // Return locations list for the frontend to save in localStorage
    const locationsArray = [...locationsList].map(j => JSON.parse(j));

    res.json({ success: true, total: monitors.length, created, updated, skipped, locations: locationsArray });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync locations only (update existing screens with location data)
app.post('/sync/locations', authenticateToken, async (req, res) => {
  try {
    const locationMap = await scrapeLocationMapping();
    if (!locationMap) return res.status(500).json({ error: 'Failed to fetch locations' });

    let updated = 0;
    const locationsList = new Set();

    for (const [monIdStr, locInfo] of Object.entries(locationMap)) {
      const monId = parseInt(monIdStr);
      if (isOriginScrapeExcluded(monId)) continue;
      const screen = await Screen.findOne({ where: { originId: monId } });
      if (screen) {
        const updates = {};
        if (locInfo.location && screen.location !== locInfo.location) updates.location = locInfo.location;
        if (locInfo.city && screen.address !== locInfo.city) updates.address = locInfo.city;
        if (Object.keys(updates).length) {
          await screen.update(updates);
          updated++;
        }
      }
      if (locInfo.location) locationsList.add(JSON.stringify({ name: locInfo.location, address: locInfo.city }));
    }

    const locationsArray = [...locationsList].map(j => JSON.parse(j));
    res.json({ success: true, updated, locations: locationsArray });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== CONTRACT SCRAPING FROM ORIGIN SYSTEM =====
async function scrapeContracts() {
  try {
    const monthOffsets = [0, 1, 2, -1];
    const now = new Date();
    const unique = new Map();

    const parseDateToIso = (value) => {
      if (!value) return '';
      const text = String(value).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
      const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (br) return `${br[3]}-${br[2]}-${br[1]}`;
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) return '';
      return parsed.toISOString().slice(0, 10);
    };

    const parseListFromPayload = (payload) => {
      if (!payload || typeof payload !== 'object') return [];
      const rawList = payload?.contratos_vencer?.lista || payload?.contratos_vencer || payload?.lista || payload?.data?.lista || [];
      if (!Array.isArray(rawList)) return [];
      return rawList.map((item) => ({
        advertiser: item.cliente || item.anunciante || '',
        expirationDate: parseDateToIso(item.data_final || item.vencimento || item.expirationDate),
        value: parseFloat(item.valor_parcela || item.valor || item.value) || 0,
        vendorName: item.vendedor || item.vendorName || 'N/A',
        daysRemaining: parseInt(item.dias, 10) || 0
      })).filter((c) => c.advertiser && c.expirationDate);
    };

    for (const offset of monthOffsets) {
      const refDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const mes = refDate.getMonth() + 1;
      const ano = refDate.getFullYear();
      const url = `${ORIGIN_BASE}/premium/ajax-dashboard-data?mes=${mes}&ano=${ano}`;

      let resp;
      try {
        resp = await axios.get(url, {
          headers: { Cookie: originCookies },
          timeout: 30000,
          httpsAgent: originHttpsAgent,
          validateStatus: () => true
        });
      } catch (err) {
        console.warn(`Contract fetch failed (${mes}/${ano}):`, err.message);
        continue;
      }

      // If not JSON or not successful, re-login and retry once
      if (!resp.data || typeof resp.data !== 'object' || resp.data.success === false) {
        await originLogin();
        resp = await axios.get(url, {
          headers: { Cookie: originCookies },
          timeout: 30000,
          httpsAgent: originHttpsAgent,
          validateStatus: () => true
        });
      }

      const parsed = parseListFromPayload(resp.data);
      for (const contract of parsed) {
        unique.set(`${contract.advertiser}|${contract.expirationDate}`, contract);
      }
    }

    const contracts = Array.from(unique.values());
    if (!contracts.length) {
      console.warn('No contract data returned from origin after month fallback scan');
    }

    console.log(`Contracts scraped: ${contracts.length} found`);
    return contracts;
  } catch (err) {
    console.error('Contract scraping error:', err.message);
    return [];
  }
}

// Sync contracts endpoint
app.post('/contracts/sync', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const synced = await syncContractsFromOrigin();
    const contracts = await Contract.findAll();
    if (!synced) {
      return res.json({
        success: true,
        synced: 0,
        total: contracts.length,
        warning: 'Nenhum contrato retornado pelo sistema de origem agora. Mantivemos os contratos já salvos localmente.'
      });
    }
    res.json({ success: true, synced, total: contracts.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== AUTO-SYNC & NOTIFY CONTRACTS =====
async function syncContractsFromOrigin() {
  try {
    const scraped = await scrapeContracts();
    if (!scraped.length) { console.log('Contract auto-sync: no contracts found'); return 0; }

    let created = 0, updated = 0;
    const vendors = await Vendor.findAll();

    for (const c of scraped) {
      const matchedVendor = vendors.find(v => 
        v.name.toLowerCase().includes(c.vendorName.toLowerCase()) ||
        c.vendorName.toLowerCase().includes(v.name.toLowerCase())
      );

      let contract = await Contract.findOne({ 
        where: { advertiser: c.advertiser, expirationDate: c.expirationDate }
      });

      if (contract) {
        await contract.update({
          value: c.value, vendorName: c.vendorName,
          vendorId: matchedVendor ? matchedVendor.id : contract.vendorId,
          daysRemaining: c.daysRemaining
        });
        updated++;
      } else {
        await Contract.create({
          advertiser: c.advertiser, expirationDate: c.expirationDate,
          value: c.value, vendorName: c.vendorName,
          vendorId: matchedVendor ? matchedVendor.id : null,
          daysRemaining: c.daysRemaining
        });
        created++;
      }
    }
    console.log(`Contract auto-sync: ${scraped.length} total, ${created} created, ${updated} updated`);
    return scraped.length;
  } catch (err) {
    console.error('Contract auto-sync error:', err.message);
    return 0;
  }
}

async function checkExpiringContracts() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const contracts = await Contract.findAll();
    const vendors = await Vendor.findAll({ where: { active: true } });
    
    let notified = 0;
    for (const contract of contracts) {
      const expDate = new Date(contract.expirationDate + 'T00:00:00');
      const diffMs = expDate - today;
      const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      const updatePayload = {};
      if (contract.daysRemaining !== daysRemaining) updatePayload.daysRemaining = daysRemaining;

      // Reset milestone flags if contract moved away from window (e.g. renewed/extended in origin).
      if (daysRemaining > 15 && (contract.notified15dAt || contract.notified5dAt || contract.notified)) {
        updatePayload.notified = false;
        updatePayload.lastNotifiedAt = null;
        updatePayload.notified15dAt = null;
        updatePayload.notified5dAt = null;
      }

      if (Object.keys(updatePayload).length) {
        await contract.update(updatePayload);
      }

      if (daysRemaining <= 0 || daysRemaining > 15) continue;

      const vendor = contract.vendorId ? vendors.find(v => v.id === contract.vendorId) : null;
      if (!vendor) continue;

      const shouldNotify15d = daysRemaining <= CONTRACT_NOTIFY_THRESHOLDS_DAYS[0] && !contract.notified15dAt;
      const shouldNotify5d = daysRemaining <= CONTRACT_NOTIFY_THRESHOLDS_DAYS[1] && !contract.notified5dAt;
      if (!shouldNotify15d && !shouldNotify5d) continue;

      const urgency = daysRemaining <= 5 ? '🔴 URGENTE' : '🟡 AVISO';
      const milestone = shouldNotify5d ? '5 dias' : '15 dias';
      const msg = `📋 *CONTRATO A VENCER* ${urgency}\n\nAnunciante: ${contract.advertiser}\nVencimento: ${new Date(contract.expirationDate).toLocaleDateString('pt-BR')}\nValor: R$ ${(contract.value || 0).toLocaleString('pt-BR')}\nDias restantes: ${daysRemaining}\nMarco: ${milestone}\n\n⚠️ Entre em contato para renovação.`;
      await sendNotification(msg, vendor.phone);

      await contract.update({
        notified: true,
        lastNotifiedAt: new Date(),
        notified15dAt: shouldNotify15d ? new Date() : contract.notified15dAt,
        notified5dAt: shouldNotify5d ? new Date() : contract.notified5dAt
      });
      notified++;
      console.log(`Contract notification sent: ${contract.advertiser} -> ${vendor.name} (${daysRemaining} days, marco ${milestone})`);
    }
    if (notified > 0) console.log(`Contract check: ${notified} notifications sent`);
  } catch (err) {
    console.error('Contract check error:', err.message);
  }
}

// Auto-sync contracts and check notifications every 6 hours
async function autoSyncAndNotify() {
  await syncContractsFromOrigin();
  await checkExpiringContracts();
}
setInterval(autoSyncAndNotify, 6 * 60 * 60 * 1000);
setTimeout(autoSyncAndNotify, 15000);

app.use((err, req, res, next) => {
  if (err && err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'CSRF token inválido ou ausente' });
  }
  return next(err);
});

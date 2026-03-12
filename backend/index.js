const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
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
const { authenticateToken, requireAdmin, JWT_SECRET } = require('./middleware/auth');
const backup = require('./config/backup');

// Model associations
Ticket.belongsTo(Screen, { foreignKey: 'screenId' });
Screen.hasMany(Ticket, { foreignKey: 'screenId' });
Schedule.belongsTo(Screen, { foreignKey: 'screenId' });
Schedule.belongsTo(Ticket, { foreignKey: 'ticketId' });
Contract.belongsTo(Vendor, { foreignKey: 'vendorId' });
Vendor.hasMany(Contract, { foreignKey: 'vendorId' });

const app = express();
app.use(cors());
app.use(bodyParser.json());

const OFFLINE_TODO_THRESHOLD_MS = 12 * 60 * 60 * 1000;

// Initialize database
sequelize.sync().then(async () => {
  await ensureScreenColumns();
  console.log('Database synced');
  bootstrapAdmin();

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

async function bootstrapAdmin() {
  try {
    const adminCount = await User.count({ where: { role: 'admin' } });
    if (adminCount > 0) return;

    const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const passwordHash = await bcrypt.hash(password, 10);

    await User.create({ username, passwordHash, role: 'admin' });
    console.log(`Default admin created: ${username}`);
  } catch (err) {
    console.error('Failed to bootstrap default admin:', err.message);
  }
}

function createToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Preencha usuário e senha' });
    }

    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: 'Usuário ou senha incorreto' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Usuário ou senha incorreto' });
    }

    const token = createToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'username', 'role']
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/auth/register', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const normalizedRole = role === 'admin' ? 'admin' : 'user';
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await User.create({ username, passwordHash, role: normalizedRole });

    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      role: newUser.role
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must have at least 6 characters' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      return res.status(401).json({ error: 'Current password is invalid' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await user.update({ passwordHash });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    res.json({ message: 'Backup criado com sucesso', path: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/backups/restore', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Backup name is required' });
    }
    backup.restoreBackup(name);
    // Re-sync Sequelize after restore
    await sequelize.sync();
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
              sendNotification(`⚠️ *ALERTA* — ${screen.name} offline há ${Math.floor(offlineHours)}h\nLocal: ${screen.location || 'N/A'}\nDesde: ${new Date(screen.lastHeartbeat).toLocaleString('pt-BR')}`);
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
            sendNotification(`🔄 *OSCILAÇÃO* — ${screen.name}\n${recentEvents.length} mudanças de status nas últimas 6h\nLocal: ${screen.location || 'N/A'}\nVerificar conexão/energia.`);
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
    res.json(tickets);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/tickets/:id', authenticateToken, async (req, res) => {
  try {
    const ticket = await Ticket.findByPk(req.params.id, { include: [{ model: Screen }] });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json(ticket);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/tickets', authenticateToken, async (req, res) => {
  try {
    const { screenId, title, description, category, priority, assignedTo, location, city, checklist } = req.body;
    if (!title) return res.status(400).json({ error: 'Título é obrigatório' });
    const ticket = await Ticket.create({
      screenId: screenId || null, title, description, category: category || 'general',
      priority: priority || 'medium', assignedTo, location, city, checklist,
      createdBy: req.user.username, status: 'open'
    });
    await logAudit(req, 'create', 'ticket', ticket.id, { title });
    // Send notification on ticket create
    const nConfig = await NotificationConfig.findOne();
    if (nConfig && nConfig.notifyOnTicketCreate && nConfig.whatsappEnabled) {
      const msg = `\ud83c\udfa9 *NOVO TICKET #${ticket.id}*\n${title}\nCategoria: ${category || 'geral'}\nPrioridade: ${priority || 'media'}${assignedTo ? '\nAtribu\u00eddo: ' + assignedTo : ''}`;
      sendNotification(msg);
    }
    res.status(201).json(ticket);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.patch('/tickets/:id', authenticateToken, async (req, res) => {
  try {
    const ticket = await Ticket.findByPk(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const { status, priority, assignedTo, description, timeSpentMinutes, checklist, title, category } = req.body;
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
    if (checklist !== undefined) updates.checklist = checklist;
    if (title) updates.title = title;
    if (category) updates.category = category;
    await ticket.update(updates);
    await logAudit(req, 'update', 'ticket', ticket.id, updates);
    res.json(ticket);
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
    const stats = {
      total: all.length,
      open: all.filter(t => t.status === 'open').length,
      in_progress: all.filter(t => t.status === 'in_progress').length,
      waiting_part: all.filter(t => t.status === 'waiting_part').length,
      resolved: all.filter(t => t.status === 'resolved').length,
      closed: all.filter(t => t.status === 'closed').length,
      avgTimeMinutes: all.filter(t => t.timeSpentMinutes > 0).reduce((a, t) => a + t.timeSpentMinutes, 0) / (all.filter(t => t.timeSpentMinutes > 0).length || 1),
      byCategory: {},
      byAssignee: {}
    };
    all.forEach(t => {
      stats.byCategory[t.category] = (stats.byCategory[t.category] || 0) + 1;
      if (t.assignedTo) stats.byAssignee[t.assignedTo] = (stats.byAssignee[t.assignedTo] || 0) + 1;
    });
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== SCHEDULES/CALENDAR CRUD =====
app.get('/schedules', authenticateToken, async (req, res) => {
  try {
    const where = {};
    if (req.query.month && req.query.year) {
      const start = new Date(req.query.year, req.query.month - 1, 1);
      const end = new Date(req.query.year, req.query.month, 0);
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
    const schedule = await Schedule.create({
      screenId, ticketId, title, description, scheduledDate, scheduledTime,
      assignedTo, location, city, recurrence: recurrence || 'none', color: color || '#E95D34',
      createdBy: req.user.username
    });
    await logAudit(req, 'create', 'schedule', schedule.id, { title, scheduledDate });
    // Send notification to technician
    const nConfig = await NotificationConfig.findOne();
    if (nConfig && nConfig.notifyOnScheduleCreate && nConfig.whatsappEnabled) {
      const msg = `\ud83d\udcc5 *NOVO AGENDAMENTO*\n${title}\nData: ${new Date(scheduledDate + 'T12:00:00').toLocaleDateString('pt-BR')}${scheduledTime ? ' \u00e0s ' + scheduledTime : ''}${assignedTo ? '\nRespons\u00e1vel: ' + assignedTo : ''}${location ? '\nLocal: ' + location : ''}`;
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
app.get('/notification-config', authenticateToken, async (req, res) => {
  try {
    let config = await NotificationConfig.findOne();
    if (!config) config = await NotificationConfig.create({});
    res.json(config);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/notification-config', authenticateToken, async (req, res) => {
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

app.post('/notification-config/test', authenticateToken, async (req, res) => {
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
    const days = parseInt(req.query.days) || 30;
    const sla = await calculateSLA(req.params.id, days);
    res.json(sla);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/sla/overview', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
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
    const limit = parseInt(req.query.limit) || 100;
    const logs = await AuditLog.findAll({ order: [['createdAt', 'DESC']], limit });
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== USERS LIST (for assignment dropdowns) =====
app.get('/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.findAll({ attributes: ['id', 'username', 'role'] });
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    const { name, phone, email } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
    const vendor = await Vendor.create({ name, phone, email });
    res.status(201).json(vendor);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.patch('/vendors/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const vendor = await Vendor.findByPk(req.params.id);
    if (!vendor) return res.status(404).json({ error: 'Vendedor não encontrado' });
    await vendor.update(req.body);
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
app.get('/contracts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const contracts = await Contract.findAll({ include: [{ model: Vendor, required: false }], order: [['expirationDate', 'ASC']] });
    res.json(contracts);
  } catch (err) { res.status(500).json({ error: err.message }); }
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

// Note: No local heartbeat interval — the origin system sync (every 2 min)
// is the single source of truth for all screen statuses.
// Local heartbeat endpoints (/screens/:id/heartbeat, /heartbeat/:displayId)
// are kept for future direct-device integrations but don't override origin status.

// === Periodic sync with original system (sistema.redeintermidia.com)
// Scrapes the monitoring page to get real-time status of all monitors
const https = require('https');
const ORIGIN_BASE = process.env.ORIGIN_BASE || 'https://sistema.redeintermidia.com';
const ORIGIN_USER = process.env.ORIGIN_USER || 'Intermidia';
const ORIGIN_PASS = process.env.ORIGIN_PASS || 'Intermidia2025@';
const SYNC_INTERVAL_MS = 120000; // 2 minutes
const originHttpsAgent = new https.Agent({ rejectUnauthorized: false });

let originCookies = '';

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
  return monitors;
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
    const now = new Date();
    const mes = now.getMonth() + 1;
    const ano = now.getFullYear();
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
      console.warn('Contract fetch failed:', err.message);
      return [];
    }

    // If not JSON or not successful, re-login and retry
    if (!resp.data || typeof resp.data !== 'object' || !resp.data.success) {
      await originLogin();
      resp = await axios.get(url, {
        headers: { Cookie: originCookies },
        timeout: 30000,
        httpsAgent: originHttpsAgent,
        validateStatus: () => true
      });
    }

    if (!resp.data || !resp.data.contratos_vencer || !resp.data.contratos_vencer.lista) {
      console.warn('No contratos_vencer data in response');
      return [];
    }

    const lista = resp.data.contratos_vencer.lista;
    const contracts = lista.map(item => ({
      advertiser: item.cliente || '',
      expirationDate: item.data_final || '',
      value: parseFloat(item.valor_parcela) || 0,
      vendorName: item.vendedor || 'N/A',
      daysRemaining: parseInt(item.dias) || 0
    })).filter(c => c.advertiser && c.expirationDate);

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
    if (!synced) return res.status(400).json({ error: 'Nenhum contrato encontrado no sistema de origem' });
    const contracts = await Contract.findAll();
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
      
      // Update days remaining
      if (contract.daysRemaining !== daysRemaining) {
        await contract.update({ daysRemaining });
      }

      // Only notify if within 15 days and not already notified today
      if (daysRemaining > 0 && daysRemaining <= 15) {
        const alreadyNotifiedToday = contract.lastNotifiedAt && 
          new Date(contract.lastNotifiedAt).toDateString() === today.toDateString();
        
        if (!alreadyNotifiedToday) {
          const vendor = contract.vendorId ? vendors.find(v => v.id === contract.vendorId) : null;
          if (vendor) {
            const urgency = daysRemaining <= 5 ? '🔴 URGENTE' : daysRemaining <= 10 ? '🟡 ATENÇÃO' : '🟢 AVISO';
            const msg = `📋 *CONTRATO A VENCER* ${urgency}\n\nAnunciante: ${contract.advertiser}\nVencimento: ${new Date(contract.expirationDate).toLocaleDateString('pt-BR')}\nValor: R$ ${(contract.value || 0).toLocaleString('pt-BR')}\nDias restantes: ${daysRemaining}\n\n⚠️ Entre em contato para renovação.`;
            await sendNotification(msg, vendor.phone);
            await contract.update({ notified: true, lastNotifiedAt: new Date() });
            notified++;
            console.log(`Contract notification sent: ${contract.advertiser} -> ${vendor.name} (${daysRemaining} days)`);
          }
        }
      }
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

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Screen = sequelize.define('Screen', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Display name'
  },
  address: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Physical address or location'
  },
  contact: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Responsible contact phone number'
  },
  displayId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    comment: 'Unique ID of the display device'
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Legacy field - now using name, address, displayId'
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'offline',
    validate: {
      isIn: [['online', 'offline', 'static', 'not_installed']]
    },
    comment: 'Connection status of the display'
  },
  displayUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'URL of the display player (e.g., sistema.redeintermidia.com/local_123)'
  },
  workflowStatus: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'none',
    validate: {
      isIn: [['none', 'todo', 'ontheway', 'complete']]
    },
    comment: 'Maintenance workflow status (none, todo, ontheway, complete)'
  },
  lastHeartbeat: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp of last ping from display'
  },
  priority: {
    type: DataTypes.STRING,
    defaultValue: 'medium',
    validate: {
      isIn: [['critical', 'high', 'medium', 'low']]
    },
    comment: 'Maintenance priority level (critical, high, medium, low)'
  },
  originId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true,
    comment: 'ID from the original system (sistema.redeintermidia.com)'
  },
  stats: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON string with player stats (cpuTemp, cpuUsage, disk, uptime, appVersion)'
  },
  orientation: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Screen orientation (horizontal/vertical)'
  },
  operatingHoursStart: {
    type: DataTypes.STRING(5),
    allowNull: true,
    comment: 'Opening time HH:MM (e.g. 06:00)'
  },
  operatingHoursEnd: {
    type: DataTypes.STRING(5),
    allowNull: true,
    comment: 'Closing time HH:MM (e.g. 22:00)'
  },
  operatingDays: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Operating days: all, mon-fri, mon-sat, tue-sun, tue-sat, etc.'
  },
  flowPeople: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Monthly people flow'
  },
  flowVehicles: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Monthly vehicle flow'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: true,
  tableName: 'screens'
});

module.exports = Screen;

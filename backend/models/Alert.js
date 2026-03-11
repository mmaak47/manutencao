const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Alert = sequelize.define('Alert', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  screenId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'screens',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['offline', 'maintenance_overdue', 'high_priority', 'custom']]
    },
    comment: 'Type of alert'
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Alert title'
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Alert message details'
  },
  severity: {
    type: DataTypes.STRING,
    defaultValue: 'info',
    validate: {
      isIn: [['info', 'warning', 'error', 'critical']]
    },
    comment: 'Alert severity level'
  },
  read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Has the user seen this alert?'
  },
  dismissed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Has the user dismissed this alert?'
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
  tableName: 'alerts'
});

module.exports = Alert;

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LoopAudit = sequelize.define('LoopAudit', {
  originId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  screenId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  screenName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true
  },
  loopSeconds: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  loopRaw: {
    type: DataTypes.STRING,
    allowNull: true
  },
  targetSeconds: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 180
  },
  remainingSeconds: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  availableSlots10: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  availableSlots15: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  estimatedUsedSlots10: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  estimatedUsedSlots15: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  riskLevel: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'unknown'
  },
  riskScore: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0
  },
  riskMessage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  sourceUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  lastCheckedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'loop_audits'
});

module.exports = LoopAudit;

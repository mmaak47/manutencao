const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: true },
  username: { type: DataTypes.STRING, allowNull: true },
  action: { type: DataTypes.STRING, allowNull: false },
  entity: { type: DataTypes.STRING, allowNull: true },
  entityId: { type: DataTypes.INTEGER, allowNull: true },
  details: { type: DataTypes.TEXT, allowNull: true },
  ip: { type: DataTypes.STRING, allowNull: true }
}, { timestamps: true, updatedAt: false, tableName: 'audit_logs' });

module.exports = AuditLog;

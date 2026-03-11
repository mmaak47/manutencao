const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Ticket = sequelize.define('Ticket', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  screenId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'screens', key: 'id' } },
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  category: {
    type: DataTypes.STRING, defaultValue: 'general',
    validate: { isIn: [['network', 'hardware', 'software', 'power', 'display', 'player', 'general']] }
  },
  status: {
    type: DataTypes.STRING, defaultValue: 'open',
    validate: { isIn: [['open', 'in_progress', 'waiting_part', 'resolved', 'closed']] }
  },
  priority: {
    type: DataTypes.STRING, defaultValue: 'medium',
    validate: { isIn: [['critical', 'high', 'medium', 'low']] }
  },
  assignedTo: { type: DataTypes.STRING, allowNull: true },
  createdBy: { type: DataTypes.STRING, allowNull: false },
  resolvedAt: { type: DataTypes.DATE, allowNull: true },
  closedAt: { type: DataTypes.DATE, allowNull: true },
  timeSpentMinutes: { type: DataTypes.INTEGER, defaultValue: 0 },
  checklist: { type: DataTypes.TEXT, allowNull: true },
  location: { type: DataTypes.STRING, allowNull: true },
  city: { type: DataTypes.STRING, allowNull: true }
}, { timestamps: true, tableName: 'tickets' });

module.exports = Ticket;

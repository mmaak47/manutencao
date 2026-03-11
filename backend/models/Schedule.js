const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Schedule = sequelize.define('Schedule', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  screenId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'screens', key: 'id' } },
  ticketId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'tickets', key: 'id' } },
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  scheduledDate: { type: DataTypes.DATEONLY, allowNull: false },
  scheduledTime: { type: DataTypes.STRING, allowNull: true },
  assignedTo: { type: DataTypes.STRING, allowNull: true },
  status: {
    type: DataTypes.STRING, defaultValue: 'scheduled',
    validate: { isIn: [['scheduled', 'in_progress', 'completed', 'cancelled']] }
  },
  location: { type: DataTypes.STRING, allowNull: true },
  city: { type: DataTypes.STRING, allowNull: true },
  recurrence: {
    type: DataTypes.STRING, allowNull: true,
    validate: { isIn: [['none', 'daily', 'weekly', 'monthly', null]] }
  },
  color: { type: DataTypes.STRING, defaultValue: '#E95D34' },
  createdBy: { type: DataTypes.STRING, allowNull: true }
}, { timestamps: true, tableName: 'schedules' });

module.exports = Schedule;

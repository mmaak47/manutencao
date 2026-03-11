const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ChecklistTemplate = sequelize.define('ChecklistTemplate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  category: { type: DataTypes.STRING, allowNull: true },
  items: { type: DataTypes.TEXT, allowNull: false }
}, { timestamps: true, tableName: 'checklist_templates' });

module.exports = ChecklistTemplate;

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Part = sequelize.define('Part', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  category: {
    type: DataTypes.STRING, defaultValue: 'other',
    validate: { isIn: [['player', 'cable', 'display', 'power_supply', 'router', 'mount', 'other']] }
  },
  quantity: { type: DataTypes.INTEGER, defaultValue: 0 },
  minQuantity: { type: DataTypes.INTEGER, defaultValue: 1 },
  location: { type: DataTypes.STRING, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  unitCost: { type: DataTypes.FLOAT, allowNull: true }
}, { timestamps: true, tableName: 'parts' });

module.exports = Part;

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Screen = require('./Screen');

const ScreenEvent = sequelize.define('ScreenEvent', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  screenId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Screen,
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('online', 'offline'),
    allowNull: false
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: false,
  tableName: 'screen_events'
});

ScreenEvent.belongsTo(Screen, { foreignKey: 'screenId', as: 'screen' });
Screen.hasMany(ScreenEvent, { foreignKey: 'screenId', as: 'events' });

module.exports = ScreenEvent;

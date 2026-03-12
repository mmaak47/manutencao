const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TelemetrySnapshot = sequelize.define('TelemetrySnapshot', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  screenId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  cpuTemp: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  cpuUsage: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  diskUsedGB: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  diskAvailGB: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  diskPct: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  uptimeRaw: {
    type: DataTypes.STRING,
    allowNull: true
  },
  appVersion: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  tableName: 'TelemetrySnapshots',
  indexes: [
    { fields: ['screenId', 'createdAt'] }
  ]
});

module.exports = TelemetrySnapshot;

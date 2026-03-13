const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Contract = sequelize.define('contract', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  advertiser: { type: DataTypes.STRING, allowNull: false },
  expirationDate: { type: DataTypes.DATEONLY, allowNull: false },
  value: { type: DataTypes.FLOAT, defaultValue: 0 },
  vendorName: { type: DataTypes.STRING },
  vendorId: { type: DataTypes.INTEGER },
  daysRemaining: { type: DataTypes.INTEGER },
  notified: { type: DataTypes.BOOLEAN, defaultValue: false },
  lastNotifiedAt: { type: DataTypes.DATE },
  notified15dAt: { type: DataTypes.DATE, allowNull: true },
  notified5dAt: { type: DataTypes.DATE, allowNull: true },
  salesFollowUpStatus: {
    type: DataTypes.ENUM('pending', 'contacted', 'renewed', 'not_renewed'),
    allowNull: false,
    defaultValue: 'pending'
  },
  salesContactedAt: { type: DataTypes.DATE, allowNull: true },
  salesOutcomeAt: { type: DataTypes.DATE, allowNull: true },
  salesUpdatedBy: { type: DataTypes.STRING, allowNull: true }
}, { timestamps: true, underscored: true });

module.exports = Contract;

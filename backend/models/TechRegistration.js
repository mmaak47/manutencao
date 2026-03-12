const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TechRegistration = sequelize.define('TechRegistration', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  firstName: { type: DataTypes.STRING, allowNull: false },
  lastName: { type: DataTypes.STRING, allowNull: false },
  cpf: { type: DataTypes.STRING(14), allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  photoData: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.STRING, defaultValue: 'pending' },
  rejectionReason: { type: DataTypes.TEXT, allowNull: true },
  reviewedAt: { type: DataTypes.DATE, allowNull: true },
  reviewedBy: { type: DataTypes.STRING, allowNull: true },
}, { timestamps: true, tableName: 'tech_registrations' });

module.exports = TechRegistration;

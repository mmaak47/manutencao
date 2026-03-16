const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const NotificationConfig = sequelize.define('NotificationConfig', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  // WhatsApp settings
  whatsappEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  whatsappApiUrl: { type: DataTypes.STRING, allowNull: true },
  whatsappApiKey: { type: DataTypes.STRING, allowNull: true },
  whatsappDefaultPhone: { type: DataTypes.STRING, allowNull: true },
  // What triggers notifications
  notifyOnScheduleCreate: { type: DataTypes.BOOLEAN, defaultValue: true },
  notifyOnAlertCritical: { type: DataTypes.BOOLEAN, defaultValue: true },
  notifyOnAlertWarning: { type: DataTypes.BOOLEAN, defaultValue: false },
  notifyOnTicketCreate: { type: DataTypes.BOOLEAN, defaultValue: true },
  notifyOnTicketAssign: { type: DataTypes.BOOLEAN, defaultValue: true },
  notifyOnOffline4h: { type: DataTypes.BOOLEAN, defaultValue: true },
  notifyOnOscillation: { type: DataTypes.BOOLEAN, defaultValue: true },
  // Technician contacts (JSON: [{ name, phone }])
  technicianContacts: { type: DataTypes.TEXT, allowNull: true, defaultValue: '[]' },
  // Legacy checkin rules (kept for backward compatibility)
  checkinLocationTypes: { type: DataTypes.TEXT, allowNull: true },
  // Snapshot list for checkin page (JSON: [{ locationKey, locationName, locationType, city, clients[] }])
  checkinLocations: { type: DataTypes.TEXT, allowNull: true },
  // ISO timestamp of the latest snapshot update
  checkinLocationsUpdatedAt: { type: DataTypes.DATE, allowNull: true }
}, { timestamps: true, tableName: 'notification_configs' });

module.exports = NotificationConfig;

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Contact = sequelize.define('Contact', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  targetType: {
    type: DataTypes.ENUM('local', 'screen'),
    allowNull: false
  },
  targetValue: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  timestamps: true,
  tableName: 'contacts',
  indexes: [
    {
      unique: true,
      fields: ['targetType', 'targetValue']
    }
  ]
});

module.exports = Contact;

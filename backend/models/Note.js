const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Screen = require('./Screen');

const Note = sequelize.define('Note', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  screenId: {
    type: DataTypes.INTEGER,
    references: { model: Screen, key: 'id' },
    allowNull: false
  },
  author: {
    type: DataTypes.STRING,
    defaultValue: 'Unknown'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: false,
  tableName: 'notes'
});

Note.belongsTo(Screen, { foreignKey: 'screenId' });
Screen.hasMany(Note, { foreignKey: 'screenId' });

module.exports = Note;

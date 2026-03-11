const { Sequelize } = require('sequelize');
const path = require('path');

// Configure for SQLite (easier to set up without external dependencies)
// If you want PostgreSQL later, change this to:
// const sequelize = new Sequelize('database_name', 'user', 'password', {
//   host: 'localhost',
//   dialect: 'postgres'
// });

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '..', 'database.sqlite'),
  logging: false
});

module.exports = sequelize;

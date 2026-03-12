const sequelize = require('../config/database');
(async () => {
  const [rows] = await sequelize.query("SELECT id, name, address, originId, status, priority FROM screens ORDER BY name");
  rows.forEach(r => console.log(JSON.stringify(r)));
  await sequelize.close();
})();

const sequelize = require('../config/database');

(async () => {
  try {
    const [tables] = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('Tables:', tables.map(t => t.name));
    for (const t of tables) {
      const [rows] = await sequelize.query("SELECT COUNT(*) as c FROM [" + t.name + "]");
      console.log(t.name + ': ' + rows[0].c + ' rows');
    }
  } catch (e) {
    console.error(e.message);
  } finally {
    await sequelize.close();
  }
})();

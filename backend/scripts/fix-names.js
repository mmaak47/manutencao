const Sequelize = require('sequelize');
const s = new Sequelize({ dialect: 'sqlite', storage: './database.sqlite', logging: false });

(async () => {
  const [rows] = await s.query('SELECT id, name, location FROM Screens WHERE location IS NOT NULL AND location != ""');
  let fixed = 0;
  for (const r of rows) {
    if (r.name && r.location && r.name.startsWith(r.location)) {
      const cleaned = r.name.substring(r.location.length).trim();
      if (cleaned) {
        await s.query('UPDATE Screens SET name = ? WHERE id = ?', { replacements: [cleaned, r.id] });
        fixed++;
      }
    }
  }
  console.log('Fixed ' + fixed + ' of ' + rows.length + ' screens');
  
  // Verify
  const [check] = await s.query('SELECT name, location FROM Screens ORDER BY name LIMIT 15');
  check.forEach(r => console.log(JSON.stringify({ name: r.name, loc: r.location })));
  await s.close();
})().catch(e => console.error(e));

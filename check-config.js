const { Sequelize, QueryTypes } = require('/home/intermidia/app/backend/node_modules/sequelize');
const db = new Sequelize({ dialect: 'sqlite', storage: '/home/intermidia/app/backend/database.sqlite', logging: false });

db.query('SELECT whatsappApiUrl, whatsappApiKey, whatsappDefaultPhone, whatsappEnabled FROM NotificationConfigs LIMIT 1', { type: QueryTypes.SELECT })
  .then(r => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch(e => {
    console.log('Error:', e.message);
    process.exit(1);
  });

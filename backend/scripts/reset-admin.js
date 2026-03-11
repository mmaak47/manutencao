const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const User = require('../models/User');

async function resetAdmin() {
  try {
    await sequelize.sync();

    const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const passwordHash = await bcrypt.hash(password, 10);

    const existing = await User.findOne({ where: { username } });

    if (existing) {
      await existing.update({ passwordHash, role: 'admin' });
      console.log(`Admin updated: ${username}`);
    } else {
      await User.create({ username, passwordHash, role: 'admin' });
      console.log(`Admin created: ${username}`);
    }
  } catch (err) {
    console.error('Failed to reset admin:', err.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

resetAdmin();

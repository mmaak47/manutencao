const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const User = require('../models/User');

async function resetAdmin() {
  try {
    await sequelize.sync();

    const username = process.env.DEFAULT_ADMIN_USERNAME;
    const password = process.env.DEFAULT_ADMIN_PASSWORD;
    if (!username || !password) {
      throw new Error('Set DEFAULT_ADMIN_USERNAME and DEFAULT_ADMIN_PASSWORD before running reset-admin');
    }
    if (password.length < 12) {
      throw new Error('DEFAULT_ADMIN_PASSWORD must be at least 12 characters');
    }
    const passwordHash = await bcrypt.hash(password, 12);

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

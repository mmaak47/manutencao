const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const MAX_BACKUPS = 20;
const BACKUP_FILE_PATTERN = /^database_[0-9T\-:.]+(?:_[a-z0-9_-]+)?\.sqlite$/i;

function validateBackupName(name) {
  const base = path.basename(String(name || ''));
  if (!base || base !== name || !BACKUP_FILE_PATTERN.test(base)) {
    throw new Error('Invalid backup name');
  }
  return base;
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function createBackup(label) {
  ensureBackupDir();

  if (!fs.existsSync(DB_PATH)) {
    console.warn('[Backup] database.sqlite not found, skipping backup');
    return null;
  }

  const stats = fs.statSync(DB_PATH);
  if (stats.size < 1024) {
    console.warn('[Backup] database.sqlite too small (' + stats.size + ' bytes), skipping — possibly empty/corrupt');
    return null;
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const suffix = label ? '_' + label : '';
  const backupName = 'database_' + timestamp + suffix + '.sqlite';
  const backupPath = path.join(BACKUP_DIR, backupName);

  fs.copyFileSync(DB_PATH, backupPath);
  console.log('[Backup] Created: ' + backupName);

  cleanOldBackups();
  return backupPath;
}

function cleanOldBackups() {
  ensureBackupDir();

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('database_') && f.endsWith('.sqlite'))
    .map(f => ({
      name: f,
      path: path.join(BACKUP_DIR, f),
      time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs
    }))
    .sort((a, b) => b.time - a.time);

  if (files.length > MAX_BACKUPS) {
    const toDelete = files.slice(MAX_BACKUPS);
    toDelete.forEach(f => {
      fs.unlinkSync(f.path);
      console.log('[Backup] Removed old backup: ' + f.name);
    });
  }
}

function listBackups() {
  ensureBackupDir();

  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('database_') && f.endsWith('.sqlite'))
    .map(f => {
      const fullPath = path.join(BACKUP_DIR, f);
      const stats = fs.statSync(fullPath);
      return {
        name: f,
        size: stats.size,
        created: stats.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.created) - new Date(a.created));
}

function restoreBackup(backupName) {
  const safeName = validateBackupName(backupName);
  const backupPath = path.join(BACKUP_DIR, safeName);

  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup not found: ' + safeName);
  }

  // Safety: create a backup of current state before restoring
  createBackup('pre-restore');

  fs.copyFileSync(backupPath, DB_PATH);
  console.log('[Backup] Restored from: ' + safeName);
  return true;
}

module.exports = {
  createBackup,
  listBackups,
  restoreBackup,
  BACKUP_DIR
};

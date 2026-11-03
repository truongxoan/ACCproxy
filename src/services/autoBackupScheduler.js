const db = require('../config/db');
const { sendBackupToTelegram } = require('./backupService');

/**
 * Lấy cấu hình tự động sao lưu định kỳ
 */
function getAutoBackupConfig() {
  const enabledRow = db.prepare("SELECT value FROM system_settings WHERE key = 'auto_backup_enabled'").get();
  const freqRow = db.prepare("SELECT value FROM system_settings WHERE key = 'auto_backup_frequency'").get();
  const lastRow = db.prepare("SELECT value FROM system_settings WHERE key = 'auto_backup_last_run'").get();

  return {
    enabled: enabledRow ? enabledRow.value === '1' : false,
    frequencyHours: freqRow ? parseInt(freqRow.value, 10) : 12,
    lastRun: lastRow ? parseInt(lastRow.value, 10) : 0
  };
}

/**
 * Cập nhật cấu hình tự động sao lưu
 * @param {boolean} enabled
 * @param {number} frequencyHours
 */
function updateAutoBackupConfig(enabled, frequencyHours = 12) {
  const stmt = db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run('auto_backup_enabled', enabled ? '1' : '0');
  stmt.run('auto_backup_frequency', String(frequencyHours));
}

let schedulerInterval = null;

/**
 * Kiểm tra và kích hoạt backup nếu tới hạn
 */
async function checkAndTriggerAutoBackup() {
  const config = getAutoBackupConfig();
  if (!config.enabled) return;

  const now = Date.now();
  const intervalMs = config.frequencyHours * 60 * 60 * 1000;

  if (now - config.lastRun >= intervalMs) {
    console.log(`⏰ [AUTO-BACKUP CRON] Kích hoạt tự động sao lưu database chu kỳ ${config.frequencyHours}h...`);
    try {
      const result = await sendBackupToTelegram({ username: 'System Cron', role: 'system' });
      if (result.success) {
        const stmt = db.prepare(`
          INSERT INTO system_settings (key, value, updated_at)
          VALUES ('auto_backup_last_run', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `);
        stmt.run(String(now));
        console.log('✓ [AUTO-BACKUP CRON] Sao lưu và gửi Telegram định kỳ thành công!');
      }
    } catch (e) {
      console.error('❌ [AUTO-BACKUP CRON] Lỗi sao lưu tự động:', e.message);
    }
  }
}

/**
 * Khởi chạy vòng lặp kiểm tra tự động sao lưu (mỗi 5 phút kiểm tra 1 lần)
 */
function startAutoBackupScheduler() {
  if (schedulerInterval) clearInterval(schedulerInterval);
  schedulerInterval = setInterval(() => {
    checkAndTriggerAutoBackup();
  }, 5 * 60 * 1000);
}

module.exports = {
  getAutoBackupConfig,
  updateAutoBackupConfig,
  checkAndTriggerAutoBackup,
  startAutoBackupScheduler
};

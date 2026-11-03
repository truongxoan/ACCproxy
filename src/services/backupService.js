const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/db');
const { DB_PATH } = require('../config/constants');
const { getTelegramConfig, sendTelegramDocument } = require('./telegramService');

const BACKUPS_DIR = path.join(path.dirname(DB_PATH), 'backups');

// Đảm bảo thư mục backups tồn tại
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

/**
 * Tính mã băm SHA256 của file
 * @param {string} filePath
 * @returns {string}
 */
function getFileSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Định dạng dung lượng byte sang KB / MB dễ đọc
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Thu thập số liệu thống kê hiện tại trong database
 * @returns {object}
 */
function getDatabaseStats() {
  const accCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get().count;
  const proxyCount = db.prepare("SELECT COUNT(*) as count FROM accounts WHERE proxy_host IS NOT NULL AND proxy_host != ''").get().count;
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const schedCount = db.prepare('SELECT COUNT(*) as count FROM content_schedules').get().count;
  const assetCount = db.prepare('SELECT COUNT(*) as count FROM vault_assets').get().count;

  return {
    accounts: accCount,
    proxies: proxyCount,
    users: userCount,
    schedules: schedCount,
    assets: assetCount
  };
}

/**
 * Tạo bản snapshot SQLite an toàn bằng db.backup()
 * @returns {Promise<{ filePath: string, filename: string, size: number, sizeFormatted: string, sha256: string, stats: object }>}
 */
async function createDatabaseBackup() {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const filename = `accproxy_backup_${timestamp}.db`;
  const backupPath = path.join(BACKUPS_DIR, filename);

  // better-sqlite3 hỗ trợ db.backup(destination) an toàn tuyệt đối ngay cả khi DB đang có giao dịch WAL
  await db.backup(backupPath);

  const stats = fs.statSync(backupPath);
  const sha256 = getFileSha256(backupPath);
  const dbStats = getDatabaseStats();

  // Dọn dẹp các file backup cũ, chỉ giữ lại 15 bản gần nhất
  cleanupOldBackups(15);

  return {
    filePath: backupPath,
    filename,
    size: stats.size,
    sizeFormatted: formatBytes(stats.size),
    sha256,
    stats: dbStats
  };
}

/**
 * Dọn dẹp bớt các bản backup cũ nếu vượt quá giới hạn
 * @param {number} maxKeep
 */
function cleanupOldBackups(maxKeep = 15) {
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('accproxy_backup_') && f.endsWith('.db'))
      .map(f => {
        const fullPath = path.join(BACKUPS_DIR, f);
        return {
          name: f,
          path: fullPath,
          time: fs.statSync(fullPath).mtimeMs
        };
      })
      .sort((a, b) => b.time - a.time);

    if (files.length > maxKeep) {
      const toRemove = files.slice(maxKeep);
      for (const item of toRemove) {
        fs.unlinkSync(item.path);
      }
    }
  } catch (e) {
    // Không chặn luồng chính nếu lỗi dọn dẹp
  }
}

/**
 * Thực hiện backup SQLite và bắn file tài liệu về Telegram
 * @param {object} user - Người thực hiện { username, role }
 * @param {string} [customToken=null]
 * @param {string} [customChatId=null]
 * @returns {Promise<object>}
 */
async function sendBackupToTelegram(user = { username: 'admin', role: 'admin' }, customToken = null, customChatId = null) {
  const config = getTelegramConfig();
  const token = customToken || config.botToken;
  const chatId = customChatId || config.chatId;

  if (!token || !chatId) {
    return {
      success: false,
      notConfigured: true,
      message: 'Chưa cấu hình Telegram Bot Token hoặc Chat ID trong Cài Đặt!'
    };
  }

  // 1. Tạo bản snapshot SQLite an toàn
  const backupInfo = await createDatabaseBackup();

  // 2. Định dạng chú thích giàu thông tin cho Telegram
  const caption = `
💾 <b>[ACCPROXY SOVEREIGN] BẢN SAO LƯU DỮ LIỆU ĐỊNH KỲ</b> 🛡️
---------------------------------------------
👤 <b>Thực hiện:</b> ${user.username} (${user.role})
⏰ <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN')}
📦 <b>File:</b> <code>${backupInfo.filename}</code> (${backupInfo.sizeFormatted})
🔒 <b>SHA256:</b> <code>${backupInfo.sha256.substring(0, 16)}...</code>
---------------------------------------------
📊 <b>Thống kê kho quân lương:</b>
👥 <b>Tài khoản quản lý:</b> ${backupInfo.stats.accounts} acc
🌐 <b>Proxy cấu hình:</b> ${backupInfo.stats.proxies} proxy
🎬 <b>Lịch đăng video:</b> ${backupInfo.stats.schedules} lịch
📁 <b>Kho tư liệu & ảnh:</b> ${backupInfo.stats.assets} file
---------------------------------------------
⚡ <i>Bản sao lưu trích xuất an toàn (SQLite WAL Mode) từ máy chủ di động Redmi K50G!</i>
`.trim();

  // 3. Đẩy file qua Telegram Bot API
  const sendResult = await sendTelegramDocument(backupInfo.filePath, caption, token, chatId);

  if (sendResult.success) {
    return {
      success: true,
      message: `Đã sao lưu và gửi file ${backupInfo.filename} (${backupInfo.sizeFormatted}) về Telegram thành công!`,
      backupInfo
    };
  } else {
    return {
      success: false,
      message: `Tạo bản sao lưu thành công nhưng lỗi khi gửi Telegram: ${sendResult.error}`,
      backupInfo
    };
  }
}

/**
 * Lấy danh sách các bản backup hiện có trong thư mục
 * @returns {Array<object>}
 */
function listBackups() {
  try {
    return fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('accproxy_backup_') && f.endsWith('.db'))
      .map(f => {
        const fullPath = path.join(BACKUPS_DIR, f);
        const stats = fs.statSync(fullPath);
        return {
          filename: f,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          createdAt: stats.mtime
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (e) {
    return [];
  }
}

module.exports = {
  createDatabaseBackup,
  sendBackupToTelegram,
  listBackups,
  getDatabaseStats,
  BACKUPS_DIR
};

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');

/**
 * Ghi lại vết kiểm toán bảo mật (Audit Log)
 * @param {object} req - Express Request
 * @param {string} action - Tên hành động ('LOGIN', 'REVEAL_PASSWORD', 'LAUNCH_BROWSER', ...)
 * @param {string} targetType - Loại đối tượng ('account', 'user', 'system')
 * @param {string} targetId - ID đối tượng
 * @param {object|string} [details=null] - Chi tiết bổ sung
 */
function logAudit(req, action, targetType = 'account', targetId = null, details = null) {
  try {
    const id = uuidv4();
    const userId = req && req.user ? req.user.id : null;
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1') : 'system';
    const userAgent = req && req.headers ? req.headers['user-agent'] : 'system';
    const detailsStr = details ? (typeof details === 'object' ? JSON.stringify(details) : String(details)) : null;

    const stmt = db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address, user_agent, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(id, userId, action, targetType, targetId, ipAddress, userAgent, detailsStr);
  } catch (error) {
    console.error('⚠️ [AuditLogger] Lỗi khi ghi Audit Log:', error.message);
  }
}

module.exports = {
  logAudit
};

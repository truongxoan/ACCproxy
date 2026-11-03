const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');
const { getTelegramConfig, saveTelegramConfig, sendTelegramMessage, sendVideoPostingAlert } = require('../services/telegramService');
const { createDatabaseBackup, sendBackupToTelegram, listBackups, getDatabaseStats } = require('../services/backupService');
const { sanitizeVideoBuffer } = require('../services/videoSanitizerService');
const { HOOK_CATEGORIES, getAllHooks } = require('../services/hookVaultService');
const { getActiveAccountIds, captureScreenshot } = require('../services/browserService');
const db = require('../config/db');

const router = express.Router();
router.use(authenticateToken);

/**
 * GET /api/tools/telegram
 * Lấy cấu hình Telegram hiện tại
 */
router.get('/telegram', (req, res) => {
  const config = getTelegramConfig();
  return res.json({
    success: true,
    botToken: config.botToken ? `${config.botToken.substring(0, 6)}••••••••` : '',
    hasToken: !!config.botToken,
    chatId: config.chatId
  });
});

/**
 * POST /api/tools/telegram
 * Cập nhật cấu hình Telegram Bot
 */
router.post('/telegram', (req, res) => {
  try {
    const { botToken, chatId } = req.body;
    if (!chatId) {
      return res.status(400).json({ success: false, message: 'Chat ID là bắt buộc!' });
    }

    const current = getTelegramConfig();
    const finalToken = botToken && !botToken.includes('••••') ? botToken : current.botToken;

    saveTelegramConfig(finalToken, chatId);
    logAudit(req, 'UPDATE_TELEGRAM_CONFIG', 'system', null, { chatId });

    return res.json({ success: true, message: 'Đã lưu cấu hình Telegram thành công!' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tools/telegram/test
 * Gửi tin nhắn thử nghiệm tới Telegram
 */
router.post('/telegram/test', async (req, res) => {
  try {
    const { botToken, chatId } = req.body;
    const testMsg = `
⚡ <b>[ACCPROXY SOVEREIGN] KẾT NỐI TELEGRAM THÀNH CÔNG!</b> 🚀
---------------------------------------------
👤 <b>Người kiểm tra:</b> ${req.user.username} (${req.user.role})
⏰ <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN')}
🛡️ <b>Trạng thái:</b> Sẵn sàng bắn chuông báo động nhắc nhở lịch đăng video & sao lưu database!
`.trim();

    const result = await sendTelegramMessage(testMsg, botToken, chatId);
    logAudit(req, 'TEST_TELEGRAM', 'system', null, result);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tools/backup/telegram
 * Kích hoạt sao lưu database SQLite & gửi file về Telegram
 */
router.post('/backup/telegram', async (req, res) => {
  try {
    const { botToken, chatId } = req.body || {};
    const result = await sendBackupToTelegram(req.user, botToken, chatId);

    logAudit(req, 'BACKUP_TELEGRAM', 'system', null, {
      success: result.success,
      filename: result.backupInfo ? result.backupInfo.filename : null,
      size: result.backupInfo ? result.backupInfo.size : null
    });

    if (result.notConfigured) {
      return res.status(200).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: `Lỗi sao lưu hệ thống: ${error.message}` });
  }
});

/**
 * GET /api/tools/backup/download
 * Tải trực tiếp bản sao lưu SQLite snapshot mới nhất về máy tính hoặc điện thoại
 */
router.get('/backup/download', async (req, res) => {
  try {
    const backup = await createDatabaseBackup();
    logAudit(req, 'DOWNLOAD_BACKUP', 'system', null, { filename: backup.filename });

    return res.download(backup.filePath, backup.filename, (err) => {
      if (err && !res.headersSent) {
        return res.status(500).json({ success: false, message: 'Lỗi khi gửi file tải về' });
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/tools/backup/stats
 * Thống kê tình trạng sao lưu và kho quân lương
 */
router.get('/backup/stats', (req, res) => {
  try {
    const stats = getDatabaseStats();
    const history = listBackups();
    return res.json({
      success: true,
      stats,
      historyCount: history.length,
      latestBackup: history[0] || null
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tools/telegram/alert/:scheduleId
 * Gửi thông báo khẩn cấp cho một lịch đăng video cụ thể
 */
router.post('/telegram/alert/:scheduleId', async (req, res) => {
  try {
    const schedule = db.prepare(`
      SELECT s.*, a.account_name, a.username as account_username, u.username as assigned_username
      FROM content_schedules s
      JOIN accounts a ON s.account_id = a.id
      LEFT JOIN users u ON s.assigned_user_id = u.id
      WHERE s.id = ?
    `).get(req.params.scheduleId);

    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Lịch đăng không tồn tại' });
    }

    const result = await sendVideoPostingAlert(schedule);
    logAudit(req, 'SEND_SCHEDULE_ALERT', 'content_schedule', schedule.id, result);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tools/sanitize-video
 * Tẩy rửa metadata & đổi mã hash MD5/SHA256 của video
 * Nhận file dạng Base64 hoặc Binary
 */
router.post('/sanitize-video', (req, res) => {
  try {
    const { base64Data, filename } = req.body;
    if (!base64Data) {
      return res.status(400).json({ success: false, message: 'Thiếu dữ liệu video base64' });
    }

    // Bỏ phần header data:video/mp4;base64, nếu có
    const cleanBase64 = base64Data.replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const result = sanitizeVideoBuffer(buffer, filename || 'video.mp4');

    logAudit(req, 'SANITIZE_VIDEO', 'tool', null, {
      filename: result.filename,
      oldMd5: result.originalHash.md5,
      newMd5: result.newHash.md5
    });

    return res.json({
      success: true,
      filename: result.filename,
      originalHash: result.originalHash,
      newHash: result.newHash,
      sanitizedBase64: `data:video/mp4;base64,${result.sanitizedBuffer.toString('base64')}`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/tools/hooks
 * Lấy danh sách Hook triệu view & Danh mục
 */
router.get('/hooks', (req, res) => {
  const category = req.query.category || 'all';
  return res.json({
    success: true,
    categories: HOOK_CATEGORIES,
    hooks: getAllHooks(category)
  });
});

/**
 * GET /api/tools/piik-streams
 * Lấy danh sách các phiên trình duyệt đang chạy cùng hình ảnh thu nhỏ trực tiếp (Piik Co-Browsing)
 */
router.get('/piik-streams', async (req, res) => {
  try {
    const activeIds = getActiveAccountIds();
    const streams = [];

    for (const accId of activeIds) {
      const acc = db.prepare('SELECT id, platform, account_name, username, proxy_host, proxy_port, last_country, last_country_code FROM accounts WHERE id = ?').get(accId);
      if (acc) {
        const preview = await captureScreenshot(accId);
        streams.push({
          accountId: acc.id,
          platform: acc.platform,
          accountName: acc.account_name || acc.username,
          proxy: acc.proxy_host ? `${acc.proxy_host}:${acc.proxy_port}` : 'Direct',
          country: acc.last_country || '',
          countryCode: acc.last_country_code || '',
          isRunning: true,
          previewUrl: preview.success ? preview.url : '',
          previewTitle: preview.success ? preview.title : '',
          screenshot: preview.success ? preview.screenshot : null
        });
      }
    }

    return res.json({
      success: true,
      count: streams.length,
      streams
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

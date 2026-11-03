const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');
const { getTelegramConfig, saveTelegramConfig, sendTelegramMessage, sendVideoPostingAlert } = require('../services/telegramService');
const { createDatabaseBackup, sendBackupToTelegram, listBackups, getDatabaseStats } = require('../services/backupService');
const { getAutoBackupConfig, updateAutoBackupConfig } = require('../services/autoBackupScheduler');
const { getHardwareMetrics, getThermalConfig, updateThermalConfig, checkThermalSentinel, executeServerRestart, executeServerShutdown } = require('../services/hardwareSentinelService');
const { checkAllProxies, checkProxyLive } = require('../services/proxyHealthService');
const { generateViralContent } = require('../services/aiContentService');
const { scrapeAndSanitizeVideo } = require('../services/videoDownloaderService');
const { sanitizeVideoBuffer } = require('../services/videoSanitizerService');
const { HOOK_CATEGORIES, getAllHooks } = require('../services/hookVaultService');
const { getActiveAccountIds, captureScreenshot } = require('../services/browserService');
const {
  capturePhoneScreen,
  getPhoneStatus,
  sendTap,
  sendSwipe,
  sendKeyEvent,
  sendTextInput,
  launchPhoneApp,
  openPhoneUrl
} = require('../services/phoneControlService');
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
 * GET /api/tools/auto-backup
 * Lấy cấu hình tự động sao lưu định kỳ
 */
router.get('/auto-backup', (req, res) => {
  return res.json({
    success: true,
    ...getAutoBackupConfig()
  });
});

/**
 * POST /api/tools/auto-backup
 * Cập nhật cấu hình tự động sao lưu định kỳ
 */
router.post('/auto-backup', (req, res) => {
  try {
    const { enabled, frequencyHours } = req.body;
    updateAutoBackupConfig(!!enabled, frequencyHours || 12);
    logAudit(req, 'UPDATE_AUTO_BACKUP_CONFIG', 'system', null, { enabled, frequencyHours });
    return res.json({ success: true, message: 'Đã cập nhật lịch tự động sao lưu thành công!' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/tools/hardware/metrics
 * Lấy thông số phần cứng & nhiệt độ thực tế từ điện thoại Redmi K50G
 */
router.get('/hardware/metrics', (req, res) => {
  try {
    const metrics = getHardwareMetrics();
    const config = getThermalConfig();
    return res.json({
      success: true,
      metrics,
      config
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tools/hardware/config
 * Cập nhật ngưỡng nhiệt độ cảnh báo & kích hoạt tự động Failsafe
 */
router.post('/hardware/config', (req, res) => {
  try {
    const { warningTemp, criticalTemp, autoActionEnabled } = req.body;
    updateThermalConfig(warningTemp, criticalTemp, autoActionEnabled);
    logAudit(req, 'UPDATE_THERMAL_CONFIG', 'system', null, { warningTemp, criticalTemp, autoActionEnabled });
    return res.json({ success: true, message: 'Đã lưu cấu hình ngưỡng nhiệt độ thành công!' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tools/hardware/test-failsafe
 * Kích hoạt kiểm tra radar nhiệt độ ngay lập tức
 */
router.post('/hardware/test-failsafe', async (req, res) => {
  try {
    const result = await checkThermalSentinel();
    logAudit(req, 'TEST_THERMAL_FAILSAFE', 'system', null, result);
    return res.json({
      success: true,
      message: 'Đã thực hiện kiểm tra radar nhiệt độ thành công!',
      result
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tools/proxies/check-all
 * Quét toàn bộ Proxy của các kênh, cập nhật latency và tự đổi proxy nếu chết
 */
router.post('/proxies/check-all', async (req, res) => {
  try {
    const ownerFilter = req.user.role === 'admin' ? null : req.user.id;
    const result = await checkAllProxies(true, ownerFilter);
    logAudit(req, 'CHECK_ALL_PROXIES', 'system', null, { total: result.total, alive: result.alive, dead: result.dead });
    return res.json({
      success: true,
      message: `Đã quét xong ${result.total} proxy (${result.alive} sống, ${result.dead} chết)!`,
      ...result
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tools/ai/generate-content
 * AI sinh 3 góc Hook 3s + Kịch bản 60s + 10 Hashtag chuẩn SEO
 */
router.post('/ai/generate-content', (req, res) => {
  try {
    const { topic, platform, tone } = req.body;
    const content = generateViralContent(topic, platform, tone);
    logAudit(req, 'GENERATE_AI_CONTENT', 'tool', null, { topic, platform });
    return res.json(content);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tools/video/download-clean
 * Cào video TikTok/Douyin/Reels sạch watermark & tự động tẩy rửa hash MD5
 */
router.post('/video/download-clean', async (req, res) => {
  try {
    const { videoUrl, customTitle } = req.body;
    if (!videoUrl) {
      return res.status(400).json({ success: false, message: 'Thiếu đường link video!' });
    }

    const result = await scrapeAndSanitizeVideo(videoUrl, customTitle, req.user?.id);
    logAudit(req, 'SCRAPE_CLEAN_VIDEO', 'tool', result.assetId, {
      title: result.title,
      fileSize: result.fileSize
    });

    return res.json(result);
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
    const isAdmin = req.user && req.user.role === 'admin';

    for (const accId of activeIds) {
      const acc = db.prepare('SELECT id, owner_user_id, platform, account_name, username, proxy_host, proxy_port, last_country, last_country_code FROM accounts WHERE id = ?').get(accId);
      if (acc) {
        if (!isAdmin && acc.owner_user_id !== req.user.id) {
          const perm = db.prepare('SELECT can_view FROM user_account_permissions WHERE user_id = ? AND account_id = ?').get(req.user.id, acc.id);
          if (!perm || !perm.can_view) continue;
        }
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

/**
 * GET /api/tools/phone/status
 * Lấy trạng thái kết nối ADB, độ phân giải & danh sách ứng dụng nhanh của điện thoại
 */
router.get('/phone/status', async (req, res) => {
  try {
    const status = await getPhoneStatus();
    return res.json(status);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/tools/phone/screen
 * Chụp màn hình trực tiếp từ điện thoại Redmi K50G (trả về JSON kèm Base64 PNG & kích thước)
 */
router.get('/phone/screen', async (req, res) => {
  try {
    const force = req.query.force === '1';
    const frame = await capturePhoneScreen(force);
    return res.json({
      success: true,
      width: frame.width,
      height: frame.height,
      timestamp: frame.timestamp,
      cached: frame.cached,
      image: `data:image/png;base64,${frame.buffer.toString('base64')}`
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/tools/phone/screen.png
 * Trả về luồng nhị phân PNG trực tiếp của màn hình điện thoại (Zero Base64 Overhead)
 */
router.get('/phone/screen.png', async (req, res) => {
  try {
    const force = req.query.force === '1';
    const frame = await capturePhoneScreen(force);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('X-Screen-Width', String(frame.width));
    res.setHeader('X-Screen-Height', String(frame.height));
    res.setHeader('X-Frame-Timestamp', String(frame.timestamp));
    return res.send(frame.buffer);
  } catch (error) {
    return res.status(503).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tools/phone/tap
 * Chạm vào tọa độ (x, y) trên màn hình điện thoại
 */
router.post('/phone/tap', async (req, res) => {
  try {
    const { x, y } = req.body || {};
    const result = await sendTap(x, y);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tools/phone/swipe
 * Vuốt màn hình từ (x1, y1) sang (x2, y2) trong durationMs
 */
router.post('/phone/swipe', async (req, res) => {
  try {
    const { x1, y1, x2, y2, durationMs } = req.body || {};
    const result = await sendSwipe(x1, y1, x2, y2, durationMs);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tools/phone/key
 * Gửi phím điều hướng / phím cứng (HOME, BACK, APP_SWITCH, POWER, WAKEUP, VOLUME_UP...)
 */
router.post('/phone/key', async (req, res) => {
  try {
    const { key } = req.body || {};
    const result = await sendKeyEvent(key);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tools/phone/text
 * Gửi chuỗi văn bản vào ô đang nhập trên điện thoại
 */
router.post('/phone/text', async (req, res) => {
  try {
    const { text } = req.body || {};
    const result = await sendTextInput(text);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tools/phone/app
 * Mở nhanh ứng dụng trên điện thoại (tiktok, facebook, chrome, youtube, zalo, telegram, termux, settings...)
 */
router.post('/phone/app', async (req, res) => {
  try {
    const { app } = req.body || {};
    const result = await launchPhoneApp(app);
    logAudit(req, 'PHONE_LAUNCH_APP', 'phone', null, result);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tools/phone/url
 * Mở đường link URL trực tiếp trên trình duyệt của điện thoại
 */
router.post('/phone/url', async (req, res) => {
  try {
    const { url } = req.body || {};
    const result = await openPhoneUrl(url);
    logAudit(req, 'PHONE_OPEN_URL', 'phone', null, result);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

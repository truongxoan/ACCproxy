const https = require('https');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

/**
 * Lấy cấu hình Telegram từ bảng system_settings hoặc .env
 * @returns {{ botToken: string, chatId: string }}
 */
function getTelegramConfig() {
  const tokenRow = db.prepare("SELECT value FROM system_settings WHERE key = 'telegram_bot_token'").get();
  const chatRow = db.prepare("SELECT value FROM system_settings WHERE key = 'telegram_chat_id'").get();

  return {
    botToken: tokenRow ? tokenRow.value : (process.env.TELEGRAM_BOT_TOKEN || ''),
    chatId: chatRow ? chatRow.value : (process.env.TELEGRAM_CHAT_ID || '')
  };
}

/**
 * Lưu cấu hình Telegram vào database
 * @param {string} botToken
 * @param {string} chatId
 */
function saveTelegramConfig(botToken, chatId) {
  const stmt = db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run('telegram_bot_token', botToken.trim());
  stmt.run('telegram_chat_id', chatId.trim());
}

/**
 * Gửi tin nhắn qua Telegram Bot API
 * @param {string} text - Nội dung tin nhắn (Hỗ trợ HTML)
 * @param {string} [customToken=null]
 * @param {string} [customChatId=null]
 * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
 */
async function sendTelegramMessage(text, customToken = null, customChatId = null) {
  const config = getTelegramConfig();
  const token = customToken || config.botToken;
  const chatId = customChatId || config.chatId;

  if (!token || !chatId) {
    return {
      success: false,
      notConfigured: true,
      error: 'Chưa cấu hình Telegram Bot Token hoặc Chat ID trong Cài Đặt!'
    };
  }

  const payload = JSON.stringify({
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: false
  });

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    },
    timeout: 10000
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) {
            resolve({ success: true, message: 'Đã gửi thông báo Telegram thành công!' });
          } else {
            resolve({ success: false, error: parsed.description || 'Lỗi Telegram API' });
          }
        } catch (e) {
          resolve({ success: false, error: 'Phản hồi không hợp lệ từ Telegram API' });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: `Lỗi kết nối Telegram: ${err.message}` });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Hết thời gian chờ phản hồi từ Telegram (Timeout)' });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Gửi file tài liệu / backup qua Telegram Bot API (sendDocument)
 * Sử dụng native FormData và fetch built-in
 * @param {string} filePath - Đường dẫn file cần gửi
 * @param {string} [caption=''] - Chú thích đính kèm (HTML)
 * @param {string} [customToken=null]
 * @param {string} [customChatId=null]
 * @returns {Promise<{ success: boolean, message?: string, error?: string, fileId?: string }>}
 */
async function sendTelegramDocument(filePath, caption = '', customToken = null, customChatId = null) {
  const config = getTelegramConfig();
  const token = customToken || config.botToken;
  const chatId = customChatId || config.chatId;

  if (!token || !chatId) {
    return {
      success: false,
      notConfigured: true,
      error: 'Chưa cấu hình Telegram Bot Token hoặc Chat ID trong Cài Đặt!'
    };
  }

  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      error: `File không tồn tại: ${filePath}`
    };
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const formData = new FormData();
    formData.append('chat_id', chatId);
    if (caption) {
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
    }
    formData.append('document', new Blob([fileBuffer]), fileName);

    const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(30000)
    });

    const parsed = await response.json();
    if (parsed.ok) {
      return {
        success: true,
        message: 'Đã gửi file về Telegram thành công!',
        fileId: parsed.result?.document?.file_id
      };
    } else {
      return {
        success: false,
        error: parsed.description || 'Lỗi từ Telegram Bot API khi gửi file'
      };
    }
  } catch (err) {
    return {
      success: false,
      error: `Lỗi kết nối khi gửi file tới Telegram: ${err.message}`
    };
  }
}

/**
 * Bắn chuông báo động nhắc nhở lịch đăng video tới Telegram
 * @param {object} schedule
 * @returns {Promise<object>}
 */
async function sendVideoPostingAlert(schedule) {
  const message = `
🚨 <b>[BÁO ĐỘNG ĐỎ] TỚI GIỜ LÊN VIDEO KÊNH!</b> 🎬

📌 <b>Kênh:</b> [${schedule.platform.toUpperCase()}] ${schedule.account_name || schedule.account_username}
🎯 <b>Tiêu đề video:</b> <i>${schedule.video_title}</i>
⏰ <b>Khung giờ vàng:</b> <code>${schedule.scheduled_time}</code>
👤 <b>Nhân viên phụ trách:</b> ${schedule.assigned_username || 'Toàn đội'}

${schedule.caption ? `📝 <b>Caption:</b>\n<code>${schedule.caption}</code>\n` : ''}
${schedule.hashtags ? `🏷️ <b>Hashtags:</b> <code>${schedule.hashtags}</code>\n` : ''}

👉 <i>Anh em vào bảng điều khiển Web App AccProxy bấm nút [Mở Studio Up] để đẩy video lên ngay, kẻo lỡ giờ vàng!</i>
`.trim();

  return await sendTelegramMessage(message);
}

module.exports = {
  getTelegramConfig,
  saveTelegramConfig,
  sendTelegramMessage,
  sendTelegramDocument,
  sendVideoPostingAlert
};

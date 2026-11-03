const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { UPLOADS_DIR } = require('../config/constants');
const { sanitizeVideoBuffer } = require('./videoSanitizerService');
const db = require('../config/db');

/**
 * Trích xuất video sạch (No Watermark) từ link TikTok hoặc mạng xã hội
 * @param {string} videoUrl - Link video cần tải
 * @param {string} [customTitle='']
 * @param {string} [userId=null]
 * @returns {Promise<object>}
 */
async function scrapeAndSanitizeVideo(videoUrl, customTitle = '', userId = null) {
  if (!videoUrl || !videoUrl.startsWith('http')) {
    throw new Error('Link video không hợp lệ!');
  }

  let downloadUrl = null;
  let videoTitle = customTitle;

  // 1. Phân giải link TikTok bằng TikWM API công khai (miễn phí, không logo)
  if (videoUrl.includes('tiktok.com') || videoUrl.includes('douyin.com')) {
    try {
      const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(videoUrl)}`, {
        signal: AbortSignal.timeout(10000)
      });
      const data = await res.json();
      if (data && data.data) {
        downloadUrl = data.data.play || data.data.wmplay;
        if (!videoTitle && data.data.title) {
          videoTitle = data.data.title.substring(0, 80);
        }
      }
    } catch (e) {
      console.warn('TikWM API lookup failed, falling back:', e.message);
    }
  }

  // Nếu không phân giải được link bên thứ 3, dùng chính videoUrl nếu là direct file link
  if (!downloadUrl && (videoUrl.endsWith('.mp4') || videoUrl.includes('.mp4?'))) {
    downloadUrl = videoUrl;
  }

  if (!downloadUrl) {
    throw new Error('Không thể bóc tách link video sạch từ URL được cung cấp. Vui lòng kiểm tra lại link TikTok/Reels!');
  }

  // 2. Tải binary buffer của video về
  const videoRes = await fetch(downloadUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(30000)
  });

  if (!videoRes.ok) {
    throw new Error(`Tải video thất bại (HTTP ${videoRes.status})`);
  }

  const arrayBuffer = await videoRes.arrayBuffer();
  const rawBuffer = Buffer.from(arrayBuffer);

  // 3. Tẩy rửa EXIF metadata và biến đổi mã Hash MD5/SHA256
  const cleanFilename = `video_${Date.now()}.mp4`;
  const sanitized = sanitizeVideoBuffer(rawBuffer, cleanFilename);

  // 4. Lưu file sạch vào thư mục data/uploads/
  const fileId = uuidv4();
  const savedFilename = `${fileId}_${cleanFilename}`;
  const savedFilePath = path.join(UPLOADS_DIR, savedFilename);

  fs.writeFileSync(savedFilePath, sanitized.sanitizedBuffer);

  // 5. Đăng ký tài sản vào bảng vault_assets
  const finalTitle = videoTitle || `Video sạch tải từ ${new URL(videoUrl).hostname}`;
  const stmt = db.prepare(`
    INSERT INTO vault_assets (id, filename, original_name, file_type, mime_type, file_size, title, file_path, owner_user_id, tags, created_at, updated_at)
    VALUES (?, ?, ?, 'video', 'video/mp4', ?, ?, ?, ?, 'reup,no-watermark,sanitized', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  stmt.run(fileId, savedFilename, cleanFilename, sanitized.sanitizedBuffer.length, finalTitle, savedFilePath, userId);

  return {
    success: true,
    assetId: fileId,
    title: finalTitle,
    filename: savedFilename,
    fileSize: sanitized.sanitizedBuffer.length,
    originalHash: sanitized.originalHash,
    newHash: sanitized.newHash,
    downloadPath: `/api/assets/raw/${fileId}`
  };
}

module.exports = {
  scrapeAndSanitizeVideo
};

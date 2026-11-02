const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { UPLOADS_DIR } = require('../config/constants');

// Danh sách định dạng cho phép
const ALLOWED_EXTENSIONS = {
  md: { mime: 'text/markdown; charset=utf-8', isText: true, label: 'Markdown' },
  txt: { mime: 'text/plain; charset=utf-8', isText: true, label: 'Text Script' },
  png: { mime: 'image/png', isText: false, label: 'PNG Image' },
  jpg: { mime: 'image/jpeg', isText: false, label: 'JPEG Image' },
  jpeg: { mime: 'image/jpeg', isText: false, label: 'JPEG Image' },
  webp: { mime: 'image/webp', isText: false, label: 'WebP Image' }
};

/**
 * Làm sạch tên file an toàn
 */
function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Lưu file tải lên vào hệ thống
 */
function saveAsset({ originalName, base64Data, title, associatedAccountId, associatedScheduleId, ownerUserId, tags }) {
  if (!originalName || !base64Data) {
    throw new Error('Thiếu tên file hoặc dữ liệu tải lên');
  }

  const ext = path.extname(originalName).toLowerCase().replace('.', '');
  if (!ALLOWED_EXTENSIONS[ext]) {
    throw new Error(`Định dạng .${ext} không được hỗ trợ. Chỉ chấp nhận .md, .txt, .png (và jpg, webp)`);
  }

  const id = uuidv4();
  const safeName = sanitizeFileName(path.basename(originalName));
  const storedFilename = `${id}_${safeName}`;
  const diskPath = path.join(UPLOADS_DIR, storedFilename);

  // Bóc tách header data:image/png;base64, nếu có
  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');

  if (buffer.length === 0) {
    throw new Error('File rỗng hoặc dữ liệu base64 không hợp lệ');
  }

  // Ghi file vật lý xuống ổ cứng
  fs.writeFileSync(diskPath, buffer);

  const fileConfig = ALLOWED_EXTENSIONS[ext];
  let contentText = null;

  // Nếu là file văn bản / markdown thì trích xuất text lưu DB để search & đọc tức thì
  if (fileConfig.isText) {
    contentText = buffer.toString('utf-8');
  }

  const assetTitle = (title && title.trim()) ? title.trim() : path.parse(originalName).name;

  const stmt = db.prepare(`
    INSERT INTO vault_assets (
      id, filename, original_name, file_type, mime_type, file_size,
      title, content_text, file_path, associated_account_id, associated_schedule_id,
      owner_user_id, tags, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  stmt.run(
    id,
    storedFilename,
    originalName,
    ext,
    fileConfig.mime,
    buffer.length,
    assetTitle,
    contentText,
    diskPath,
    associatedAccountId || null,
    associatedScheduleId || null,
    ownerUserId || null,
    tags ? tags.trim() : null
  );

  return getAssetById(id);
}

/**
 * Lấy danh sách tư liệu kèm thông tin kênh & lịch đăng liên kết
 */
function getAssets({ fileType, search, accountId, scheduleId, limit = 100, offset = 0 } = {}) {
  let query = `
    SELECT 
      v.*,
      a.account_name,
      a.platform as account_platform,
      a.username as account_username,
      s.video_title as schedule_title,
      s.scheduled_time as schedule_time,
      u.username as owner_username
    FROM vault_assets v
    LEFT JOIN accounts a ON v.associated_account_id = a.id
    LEFT JOIN content_schedules s ON v.associated_schedule_id = s.id
    LEFT JOIN users u ON v.owner_user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (fileType && fileType !== 'all') {
    if (fileType === 'images') {
      query += ` AND v.file_type IN ('png', 'jpg', 'jpeg', 'webp')`;
    } else {
      query += ` AND v.file_type = ?`;
      params.push(fileType.toLowerCase());
    }
  }

  if (accountId) {
    query += ` AND v.associated_account_id = ?`;
    params.push(accountId);
  }

  if (scheduleId) {
    query += ` AND v.associated_schedule_id = ?`;
    params.push(scheduleId);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query += ` AND (v.title LIKE ? OR v.original_name LIKE ? OR v.tags LIKE ? OR v.content_text LIKE ?)`;
    params.push(term, term, term, term);
  }

  query += ` ORDER BY v.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

/**
 * Lấy chi tiết 1 asset theo ID
 */
function getAssetById(id) {
  const row = db.prepare(`
    SELECT 
      v.*,
      a.account_name,
      a.platform as account_platform,
      a.username as account_username,
      s.video_title as schedule_title,
      s.scheduled_time as schedule_time,
      u.username as owner_username
    FROM vault_assets v
    LEFT JOIN accounts a ON v.associated_account_id = a.id
    LEFT JOIN content_schedules s ON v.associated_schedule_id = s.id
    LEFT JOIN users u ON v.owner_user_id = u.id
    WHERE v.id = ?
  `).get(id);

  return row || null;
}

/**
 * Cập nhật thông tin asset hoặc chỉnh sửa nội dung văn bản trực tiếp
 */
function updateAsset(id, { title, tags, associatedAccountId, associatedScheduleId, contentText }) {
  const asset = getAssetById(id);
  if (!asset) {
    throw new Error('Tư liệu không tồn tại');
  }

  let newContentText = asset.content_text;
  let newFileSize = asset.file_size;

  // Nếu người dùng sửa nội dung văn bản của file .md / .txt
  if (typeof contentText === 'string' && (asset.file_type === 'md' || asset.file_type === 'txt')) {
    newContentText = contentText;
    const newBuffer = Buffer.from(contentText, 'utf-8');
    newFileSize = newBuffer.length;
    // Ghi đè file trên ổ cứng
    if (fs.existsSync(asset.file_path)) {
      fs.writeFileSync(asset.file_path, newBuffer);
    }
  }

  const stmt = db.prepare(`
    UPDATE vault_assets SET
      title = COALESCE(?, title),
      tags = COALESCE(?, tags),
      associated_account_id = ?,
      associated_schedule_id = ?,
      content_text = ?,
      file_size = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  stmt.run(
    title ? title.trim() : asset.title,
    tags !== undefined ? (tags ? tags.trim() : null) : asset.tags,
    associatedAccountId !== undefined ? (associatedAccountId || null) : asset.associated_account_id,
    associatedScheduleId !== undefined ? (associatedScheduleId || null) : asset.associated_schedule_id,
    newContentText,
    newFileSize,
    id
  );

  return getAssetById(id);
}

/**
 * Xóa vĩnh viễn asset và file trên đĩa
 */
function deleteAsset(id) {
  const asset = getAssetById(id);
  if (!asset) {
    return false;
  }

  // Xóa file vật lý nếu tồn tại
  if (asset.file_path && fs.existsSync(asset.file_path)) {
    try {
      fs.unlinkSync(asset.file_path);
    } catch (e) {
      console.warn(`[ASSET WARN] Không thể xóa file vật lý: ${asset.file_path}`, e.message);
    }
  }

  const res = db.prepare('DELETE FROM vault_assets WHERE id = ?').run(id);
  return res.changes > 0;
}

/**
 * Lấy thông tin phục vụ tải file hoặc xem ảnh trực tiếp
 */
function getAssetFileMeta(id) {
  const asset = getAssetById(id);
  if (!asset) return null;
  if (!fs.existsSync(asset.file_path)) return null;

  return {
    filePath: asset.file_path,
    mimeType: asset.mime_type,
    originalName: asset.original_name,
    fileType: asset.file_type
  };
}

module.exports = {
  ALLOWED_EXTENSIONS,
  saveAsset,
  getAssets,
  getAssetById,
  updateAsset,
  deleteAsset,
  getAssetFileMeta
};

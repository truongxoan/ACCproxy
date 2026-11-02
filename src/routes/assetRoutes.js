const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');
const {
  saveAsset,
  getAssets,
  getAssetById,
  updateAsset,
  deleteAsset,
  getAssetFileMeta
} = require('../services/assetService');

const router = express.Router();
router.use(authenticateToken);

/**
 * GET /api/assets
 * Lấy danh sách tài liệu, kịch bản, ảnh thumbnail trong kho
 */
router.get('/', (req, res) => {
  try {
    const { file_type, search, account_id, schedule_id, limit, offset } = req.query;
    const assets = getAssets({
      fileType: file_type,
      search,
      accountId: account_id,
      scheduleId: schedule_id,
      limit: parseInt(limit, 10) || 100,
      offset: parseInt(offset, 10) || 0
    });

    return res.json({ success: true, assets });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/assets/:id
 * Lấy chi tiết một tài liệu (kèm nội dung text của .md / .txt)
 */
router.get('/:id', (req, res) => {
  try {
    const asset = getAssetById(req.params.id);
    if (!asset) {
      return res.status(404).json({ success: false, message: 'Tư liệu không tồn tại' });
    }
    return res.json({ success: true, asset });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/assets/:id/raw
 * Tải file raw hoặc phục vụ xem ảnh trực tiếp trên trình duyệt
 */
router.get('/:id/raw', (req, res) => {
  try {
    const meta = getAssetFileMeta(req.params.id);
    if (!meta) {
      return res.status(404).json({ success: false, message: 'File không tồn tại trên hệ thống' });
    }

    const isDownload = req.query.download === '1' || req.query.download === 'true';

    res.setHeader('Content-Type', meta.mimeType);
    if (isDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.originalName)}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(meta.originalName)}"`);
    }

    const fileStream = fs.createReadStream(meta.filePath);
    fileStream.pipe(res);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/assets/upload
 * Tải lên file .md, .txt, .png (nhận dữ liệu Base64)
 */
router.post('/upload', (req, res) => {
  try {
    const { originalName, base64Data, title, associatedAccountId, associatedScheduleId, tags } = req.body;

    if (!originalName || !base64Data) {
      return res.status(400).json({ success: false, message: 'Thiếu tên file hoặc dữ liệu tải lên' });
    }

    const asset = saveAsset({
      originalName,
      base64Data,
      title,
      associatedAccountId,
      associatedScheduleId,
      ownerUserId: req.user.id,
      tags
    });

    logAudit(req, 'UPLOAD_ASSET', 'vault_asset', asset.id, {
      originalName: asset.original_name,
      fileType: asset.file_type,
      fileSize: asset.file_size
    });

    return res.status(201).json({
      success: true,
      message: `Tải lên file ${asset.original_name} thành công!`,
      asset
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/assets/:id
 * Cập nhật thông tin hoặc sửa trực tiếp nội dung văn bản kịch bản (.md / .txt)
 */
router.put('/:id', (req, res) => {
  try {
    const { title, tags, associatedAccountId, associatedScheduleId, contentText } = req.body;
    const updated = updateAsset(req.params.id, {
      title,
      tags,
      associatedAccountId,
      associatedScheduleId,
      contentText
    });

    logAudit(req, 'UPDATE_ASSET', 'vault_asset', req.params.id, {
      hasTextEdit: typeof contentText === 'string'
    });

    return res.json({
      success: true,
      message: 'Cập nhật tư liệu thành công!',
      asset: updated
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/assets/:id
 * Xóa tư liệu khỏi kho
 */
router.delete('/:id', (req, res) => {
  try {
    const deleted = deleteAsset(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Tư liệu không tồn tại để xóa' });
    }

    logAudit(req, 'DELETE_ASSET', 'vault_asset', req.params.id, null);

    return res.json({ success: true, message: 'Đã xóa file khỏi kho tư liệu thành công!' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

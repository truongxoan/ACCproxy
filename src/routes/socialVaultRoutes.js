const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { encrypt, decrypt } = require('../services/cryptoService');
const { generateToken } = require('../services/totpService');
const { authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');

const router = express.Router();
router.use(authenticateToken);
router.use((req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  const allowed = Array.isArray(req.user?.allowed_tabs) ? req.user.allowed_tabs : [];
  if (!allowed.includes('tab-social-vault')) {
    return res.status(403).json({
      success: false,
      message: 'Bạn chưa được Admin cấp quyền xem Sổ Tay MXH!'
    });
  }
  return next();
});

/**
 * GET /api/social-vault
 * Lấy danh sách toàn bộ tài khoản mạng xã hội & cá nhân trong Sổ Tay Mật Khẩu
 */
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT *
      FROM social_vault
      ORDER BY is_pinned DESC, updated_at DESC
    `).all();

    const items = rows.map((row) => {
      let totpCode = null;
      let totpRemaining = null;
      if (row.totp_secret_encrypted) {
        const rawSecret = decrypt(row.totp_secret_encrypted);
        if (rawSecret) {
          const totp = generateToken(rawSecret);
          if (totp && totp.valid) {
            totpCode = totp.code;
            totpRemaining = totp.remainingSeconds;
          }
        }
      }

      return {
        id: row.id,
        platform: row.platform || 'other',
        label: row.label,
        username: row.username,
        has_password: !!row.password_encrypted,
        has_totp: !!row.totp_secret_encrypted,
        totp_code: totpCode,
        totp_remaining: totpRemaining,
        recovery_phone: row.recovery_phone || '',
        recovery_email: row.recovery_email || '',
        has_backup_codes: !!row.backup_codes_encrypted,
        profile_url: row.profile_url || '',
        notes: row.notes || '',
        is_pinned: row.is_pinned === 1,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    });

    return res.json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/social-vault/:id/reveal
 * Giải mã và trả về mật khẩu, 2FA Secret, Mã dự phòng khi Đại Ca cần lấy lại
 */
router.get('/:id/reveal', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM social_vault WHERE id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản trong sổ tay' });
    }

    const password = row.password_encrypted ? decrypt(row.password_encrypted) : '';
    const totpSecret = row.totp_secret_encrypted ? decrypt(row.totp_secret_encrypted) : '';
    const backupCodes = row.backup_codes_encrypted ? decrypt(row.backup_codes_encrypted) : '';

    let totpCode = null;
    if (totpSecret) {
      const t = generateToken(totpSecret);
      if (t && t.valid) totpCode = t.code;
    }

    logAudit(req, 'REVEAL_SOCIAL_VAULT', 'social_vault', row.id, {
      platform: row.platform,
      label: row.label
    });

    return res.json({
      success: true,
      id: row.id,
      platform: row.platform,
      label: row.label,
      username: row.username,
      password: password || '',
      totp_secret: totpSecret || '',
      totp_code: totpCode,
      backup_codes: backupCodes || '',
      recovery_phone: row.recovery_phone || '',
      recovery_email: row.recovery_email || '',
      profile_url: row.profile_url || '',
      notes: row.notes || '',
      is_pinned: row.is_pinned === 1
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/social-vault
 * Thêm mới một tài khoản mạng xã hội / cá nhân vào Sổ Tay Mật Khẩu
 */
router.post('/', (req, res) => {
  try {
    const {
      platform = 'facebook',
      label,
      username,
      password,
      totp_secret,
      recovery_phone,
      recovery_email,
      backup_codes,
      profile_url,
      notes,
      is_pinned
    } = req.body || {};

    if (!username || !String(username).trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập Tên đăng nhập / Email / SĐT!' });
    }

    const id = uuidv4();
    const finalLabel = (label && String(label).trim()) ? String(label).trim() : `${platform.toUpperCase()} - ${username}`;

    db.prepare(`
      INSERT INTO social_vault (
        id, owner_user_id, platform, label, username,
        password_encrypted, totp_secret_encrypted,
        recovery_phone, recovery_email, backup_codes_encrypted,
        profile_url, notes, is_pinned
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.user?.id || null,
      String(platform).toLowerCase().trim(),
      finalLabel,
      String(username).trim(),
      password ? encrypt(String(password)) : null,
      totp_secret ? encrypt(String(totp_secret).replace(/\s+/g, '')) : null,
      recovery_phone ? String(recovery_phone).trim() : null,
      recovery_email ? String(recovery_email).trim() : null,
      backup_codes ? encrypt(String(backup_codes).trim()) : null,
      profile_url ? String(profile_url).trim() : null,
      notes ? String(notes).trim() : null,
      is_pinned ? 1 : 0
    );

    logAudit(req, 'CREATE_SOCIAL_VAULT', 'social_vault', id, {
      platform,
      label: finalLabel,
      username
    });

    return res.status(201).json({
      success: true,
      id,
      message: `Đã lưu tài khoản [${finalLabel}] vào Két Sắt Mật Khẩu MXH!`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/social-vault/:id
 * Cập nhật thông tin tài khoản trong Sổ Tay Mật Khẩu
 */
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM social_vault WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại' });
    }

    const {
      platform,
      label,
      username,
      password,
      totp_secret,
      recovery_phone,
      recovery_email,
      backup_codes,
      profile_url,
      notes,
      is_pinned
    } = req.body || {};

    const finalPass = password !== undefined && password !== '' ? encrypt(String(password)) : existing.password_encrypted;
    const finalTotp = totp_secret !== undefined
      ? (totp_secret ? encrypt(String(totp_secret).replace(/\s+/g, '')) : null)
      : existing.totp_secret_encrypted;
    const finalBackup = backup_codes !== undefined
      ? (backup_codes ? encrypt(String(backup_codes).trim()) : null)
      : existing.backup_codes_encrypted;

    db.prepare(`
      UPDATE social_vault
      SET platform = ?,
          label = ?,
          username = ?,
          password_encrypted = ?,
          totp_secret_encrypted = ?,
          recovery_phone = ?,
          recovery_email = ?,
          backup_codes_encrypted = ?,
          profile_url = ?,
          notes = ?,
          is_pinned = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      platform ? String(platform).toLowerCase().trim() : existing.platform,
      label ? String(label).trim() : existing.label,
      username ? String(username).trim() : existing.username,
      finalPass,
      finalTotp,
      recovery_phone !== undefined ? String(recovery_phone).trim() : existing.recovery_phone,
      recovery_email !== undefined ? String(recovery_email).trim() : existing.recovery_email,
      finalBackup,
      profile_url !== undefined ? String(profile_url).trim() : existing.profile_url,
      notes !== undefined ? String(notes).trim() : existing.notes,
      is_pinned !== undefined ? (is_pinned ? 1 : 0) : existing.is_pinned,
      existing.id
    );

    logAudit(req, 'UPDATE_SOCIAL_VAULT', 'social_vault', existing.id, {
      platform: platform || existing.platform,
      label: label || existing.label
    });

    return res.json({
      success: true,
      message: 'Đã cập nhật thông tin tài khoản thành công!'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /api/social-vault/:id/pin
 * Ghim / Bỏ ghim tài khoản quan trọng lên đầu danh sách
 */
router.patch('/:id/pin', (req, res) => {
  try {
    const existing = db.prepare('SELECT id, label, is_pinned FROM social_vault WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại' });
    }

    const nextPin = existing.is_pinned === 1 ? 0 : 1;
    db.prepare('UPDATE social_vault SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nextPin, existing.id);

    return res.json({
      success: true,
      is_pinned: nextPin === 1,
      message: nextPin === 1 ? `⭐ Đã ghim [${existing.label}] lên đầu!` : `Đã bỏ ghim [${existing.label}]`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/social-vault/:id
 * Xóa tài khoản khỏi Sổ Tay Mật Khẩu
 */
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id, label, platform FROM social_vault WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại' });
    }

    db.prepare('DELETE FROM social_vault WHERE id = ?').run(existing.id);
    logAudit(req, 'DELETE_SOCIAL_VAULT', 'social_vault', existing.id, {
      label: existing.label,
      platform: existing.platform
    });

    return res.json({
      success: true,
      message: `Đã xóa [${existing.label}] khỏi sổ tay mật khẩu!`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/social-vault/bulk-import
 * Nhập nhanh hàng loạt tài khoản (Mỗi dòng: Platform | Tên gợi nhớ | User | Pass | 2FA | Ghi chú hoặc User|Pass|2FA)
 */
router.post('/bulk-import', (req, res) => {
  try {
    const { rawText, defaultPlatform = 'facebook' } = req.body || {};
    if (!rawText || !String(rawText).trim()) {
      return res.status(400).json({ success: false, message: 'Chưa có dữ liệu dòng tài khoản để nhập!' });
    }

    const lines = String(rawText)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const insertStmt = db.prepare(`
      INSERT INTO social_vault (
        id, owner_user_id, platform, label, username,
        password_encrypted, totp_secret_encrypted, notes, is_pinned
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    let imported = 0;
    const tx = db.transaction((entries) => {
      for (const line of entries) {
        const parts = line.split('|').map((p) => p.trim());
        if (parts.length < 2) continue;

        let platform = defaultPlatform;
        let label = '';
        let username = '';
        let password = '';
        let totp = '';
        let notes = '';

        if (parts.length >= 4 && ['facebook', 'zalo', 'tiktok', 'google', 'gmail', 'instagram', 'telegram', 'youtube', 'x', 'shopee', 'bank', 'apple', 'github', 'cloudflare', 'other'].includes(parts[0].toLowerCase())) {
          platform = parts[0].toLowerCase();
          label = parts[1];
          username = parts[2];
          password = parts[3] || '';
          totp = parts[4] || '';
          notes = parts.slice(5).join(' | ');
        } else {
          username = parts[0];
          password = parts[1] || '';
          totp = parts[2] || '';
          notes = parts.slice(3).join(' | ');
          label = `${platform.toUpperCase()} - ${username}`;
        }

        if (!username) continue;
        insertStmt.run(
          uuidv4(),
          req.user?.id || null,
          platform,
          label || `${platform.toUpperCase()} - ${username}`,
          username,
          password ? encrypt(password) : null,
          totp ? encrypt(totp.replace(/\s+/g, '')) : null,
          notes || null
        );
        imported++;
      }
    });

    tx(lines);
    logAudit(req, 'BULK_IMPORT_SOCIAL_VAULT', 'social_vault', null, { imported });

    return res.json({
      success: true,
      imported,
      message: `Đã nhập nhanh thành công ${imported} tài khoản vào Két Sắt MXH!`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

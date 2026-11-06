const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { encrypt, decrypt } = require('../services/cryptoService');
const { generateToken, batchGenerate } = require('../services/totpService');
const { authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');

const router = express.Router();
router.use(authenticateToken);
// Gating theo tab, cùng mẫu với socialVaultRoutes: admin qua hết,
// user thường phải được cấp tab-rentals trong allowed_tabs.
router.use((req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  const allowed = Array.isArray(req.user?.allowed_tabs) ? req.user.allowed_tabs : [];
  if (!allowed.includes('tab-rentals')) {
    return res.status(403).json({
      success: false,
      message: 'Bạn chưa được Admin cấp quyền xem Tài Khoản Thuê!'
    });
  }
  return next();
});

const EXPIRING_SOON_MS = 48 * 60 * 60 * 1000; // <= 48h nữa là hết hạn

function isOwnerOrAdmin(req, row) {
  return req.user.role === 'admin' || row.owner_user_id === req.user.id;
}

function toISODate(value, fallbackMs) {
  if (value) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date(fallbackMs).toISOString();
}

/** Trạng thái suy ra từ thời gian, không tin cột status đã lưu một mình. */
function computeRental(row) {
  const nowMs = Date.now();
  const rentedMs = new Date(row.rented_at).getTime();
  const expiresMs = new Date(row.expires_at).getTime();
  const totalMs = Math.max(expiresMs - rentedMs, 1);
  const msLeft = expiresMs - nowMs;
  let status = row.status;
  if (status !== 'returned') {
    if (msLeft <= 0) status = 'expired';
    else if (msLeft <= EXPIRING_SOON_MS) status = 'expiring_soon';
    else status = 'active';
  }
  return {
    status,
    ms_left: msLeft,
    days_left: msLeft > 0 ? msLeft / (24 * 60 * 60 * 1000) : 0,
    hours_left: msLeft > 0 ? Math.floor(msLeft / (60 * 60 * 1000)) : 0,
    // % thời gian thuê đã dùng, để vẽ thanh tiến trình ở frontend.
    used_percent: Math.min(100, Math.max(0, ((nowMs - rentedMs) / totalMs) * 100))
  };
}

function publicRental(req, row) {
  let totpCode = null;
  let totpRemaining = null;
  if (row.totp_secret_encrypted) {
    const secret = decrypt(row.totp_secret_encrypted);
    if (secret) {
      const t = generateToken(secret);
      if (t && t.valid) {
        totpCode = t.code;
        totpRemaining = t.remainingSeconds;
      }
    }
  }
  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    owner_username: row.owner_username || null,
    service: row.service || 'other',
    label: row.label,
    username: row.username,
    has_password: !!row.password_encrypted,
    has_totp: !!row.totp_secret_encrypted,
    totp_code: totpCode,
    totp_remaining: totpRemaining,
    seller: row.seller || '',
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    currency: row.currency || 'VND',
    rental_days: row.rental_days,
    rented_at: row.rented_at,
    expires_at: row.expires_at,
    notes: row.notes || '',
    is_pinned: row.is_pinned === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...computeRental(row)
  };
}

function parseRentalInput(body, existing) {
  const service = String(body.service || existing?.service || 'grok').toLowerCase().trim();
  const username = String(body.username || existing?.username || '').trim();
  const days = body.rental_days !== undefined && body.rental_days !== ''
    ? Math.max(1, Math.min(365, parseInt(body.rental_days, 10) || 7))
    : (existing?.rental_days || 7);
  const rentedAtMs = body.rented_at
    ? new Date(body.rented_at).getTime()
    : (existing ? new Date(existing.rented_at).getTime() : Date.now());
  const rentedAt = toISODate(body.rented_at, rentedAtMs);
  // Ưu tiên expires_at do người dùng nhập; nếu không, = ngày thuê + số ngày.
  const expiresAt = body.expires_at
    ? toISODate(body.expires_at, rentedAtMs + days * 24 * 60 * 60 * 1000)
    : new Date(rentedAtMs + days * 24 * 60 * 60 * 1000).toISOString();
  const price = body.price === undefined || body.price === '' || body.price === null
    ? (existing ? existing.price : null)
    : Math.max(0, Number(body.price) || 0);
  return {
    service,
    label: body.label !== undefined ? String(body.label).trim() : (existing?.label || ''),
    username,
    seller: body.seller !== undefined ? String(body.seller).trim() : (existing?.seller || ''),
    price,
    currency: body.currency ? String(body.currency).trim().toUpperCase() : (existing?.currency || 'VND'),
    rental_days: days,
    rented_at: rentedAt,
    expires_at: expiresAt,
    notes: body.notes !== undefined ? String(body.notes).trim() : (existing?.notes || ''),
    is_pinned: body.is_pinned !== undefined ? (body.is_pinned ? 1 : 0) : (existing?.is_pinned || 0)
  };
}

/**
 * GET /api/rentals
 * Danh sách tài khoản đang thuê / đã thuê. Admin thấy hết, user chỉ thấy của mình.
 */
router.get('/', (req, res) => {
  try {
    let rows = [];
    if (req.user.role === 'admin') {
      rows = db.prepare(`
        SELECT r.*, u.username as owner_username
        FROM rented_accounts r
        LEFT JOIN users u ON r.owner_user_id = u.id
        ORDER BY r.is_pinned DESC, r.expires_at ASC
      `).all();
    } else {
      rows = db.prepare(`
        SELECT r.*, u.username as owner_username
        FROM rented_accounts r
        LEFT JOIN users u ON r.owner_user_id = u.id
        WHERE r.owner_user_id = ?
        ORDER BY r.is_pinned DESC, r.expires_at ASC
      `).all(req.user.id);
    }
    const items = rows.map((r) => publicRental(req, r));
    const summary = {
      total: items.length,
      active: items.filter((i) => i.status === 'active').length,
      expiring_soon: items.filter((i) => i.status === 'expiring_soon').length,
      expired: items.filter((i) => i.status === 'expired').length,
      returned: items.filter((i) => i.status === 'returned').length,
      total_spent: items.reduce((s, i) => s + (Number(i.price) || 0), 0)
    };
    return res.json({ success: true, count: items.length, summary, items });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/rentals/totp/batch — phải khai báo TRƯỚC /:id để không bị nuốt route.
 */
router.get('/totp/batch', (req, res) => {
  try {
    let rows = [];
    if (req.user.role === 'admin') {
      rows = db.prepare('SELECT id, totp_secret_encrypted FROM rented_accounts WHERE totp_secret_encrypted IS NOT NULL').all();
    } else {
      rows = db.prepare('SELECT id, totp_secret_encrypted FROM rented_accounts WHERE owner_user_id = ? AND totp_secret_encrypted IS NOT NULL').all(req.user.id);
    }
    const list = rows.map((r) => ({ id: r.id, totpSecret: decrypt(r.totp_secret_encrypted) }));
    return res.json({ success: true, tokens: batchGenerate(list) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/rentals/:id/reveal — giải mã mật khẩu + 2FA secret (ghi audit như accounts/social-vault).
 */
router.get('/:id/reveal', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM rented_accounts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản thuê' });
    if (!isOwnerOrAdmin(req, row)) return res.status(403).json({ success: false, message: 'Bạn chỉ được xem tài khoản thuê của riêng bạn!' });

    const totpSecret = row.totp_secret_encrypted ? decrypt(row.totp_secret_encrypted) : '';
    let totpCode = null;
    if (totpSecret) {
      const t = generateToken(totpSecret);
      if (t && t.valid) totpCode = t.code;
    }
    logAudit(req, 'REVEAL_RENTAL', 'rented_account', row.id, { service: row.service, label: row.label });
    return res.json({
      success: true,
      ...publicRental(req, row),
      password: row.password_encrypted ? decrypt(row.password_encrypted) : '',
      totp_secret: totpSecret || '',
      totp_code: totpCode
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/rentals — ví dụ: Grok 7 ngày
 * { service:'grok', username:'...', password:'...', totp_secret:'...',
 *   rental_days:7, price:..., seller:'...', label:'Grok - 7 ngày' }
 * Không nhập rented_at => bắt đầu ngay lúc tạo, expires_at tự = +7 ngày.
 */
router.post('/', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.username || !String(body.username).trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập Tài khoản / Email đăng nhập!' });
    }
    const parsed = parseRentalInput(body, null);
    const id = uuidv4();
    const label = parsed.label || `${parsed.service.toUpperCase()} - ${parsed.username}`;
    db.prepare(`
      INSERT INTO rented_accounts (
        id, owner_user_id, service, label, username,
        password_encrypted, totp_secret_encrypted,
        seller, price, currency, rental_days, rented_at, expires_at,
        status, notes, is_pinned
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      id, req.user?.id || null, parsed.service, label, parsed.username,
      body.password ? encrypt(String(body.password)) : null,
      body.totp_secret ? encrypt(String(body.totp_secret).replace(/\s+/g, '')) : null,
      parsed.seller || null, parsed.price, parsed.currency,
      parsed.rental_days, parsed.rented_at, parsed.expires_at,
      parsed.notes || null, parsed.is_pinned
    );
    logAudit(req, 'CREATE_RENTAL', 'rented_account', id, { service: parsed.service, label, rental_days: parsed.rental_days, expires_at: parsed.expires_at });
    return res.status(201).json({ success: true, id, expires_at: parsed.expires_at, message: `Đã lưu [${label}] — thuê ${parsed.rental_days} ngày, hết hạn ${new Date(parsed.expires_at).toLocaleString('vi-VN')}` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/rentals/:id — sửa; đổi rental_days / rented_at mà không nhập
 * expires_at thì hạn mới tự tính lại.
 */
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM rented_accounts WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Tài khoản thuê không tồn tại' });
    if (!isOwnerOrAdmin(req, existing)) return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa tài khoản thuê của người khác!' });

    const body = req.body || {};
    const parsed = parseRentalInput(body, existing);
    const finalPass = body.password !== undefined && body.password !== '' ? encrypt(String(body.password)) : existing.password_encrypted;
    const finalTotp = body.totp_secret !== undefined
      ? (body.totp_secret ? encrypt(String(body.totp_secret).replace(/\s+/g, '')) : null)
      : existing.totp_secret_encrypted;
    // Nếu người dùng đổi số ngày / ngày thuê nhưng không nhập hạn mới thì tính lại hạn.
    const expiresAt = body.expires_at
      ? parsed.expires_at
      : (body.rental_days !== undefined || body.rented_at !== undefined
        ? new Date(new Date(parsed.rented_at).getTime() + parsed.rental_days * 24 * 60 * 60 * 1000).toISOString()
        : existing.expires_at);
    db.prepare(`
      UPDATE rented_accounts SET
        service = ?, label = ?, username = ?,
        password_encrypted = ?, totp_secret_encrypted = ?,
        seller = ?, price = ?, currency = ?,
        rental_days = ?, rented_at = ?, expires_at = ?,
        notes = ?, is_pinned = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      parsed.service, parsed.label || existing.label, parsed.username,
      finalPass, finalTotp,
      parsed.seller || null, parsed.price, parsed.currency,
      parsed.rental_days, parsed.rented_at, expiresAt,
      parsed.notes || null, parsed.is_pinned, existing.id
    );
    logAudit(req, 'UPDATE_RENTAL', 'rented_account', existing.id, { service: parsed.service, label: parsed.label });
    return res.json({ success: true, message: 'Đã cập nhật tài khoản thuê!' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/** PATCH /api/rentals/:id/return — trả tài khoản, dừng đếm ngược (không xóa lịch sử). */
router.patch('/:id/return', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM rented_accounts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Tài khoản thuê không tồn tại' });
    if (!isOwnerOrAdmin(req, row)) return res.status(403).json({ success: false, message: 'Bạn không có quyền thao tác tài khoản thuê của người khác!' });
    db.prepare("UPDATE rented_accounts SET status = 'returned', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
    logAudit(req, 'RETURN_RENTAL', 'rented_account', row.id, { service: row.service, label: row.label });
    return res.json({ success: true, message: `Đã đánh dấu trả [${row.label}]` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/** PATCH /api/rentals/:id/renew — gia hạn: { extra_days: 7 } (mặc định 7). */
router.patch('/:id/renew', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM rented_accounts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Tài khoản thuê không tồn tại' });
    if (!isOwnerOrAdmin(req, row)) return res.status(403).json({ success: false, message: 'Bạn không có quyền gia hạn tài khoản thuê của người khác!' });
    const extra = Math.max(1, Math.min(365, parseInt(req.body?.extra_days, 10) || 7));
    const baseMs = Math.max(new Date(row.expires_at).getTime(), Date.now());
    const newExpires = new Date(baseMs + extra * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      UPDATE rented_accounts
      SET expires_at = ?, rental_days = rental_days + ?, status = 'active', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newExpires, extra, row.id);
    logAudit(req, 'RENEW_RENTAL', 'rented_account', row.id, { extra_days: extra, new_expires_at: newExpires });
    return res.json({ success: true, expires_at: newExpires, message: `Đã gia hạn thêm ${extra} ngày, hạn mới ${new Date(newExpires).toLocaleString('vi-VN')}` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/** PATCH /api/rentals/:id/pin — ghim / bỏ ghim. */
router.patch('/:id/pin', (req, res) => {
  try {
    const row = db.prepare('SELECT id, owner_user_id, label, is_pinned FROM rented_accounts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Tài khoản thuê không tồn tại' });
    if (!isOwnerOrAdmin(req, row)) return res.status(403).json({ success: false, message: 'Bạn không có quyền thao tác tài khoản thuê của người khác!' });
    const nextPin = row.is_pinned === 1 ? 0 : 1;
    db.prepare('UPDATE rented_accounts SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nextPin, row.id);
    return res.json({ success: true, is_pinned: nextPin === 1, message: nextPin === 1 ? `⭐ Đã ghim [${row.label}]` : `Đã bỏ ghim [${row.label}]` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/** DELETE /api/rentals/:id */
router.delete('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM rented_accounts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Tài khoản thuê không tồn tại' });
    if (!isOwnerOrAdmin(req, row)) return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa tài khoản thuê của người khác!' });
    db.prepare('DELETE FROM rented_accounts WHERE id = ?').run(row.id);
    logAudit(req, 'DELETE_RENTAL', 'rented_account', row.id, { service: row.service, label: row.label });
    return res.json({ success: true, message: `Đã xóa [${row.label}] khỏi danh sách thuê!` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/rentals/bulk-import — mỗi dòng:
 * grok | Grok 7 ngày | user@example.com | pass | JBSW... | 7 | 150000 | Shop ABC | ghi chú
 * hoặc dạng ngắn: user | pass | totp | 7
 */
router.post('/bulk-import', (req, res) => {
  try {
    const { rawText, defaultService = 'grok' } = req.body || {};
    if (!rawText || !String(rawText).trim()) {
      return res.status(400).json({ success: false, message: 'Chưa có dữ liệu dòng tài khoản để nhập!' });
    }
    const lines = String(rawText).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const insertStmt = db.prepare(`
      INSERT INTO rented_accounts (
        id, owner_user_id, service, label, username,
        password_encrypted, totp_secret_encrypted,
        seller, price, currency, rental_days, rented_at, expires_at,
        status, notes, is_pinned
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'VND', ?, ?, ?, 'active', ?, 0)
    `);
    let imported = 0;
    const nowMs = Date.now();
    const tx = db.transaction((entries) => {
      for (const line of entries) {
        const parts = line.split('|').map((p) => p.trim());
        if (parts.length < 2) continue;
        let service = defaultService; let label = ''; let username = '';
        let password = ''; let totp = ''; let days = 7; let price = null; let seller = ''; let notes = '';
        if (parts.length >= 4) {
          service = parts[0].toLowerCase(); label = parts[1]; username = parts[2];
          password = parts[3] || ''; totp = parts[4] || '';
          days = Math.max(1, Math.min(365, parseInt(parts[5], 10) || 7));
          price = parts[6] ? (Number(parts[6]) || null) : null;
          seller = parts[7] || ''; notes = parts.slice(8).join(' | ');
        } else {
          username = parts[0]; password = parts[1] || ''; totp = parts[2] || '';
          days = Math.max(1, Math.min(365, parseInt(parts[3], 10) || 7));
        }
        if (!username) continue;
        const expires = new Date(nowMs + days * 24 * 60 * 60 * 1000).toISOString();
        insertStmt.run(
          uuidv4(), req.user?.id || null, service,
          label || `${service.toUpperCase()} - ${username}`, username,
          password ? encrypt(password) : null,
          totp ? encrypt(totp.replace(/\s+/g, '')) : null,
          seller || null, price, days,
          new Date(nowMs).toISOString(), expires, notes || null
        );
        imported++;
      }
    });
    tx(lines);
    logAudit(req, 'BULK_IMPORT_RENTAL', 'rented_account', null, { imported });
    return res.json({ success: true, imported, message: `Đã nhập nhanh ${imported} tài khoản thuê!` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

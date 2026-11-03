const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { PROFILES_DIR, ROLES } = require('../config/constants');
const { authenticateToken, canAccessAccount } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');
const { encrypt, decrypt } = require('../services/cryptoService');
const { generateToken, batchGenerate } = require('../services/totpService');
const { parseProxyString, checkProxy } = require('../services/proxyService');
const { launchProfile, closeProfile, isProfileRunning, captureScreenshot } = require('../services/browserService');
const { grantPermission } = require('../services/rbacService');

const router = express.Router();
router.use(authenticateToken);

/**
 * GET /api/accounts
 * Lấy danh sách tài khoản hợp lệ kèm mã 2FA và trạng thái trình duyệt
 */
router.get('/', (req, res) => {
  try {
    let accounts = [];

    if (req.user.role === ROLES.ADMIN) {
      accounts = db.prepare(`
        SELECT a.*, u.username as owner_username
        FROM accounts a
        LEFT JOIN users u ON a.owner_user_id = u.id
        ORDER BY a.created_at DESC
      `).all();
    } else {
      accounts = db.prepare(`
        SELECT DISTINCT a.*,
          u.username as owner_username,
          CASE WHEN a.owner_user_id = ? THEN 1 ELSE COALESCE(p.can_launch, 0) END as can_launch,
          CASE WHEN a.owner_user_id = ? THEN 1 ELSE COALESCE(p.can_reveal_password, 0) END as can_reveal_password
        FROM accounts a
        LEFT JOIN users u ON a.owner_user_id = u.id
        LEFT JOIN user_account_permissions p ON a.id = p.account_id AND p.user_id = ?
        WHERE a.owner_user_id = ? OR (p.user_id = ? AND p.can_view = 1)
        ORDER BY a.created_at DESC
      `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);
    }

    // Gắn thêm mã 2FA realtime và trạng thái Browser
    const enriched = accounts.map((acc) => {
      let totpInfo = { code: '------', remainingSeconds: 30, valid: false };
      if (acc.totp_secret_encrypted) {
        const secret = decrypt(acc.totp_secret_encrypted);
        if (secret) {
          totpInfo = generateToken(secret);
        }
      }

      return {
        id: acc.id,
        owner_user_id: acc.owner_user_id,
        owner_username: acc.owner_username || null,
        is_owner: req.user.role === ROLES.ADMIN || acc.owner_user_id === req.user.id,
        platform: acc.platform,
        login_url: acc.login_url,
        account_name: acc.account_name,
        username: acc.username,
        has_password: !!acc.password_encrypted,
        has_totp: !!acc.totp_secret_encrypted,
        totp_code: totpInfo.code,
        totp_remaining: totpInfo.remainingSeconds,
        totp_valid: totpInfo.valid,
        proxy_protocol: acc.proxy_protocol,
        proxy_host: acc.proxy_host,
        proxy_port: acc.proxy_port,
        proxy_user: acc.proxy_user,
        has_proxy_pass: !!acc.proxy_pass_encrypted,
        last_ip: acc.last_ip,
        last_country: acc.last_country,
        last_country_code: acc.last_country_code,
        proxy_latency: acc.proxy_latency,
        user_agent: acc.user_agent,
        notes: acc.notes,
        is_running: isProfileRunning(acc.id),
        can_launch: req.user.role === ROLES.ADMIN || acc.owner_user_id === req.user.id ? 1 : (acc.can_launch || 0),
        can_reveal_password: req.user.role === ROLES.ADMIN || acc.owner_user_id === req.user.id ? 1 : (acc.can_reveal_password || 0),
        created_at: acc.created_at,
        updated_at: acc.updated_at
      };
    });

    return res.json({ success: true, accounts: enriched });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/accounts
 * Thêm tài khoản mới
 */
router.post('/', (req, res) => {
  try {
    const {
      platform,
      login_url,
      account_name,
      username,
      password,
      totp_secret,
      raw_proxy,
      proxy_protocol,
      proxy_host,
      proxy_port,
      proxy_user,
      proxy_pass,
      user_agent,
      notes
    } = req.body;

    if (!platform || !username) {
      return res.status(400).json({ success: false, message: 'Platform và Username là bắt buộc!' });
    }

    // Tự động phân giải proxy nếu người dùng dán chuỗi raw_proxy
    let parsedProxy = {
      protocol: proxy_protocol || 'http',
      host: proxy_host || null,
      port: proxy_port ? parseInt(proxy_port, 10) : null,
      user: proxy_user || null,
      pass: proxy_pass || null
    };

    if (raw_proxy && raw_proxy.trim() !== '') {
      const extracted = parseProxyString(raw_proxy);
      if (extracted) {
        parsedProxy = extracted;
      }
    }

    const id = uuidv4();
    const passwordEncrypted = password ? encrypt(password) : null;
    const totpEncrypted = totp_secret ? encrypt(totp_secret) : null;
    const proxyPassEncrypted = parsedProxy.pass ? encrypt(parsedProxy.pass) : null;

    const stmt = db.prepare(`
      INSERT INTO accounts (
        id, owner_user_id, platform, login_url, account_name, username,
        password_encrypted, totp_secret_encrypted,
        proxy_protocol, proxy_host, proxy_port, proxy_user, proxy_pass_encrypted,
        user_agent, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);

    stmt.run(
      id,
      req.user.id,
      platform.toLowerCase(),
      login_url || null,
      account_name || null,
      username.trim(),
      passwordEncrypted,
      totpEncrypted,
      parsedProxy.protocol,
      parsedProxy.host,
      parsedProxy.port,
      parsedProxy.user,
      proxyPassEncrypted,
      user_agent || null,
      notes || null
    );

    // Tự động cấp full quyền cho người tạo nếu là User thường
    if (req.user.role !== ROLES.ADMIN) {
      grantPermission(req.user.id, id, { can_view: 1, can_launch: 1, can_reveal_password: 1 }, 'creator');
    }

    logAudit(req, 'CREATE_ACCOUNT', 'account', id, { platform, username });

    return res.status(201).json({
      success: true,
      message: 'Thêm tài khoản thành công',
      accountId: id
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/accounts/:id
 * Lấy chi tiết tài khoản
 */
router.get('/:id', canAccessAccount('view'), (req, res) => {
  try {
    const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!acc) {
      return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại' });
    }

    return res.json({
      success: true,
      account: {
        id: acc.id,
        platform: acc.platform,
        login_url: acc.login_url,
        account_name: acc.account_name,
        username: acc.username,
        has_password: !!acc.password_encrypted,
        has_totp: !!acc.totp_secret_encrypted,
        proxy_protocol: acc.proxy_protocol,
        proxy_host: acc.proxy_host,
        proxy_port: acc.proxy_port,
        proxy_user: acc.proxy_user,
        last_ip: acc.last_ip,
        last_country: acc.last_country,
        proxy_latency: acc.proxy_latency,
        user_agent: acc.user_agent,
        notes: acc.notes,
        is_running: isProfileRunning(acc.id)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/accounts/:id
 * Cập nhật thông tin tài khoản
 */
router.put('/:id', canAccessAccount('edit'), (req, res) => {
  try {
    const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!acc) {
      return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại' });
    }

    const {
      platform,
      login_url,
      account_name,
      username,
      password,
      totp_secret,
      raw_proxy,
      proxy_protocol,
      proxy_host,
      proxy_port,
      proxy_user,
      proxy_pass,
      user_agent,
      notes
    } = req.body;

    let parsedProxy = {
      protocol: proxy_protocol !== undefined ? proxy_protocol : acc.proxy_protocol,
      host: proxy_host !== undefined ? proxy_host : acc.proxy_host,
      port: proxy_port !== undefined ? parseInt(proxy_port, 10) : acc.proxy_port,
      user: proxy_user !== undefined ? proxy_user : acc.proxy_user,
      pass: null
    };

    if (raw_proxy && raw_proxy.trim() !== '') {
      const extracted = parseProxyString(raw_proxy);
      if (extracted) {
        parsedProxy = extracted;
      }
    }

    const newPasswordEnc = password !== undefined && password.trim() !== '' ? encrypt(password) : acc.password_encrypted;
    const newTotpEnc = totp_secret !== undefined && totp_secret.trim() !== '' ? encrypt(totp_secret) : acc.totp_secret_encrypted;
    const newProxyPassEnc = parsedProxy.pass ? encrypt(parsedProxy.pass) : (proxy_pass !== undefined && proxy_pass.trim() !== '' ? encrypt(proxy_pass) : acc.proxy_pass_encrypted);

    const stmt = db.prepare(`
      UPDATE accounts SET
        platform = COALESCE(?, platform),
        login_url = ?,
        account_name = ?,
        username = COALESCE(?, username),
        password_encrypted = ?,
        totp_secret_encrypted = ?,
        proxy_protocol = ?,
        proxy_host = ?,
        proxy_port = ?,
        proxy_user = ?,
        proxy_pass_encrypted = ?,
        user_agent = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      platform ? platform.toLowerCase() : null,
      login_url || null,
      account_name || null,
      username ? username.trim() : null,
      newPasswordEnc,
      newTotpEnc,
      parsedProxy.protocol,
      parsedProxy.host,
      parsedProxy.port,
      parsedProxy.user,
      newProxyPassEnc,
      user_agent || null,
      notes || null,
      acc.id
    );

    logAudit(req, 'UPDATE_ACCOUNT', 'account', acc.id, { username: acc.username });

    return res.json({ success: true, message: 'Cập nhật tài khoản thành công' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/accounts/:id
 * Xóa tài khoản và dọn dẹp profile
 */
router.delete('/:id', canAccessAccount('delete'), async (req, res) => {
  try {
    const accountId = req.params.id;

    // Nếu đang chạy browser thì đóng ngay
    if (isProfileRunning(accountId)) {
      await closeProfile(accountId);
    }

    // Xóa thư mục Profile trên đĩa
    const profileDir = path.join(PROFILES_DIR, accountId);
    if (fs.existsSync(profileDir)) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
      } catch (e) {
        console.warn(`⚠️ [AccountRoutes] Không thể xóa thư mục profile ${accountId}:`, e.message);
      }
    }

    // Xóa trong SQLite (Foreign key cascade sẽ tự dọn permissions)
    db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);

    logAudit(req, 'DELETE_ACCOUNT', 'account', accountId);

    return res.json({ success: true, message: 'Đã xóa tài khoản và hồ sơ trình duyệt' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/accounts/:id/reveal
 * Giải mã và lấy mật khẩu & TOTP secret gốc (Yêu cầu quyền can_reveal_password)
 */
router.get('/:id/reveal', canAccessAccount('reveal_password'), (req, res) => {
  try {
    const acc = db.prepare('SELECT id, username, password_encrypted, totp_secret_encrypted FROM accounts WHERE id = ?').get(req.params.id);
    if (!acc) {
      return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại' });
    }

    const plainPassword = acc.password_encrypted ? decrypt(acc.password_encrypted) : '';
    const plainTotp = acc.totp_secret_encrypted ? decrypt(acc.totp_secret_encrypted) : '';

    logAudit(req, 'REVEAL_PASSWORD', 'account', acc.id, { username: acc.username });

    return res.json({
      success: true,
      password: plainPassword,
      totp_secret: plainTotp
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/totp/batch
 * Lấy mã 2FA realtime hàng loạt cho toàn bộ tài khoản
 */
router.get('/totp/batch', (req, res) => {
  try {
    let rows = [];
    if (req.user.role === ROLES.ADMIN) {
      rows = db.prepare('SELECT id, totp_secret_encrypted FROM accounts WHERE totp_secret_encrypted IS NOT NULL').all();
    } else {
      rows = db.prepare(`
        SELECT DISTINCT a.id, a.totp_secret_encrypted
        FROM accounts a
        LEFT JOIN user_account_permissions p ON a.id = p.account_id AND p.user_id = ?
        WHERE (a.owner_user_id = ? OR (p.user_id = ? AND p.can_view = 1))
          AND a.totp_secret_encrypted IS NOT NULL
      `).all(req.user.id, req.user.id, req.user.id);
    }

    const decryptedList = rows.map((r) => ({
      id: r.id,
      totpSecret: decrypt(r.totp_secret_encrypted)
    }));

    const result = batchGenerate(decryptedList);
    return res.json({ success: true, tokens: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/accounts/:id/check-proxy
 * Kiểm tra trạng thái Proxy và cập nhật IP/Vị trí/Latency vào DB
 */
router.post('/:id/check-proxy', canAccessAccount('view'), async (req, res) => {
  try {
    const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!acc) {
      return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại' });
    }

    if (!acc.proxy_host || !acc.proxy_port) {
      return res.status(400).json({ success: false, message: 'Tài khoản này chưa cấu hình Proxy!' });
    }

    const proxyPass = acc.proxy_pass_encrypted ? decrypt(acc.proxy_pass_encrypted) : null;
    const proxyConfig = {
      protocol: acc.proxy_protocol || 'http',
      host: acc.proxy_host,
      port: acc.proxy_port,
      user: acc.proxy_user,
      pass: proxyPass
    };

    const checkResult = await checkProxy(proxyConfig);

    if (checkResult.success) {
      db.prepare(`
        UPDATE accounts SET
          last_ip = ?,
          last_country = ?,
          last_country_code = ?,
          proxy_latency = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(checkResult.ip, checkResult.country, checkResult.countryCode || null, checkResult.latencyMs, acc.id);
    }

    logAudit(req, 'CHECK_PROXY', 'account', acc.id, {
      success: checkResult.success,
      ip: checkResult.ip,
      latency: checkResult.latencyMs
    });

    return res.json(checkResult);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/accounts/:id/screenshot
 * Chụp ảnh màn hình trực tiếp phiên trình duyệt đang chạy (Piik Live Browser Preview)
 */
router.get('/:id/screenshot', canAccessAccount('view'), async (req, res) => {
  try {
    const result = await captureScreenshot(req.params.id);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/accounts/:id/launch
 * Khởi chạy trình duyệt Playwright cách ly cho tài khoản
 */
router.post('/:id/launch', canAccessAccount('launch'), async (req, res) => {
  try {
    const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!acc) {
      return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại' });
    }

    const proxyPass = acc.proxy_pass_encrypted ? decrypt(acc.proxy_pass_encrypted) : null;
    const accountForLaunch = {
      ...acc,
      proxy_pass: proxyPass
    };

    const launchResult = await launchProfile(accountForLaunch);
    logAudit(req, 'LAUNCH_BROWSER', 'account', acc.id, { username: acc.username });

    return res.json(launchResult);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/accounts/:id/close
 * Đóng trình duyệt của tài khoản
 */
router.post('/:id/close', canAccessAccount('launch'), async (req, res) => {
  try {
    const closeResult = await closeProfile(req.params.id);
    logAudit(req, 'CLOSE_BROWSER', 'account', req.params.id);
    return res.json(closeResult);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/accounts/import
 * Nhập hàng loạt tài khoản
 * Định dạng dòng: platform|username|password|2fa_secret|proxy_string|account_name|login_url
 */
router.post('/import', (req, res) => {
  try {
    const { raw_data } = req.body;
    if (!raw_data || typeof raw_data !== 'string') {
      return res.status(400).json({ success: false, message: 'Dữ liệu import không hợp lệ' });
    }

    const lines = raw_data.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('#'));
    let successCount = 0;
    let failCount = 0;

    const insertStmt = db.prepare(`
      INSERT INTO accounts (
        id, owner_user_id, platform, login_url, account_name, username,
        password_encrypted, totp_secret_encrypted,
        proxy_protocol, proxy_host, proxy_port, proxy_user, proxy_pass_encrypted,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const runImport = db.transaction(() => {
      for (const line of lines) {
        try {
          const parts = line.split('|').map((p) => p.trim());
          if (parts.length < 2) {
            failCount++;
            continue;
          }

          const platform = (parts[0] || 'custom').toLowerCase();
          const username = parts[1];
          const password = parts[2] || '';
          const totpSecret = parts[3] || '';
          const rawProxy = parts[4] || '';
          const accountName = parts[5] || username;
          const loginUrl = parts[6] || '';

          const parsedProxy = rawProxy ? parseProxyString(rawProxy) : null;
          const id = uuidv4();
          const passwordEnc = password ? encrypt(password) : null;
          const totpEnc = totpSecret ? encrypt(totpSecret) : null;
          const proxyPassEnc = parsedProxy && parsedProxy.pass ? encrypt(parsedProxy.pass) : null;

          insertStmt.run(
            id,
            req.user.id,
            platform,
            loginUrl || null,
            accountName || null,
            username,
            passwordEnc,
            totpEnc,
            parsedProxy ? parsedProxy.protocol : 'http',
            parsedProxy ? parsedProxy.host : null,
            parsedProxy ? parsedProxy.port : null,
            parsedProxy ? parsedProxy.user : null,
            proxyPassEnc
          );

          if (req.user.role !== ROLES.ADMIN) {
            grantPermission(req.user.id, id, { can_view: 1, can_launch: 1, can_reveal_password: 1 }, 'import');
          }

          successCount++;
        } catch (e) {
          failCount++;
        }
      }
    });

    runImport();
    logAudit(req, 'IMPORT_ACCOUNTS', 'system', null, { successCount, failCount });

    return res.json({
      success: true,
      message: `Đã import thành công ${successCount} tài khoản (Thất bại: ${failCount})`,
      successCount,
      failCount
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

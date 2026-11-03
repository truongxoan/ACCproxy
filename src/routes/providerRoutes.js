const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');
const { dispatchCheckProvider } = require('../services/proxyProviderService');
const { encrypt } = require('../services/cryptoService');

const router = express.Router();
router.use(authenticateToken);

/**
 * GET /api/providers
 * Lấy danh sách các Provider API Keys đã lưu
 */
router.get('/', (req, res) => {
  try {
    let rows = [];
    if (req.user && req.user.role === 'admin') {
      rows = db.prepare(`
        SELECT p.*, u.username as owner_username
        FROM proxy_providers p
        LEFT JOIN users u ON p.owner_user_id = u.id
        ORDER BY p.created_at DESC
      `).all();
    } else {
      rows = db.prepare(`
        SELECT p.*, u.username as owner_username
        FROM proxy_providers p
        LEFT JOIN users u ON p.owner_user_id = u.id
        WHERE p.owner_user_id = ?
        ORDER BY p.created_at DESC
      `).all(req.user.id);
    }

    const masked = rows.map(r => ({
      ...r,
      api_key_masked: r.api_key.length > 8 ? `${r.api_key.substring(0, 6)}••••••••` : '••••••••'
    }));
    return res.json({ success: true, providers: masked });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/providers/test-live
 * Kiểm tra trực tiếp một API Key từ bên bán mà không cần lưu vào DB
 */
router.post('/test-live', async (req, res) => {
  try {
    const { provider_type, api_key, api_url } = req.body;
    if (!api_key) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập API Key của bên bán proxy' });
    }

    const checkResult = await dispatchCheckProvider(provider_type, api_key, api_url);
    logAudit(req, 'TEST_PROVIDER_API_KEY', 'proxy_provider', null, { provider_type, status: checkResult.status });

    return res.json(checkResult);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/providers
 * Lưu một Provider API Key mới vào hệ thống
 */
router.post('/', async (req, res) => {
  try {
    const { provider_name, provider_type, api_key, api_url } = req.body;
    if (!provider_name || !api_key) {
      return res.status(400).json({ success: false, message: 'Tên nhà cung cấp và API Key là bắt buộc!' });
    }

    // Kiểm tra trực tiếp tình trạng API key trước khi lưu
    const checkResult = await dispatchCheckProvider(provider_type, api_key, api_url);

    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO proxy_providers (
        id, owner_user_id, provider_name, provider_type, api_key, api_url,
        last_check_status, current_proxy, country_code, timeout_seconds,
        details, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      id,
      req.user?.id || null,
      provider_name.trim(),
      provider_type || 'custom',
      api_key.trim(),
      api_url ? api_url.trim() : null,
      checkResult.status || (checkResult.success ? 'active' : 'error'),
      checkResult.proxy || null,
      checkResult.countryCode || null,
      checkResult.timeoutSeconds || 0,
      JSON.stringify(checkResult)
    );

    logAudit(req, 'SAVE_PROVIDER_API', 'proxy_provider', id, { provider_name, provider_type });

    return res.status(201).json({
      success: true,
      message: 'Đã lưu và kiểm tra API Key thành công!',
      providerId: id,
      checkResult
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/providers/:id/check
 * Kiểm tra lại trạng thái API Key & Cập nhật proxy mới nhất
 */
router.post('/:id/check', async (req, res) => {
  try {
    const provider = db.prepare('SELECT * FROM proxy_providers WHERE id = ?').get(req.params.id);
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Provider Key' });
    }
    if (req.user.role !== 'admin' && provider.owner_user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền kiểm tra Provider Key của người khác!' });
    }

    const checkResult = await dispatchCheckProvider(provider.provider_type, provider.api_key, provider.api_url);

    db.prepare(`
      UPDATE proxy_providers SET
        last_check_status = ?,
        current_proxy = COALESCE(?, current_proxy),
        country_code = COALESCE(?, country_code),
        timeout_seconds = ?,
        details = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      checkResult.status || (checkResult.success ? 'active' : 'error'),
      checkResult.proxy || null,
      checkResult.countryCode || null,
      checkResult.timeoutSeconds || 0,
      JSON.stringify(checkResult),
      provider.id
    );

    logAudit(req, 'CHECK_PROVIDER_API', 'proxy_provider', provider.id, { status: checkResult.status });

    return res.json({
      success: true,
      checkResult
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/providers/:id/assign-to-account
 * Tự động gán Proxy lấy được từ bên bán vào một tài khoản cụ thể
 */
router.post('/:id/assign-to-account', async (req, res) => {
  try {
    const { account_id } = req.body;
    if (!account_id) {
      return res.status(400).json({ success: false, message: 'Chưa chọn tài khoản cần gán Proxy!' });
    }

    const provider = db.prepare('SELECT * FROM proxy_providers WHERE id = ?').get(req.params.id);
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Provider không tồn tại' });
    }
    if (req.user.role !== 'admin' && provider.owner_user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền sử dụng Provider Key của người khác!' });
    }

    const targetAcc = db.prepare('SELECT id, owner_user_id FROM accounts WHERE id = ?').get(account_id);
    if (!targetAcc) {
      return res.status(404).json({ success: false, message: 'Kênh cần gán không tồn tại' });
    }
    if (req.user.role !== 'admin' && targetAcc.owner_user_id !== req.user.id) {
      const perm = db.prepare('SELECT can_view FROM user_account_permissions WHERE user_id = ? AND account_id = ?').get(req.user.id, account_id);
      if (!perm || !perm.can_view) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền gán Proxy vào kênh này!' });
      }
    }

    // Kiểm tra và lấy proxy mới nhất từ bên bán
    const checkResult = await dispatchCheckProvider(provider.provider_type, provider.api_key, provider.api_url);
    if (!checkResult.success || !checkResult.proxy) {
      return res.status(400).json({
        success: false,
        message: `Không thể lấy proxy từ bên bán: ${checkResult.error || 'Chưa có proxy khả dụng'}`
      });
    }

    const parsed = checkResult.parsedProxy;
    if (!parsed || !parsed.host || !parsed.port) {
      return res.status(400).json({ success: false, message: 'Định dạng Proxy từ bên bán không hợp lệ' });
    }

    const proxyPassEncrypted = parsed.pass ? encrypt(parsed.pass) : null;

    db.prepare(`
      UPDATE accounts SET
        proxy_protocol = ?,
        proxy_host = ?,
        proxy_port = ?,
        proxy_user = ?,
        proxy_pass_encrypted = ?,
        last_country_code = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      parsed.protocol || 'http',
      parsed.host,
      parsed.port,
      parsed.user || null,
      proxyPassEncrypted,
      checkResult.countryCode || null,
      account_id
    );

    logAudit(req, 'ASSIGN_PROVIDER_PROXY', 'account', account_id, {
      provider: provider.provider_name,
      proxy: checkResult.proxy
    });

    return res.json({
      success: true,
      message: `Đã gán thành công Proxy [${checkResult.proxy}] từ nhà bán [${provider.provider_name}] vào tài khoản!`,
      proxy: checkResult.proxy
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/providers/:id
 * Xóa Provider Key
 */
router.delete('/:id', (req, res) => {
  try {
    const provider = db.prepare('SELECT id, owner_user_id FROM proxy_providers WHERE id = ?').get(req.params.id);
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Provider không tồn tại' });
    }
    if (req.user.role !== 'admin' && provider.owner_user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa Provider API Key của người khác!' });
    }
    db.prepare('DELETE FROM proxy_providers WHERE id = ?').run(req.params.id);
    logAudit(req, 'DELETE_PROVIDER_API', 'proxy_provider', req.params.id);
    return res.json({ success: true, message: 'Đã xóa Provider API Key' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

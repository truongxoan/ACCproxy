const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { JWT_SECRET } = require('../config/constants');
const { authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');
const { getUserByUsername } = require('../services/rbacService');
const googleAuth = require('../services/googleAuthService');

const router = express.Router();

// Tài khoản khách tự đăng ký chỉ được vào Cửa Hàng (xem + đặt mua).
// Mọi tab quản trị / tài khoản nội bộ vẫn do admin cấp tay.
const CUSTOMER_TABS = JSON.stringify(['tab-shop']);

function issueToken(res, user) {
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  // sameSite 'lax' (không phải 'strict') để cookie còn dùng được sau khi
  // trình duyệt quay về từ Google OAuth (redirect cross-site).
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  });
  return token;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email || null,
    role: user.role,
    avatar_url: user.avatar_url || null,
    auth_provider: user.auth_provider || 'local',
    allowed_tabs: user.allowed_tabs || ['tab-shop']
  };
}

function findUserByLogin(login) {
  const row = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(login, login);
  if (!row) return null;
  try {
    row.allowed_tabs = JSON.parse(row.allowed_tabs || '["tab-shop"]');
  } catch (e) {
    row.allowed_tabs = ['tab-shop'];
  }
  return row;
}

/** GET /api/auth/config — frontend biết có bật Google / đăng ký không. */
router.get('/config', (req, res) => {
  return res.json({
    success: true,
    google_enabled: googleAuth.isConfigured(),
    registration_enabled: true
  });
});

/**
 * POST /api/auth/register — khách tự tạo tài khoản (không cần admin tạo hộ).
 * Luôn tạo role 'user', không bao giờ tự lên admin.
 */
router.post('/register', (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    const cleanUser = String(username || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPass = String(password || '');

    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(cleanUser)) {
      return res.status(400).json({ success: false, message: 'Tên đăng nhập 3-30 ký tự, chỉ gồm chữ, số, dấu _ . -' });
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Email không đúng định dạng' });
    }
    if (cleanPass.length < 8) {
      return res.status(400).json({ success: false, message: 'Mật khẩu phải từ 8 ký tự trở lên' });
    }
    if (getUserByUsername(cleanUser)) {
      return res.status(400).json({ success: false, message: 'Tên đăng nhập này đã có người dùng' });
    }
    if (cleanEmail && db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Email này đã được đăng ký' });
    }

    const id = uuidv4();
    const hash = bcrypt.hashSync(cleanPass, bcrypt.genSaltSync(10));
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, status, allowed_tabs, auth_provider, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'user', 'active', ?, 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(id, cleanUser, cleanEmail || null, hash, CUSTOMER_TABS);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const token = issueToken(res, user);
    logAudit(req, 'REGISTER', 'user', id, { username: cleanUser });
    return res.status(201).json({
      success: true,
      message: 'Tạo tài khoản thành công! Chào mừng bạn đến Cửa Hàng.',
      token,
      user: publicUser({ ...user, allowed_tabs: JSON.parse(CUSTOMER_TABS) })
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/auth/login — đăng nhập bằng tên đăng nhập HOẶC email.
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng nhập đầy đủ Tên đăng nhập và Mật khẩu'
    });
  }

  const user = findUserByLogin(String(username).trim());
  if (!user) {
    logAudit(req, 'LOGIN_FAILED', 'user', null, { reason: 'User không tồn tại', attemptUser: username });
    return res.status(401).json({
      success: false,
      message: 'Tên đăng nhập hoặc Mật khẩu không chính xác'
    });
  }

  if (user.status === 'locked') {
    logAudit(req, 'LOGIN_BLOCKED', 'user', user.id, { reason: 'Tài khoản bị khóa' });
    return res.status(403).json({
      success: false,
      message: 'Tài khoản này đang bị khóa bởi Quản trị viên'
    });
  }

  // Tài khoản Google-only (chưa đặt mật khẩu) thì không đăng nhập bằng mật khẩu được.
  if (!user.password_hash) {
    return res.status(401).json({
      success: false,
      message: 'Tài khoản này đăng nhập bằng Google, vui lòng bấm nút Google'
    });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    logAudit(req, 'LOGIN_FAILED', 'user', user.id, { reason: 'Sai mật khẩu' });
    return res.status(401).json({
      success: false,
      message: 'Tên đăng nhập hoặc Mật khẩu không chính xác'
    });
  }

  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  const token = issueToken(res, user);
  logAudit(req, 'LOGIN_SUCCESS', 'user', user.id, { role: user.role });

  return res.json({
    success: true,
    message: 'Đăng nhập thành công',
    token,
    user: publicUser(user)
  });
});

/**
 * GET /api/auth/google — bắt đầu đăng nhập Google.
 * Chưa cấu hình GOOGLE_CLIENT_ID/SECRET thì trả lỗi rõ ràng thay vì redirect hỏng.
 */
router.get('/google', (req, res) => {
  if (!googleAuth.isConfigured()) {
    return res.status(400).json({
      success: false,
      message: 'Đăng nhập Google chưa được cấu hình trên server này (thiếu GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). Admin xem hướng dẫn trong file HUONG-DAN-TAI-KHOAN-THUE.md.'
    });
  }
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000
  });
  return res.redirect(googleAuth.buildAuthUrl(req, state));
});

/** GET /api/auth/google/callback — Google trả về, tạo/liên kết tài khoản rồi đăng nhập. */
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).send('Google không trả về mã xác thực.');
    if (!state || state !== req.cookies.google_oauth_state) {
      return res.status(400).send('Phiên đăng nhập Google không hợp lệ (sai state). Vui lòng thử lại.');
    }
    res.clearCookie('google_oauth_state');
    const redirectUri = googleAuth.getRedirectUri(req);
    const tokens = await googleAuth.exchangeCode(code, redirectUri);
    if (!tokens.access_token) throw new Error('Google không trả access_token');
    const profile = await googleAuth.fetchGoogleUser(tokens.access_token);
    if (!profile.email || profile.email_verified === false) {
      throw new Error('Tài khoản Google chưa xác minh email.');
    }

    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(profile.sub);
    if (!user) {
      const byEmail = db.prepare('SELECT * FROM users WHERE email = ?').get(profile.email.toLowerCase());
      if (byEmail) {
        // Email đã có tài khoản local -> liên kết Google vào tài khoản đó.
        db.prepare('UPDATE users SET google_id = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(profile.sub, profile.picture || null, byEmail.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(byEmail.id);
      } else {
        // Tạo tài khoản mới từ Google.
        let base = String(profile.email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 20) || 'user';
        let username = base;
        let n = 1;
        while (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
          username = `${base}${n++}`;
        }
        const id = uuidv4();
        db.prepare(`
          INSERT INTO users (id, username, email, password_hash, role, status, allowed_tabs, auth_provider, google_id, avatar_url, created_at, updated_at)
          VALUES (?, ?, ?, '', 'user', 'active', ?, 'google', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(id, username, profile.email.toLowerCase(), CUSTOMER_TABS, profile.sub, profile.picture || null);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        logAudit(req, 'REGISTER_GOOGLE', 'user', id, { username, email: profile.email });
      }
    }
    if (user.status === 'locked') {
      return res.status(403).send('Tài khoản này đang bị khóa bởi Quản trị viên.');
    }
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP, avatar_url = ? WHERE id = ?')
      .run(profile.picture || user.avatar_url || null, user.id);
    issueToken(res, user);
    logAudit(req, 'LOGIN_GOOGLE', 'user', user.id, { email: profile.email });
    return res.redirect('/?welcome=google');
  } catch (error) {
    console.error('❌ [Google OAuth]:', error.message);
    return res.status(500).send(`Đăng nhập Google thất bại: ${error.message}`);
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', authenticateToken, (req, res) => {
  logAudit(req, 'LOGOUT', 'user', req.user.id);
  res.clearCookie('token');
  return res.json({
    success: true,
    message: 'Đã đăng xuất thành công'
  });
});

/**
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
});

module.exports = router;

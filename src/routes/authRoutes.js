const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { JWT_SECRET } = require('../config/constants');
const { authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');
const { getUserByUsername } = require('../services/rbacService');

const router = express.Router();

/**
 * POST /api/auth/login
 * Đăng nhập vào hệ thống
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng nhập đầy đủ Tên đăng nhập và Mật khẩu'
    });
  }

  const user = getUserByUsername(username.trim());
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

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    logAudit(req, 'LOGIN_FAILED', 'user', user.id, { reason: 'Sai mật khẩu' });
    return res.status(401).json({
      success: false,
      message: 'Tên đăng nhập hoặc Mật khẩu không chính xác'
    });
  }

  // Cập nhật thời điểm đăng nhập gần nhất
  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

  // Ký JWT Token (Thời hạn 24 giờ)
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  // Đặt cookie HttpOnly an toàn
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000
  });

  logAudit(req, 'LOGIN_SUCCESS', 'user', user.id, { role: user.role });

  return res.json({
    success: true,
    message: 'Đăng nhập thành công',
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role
    }
  });
});

/**
 * POST /api/auth/logout
 * Đăng xuất khỏi hệ thống
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
 * Lấy thông tin phiên hiện tại
 */
router.get('/me', authenticateToken, (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
});

module.exports = router;

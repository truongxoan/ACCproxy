const jwt = require('jsonwebtoken');
const { JWT_SECRET, ROLES } = require('../config/constants');
const db = require('../config/db');

/**
 * Middleware xác thực JWT token từ Header hoặc Cookie
 */
function authenticateToken(req, res, next) {
  let token = null;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Phiên làm việc chưa được xác thực. Vui lòng đăng nhập!'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Token đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại!'
      });
    }

    // Kiểm tra trạng thái người dùng trong DB
    const user = db.prepare('SELECT id, username, role, status, allowed_tabs FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Người dùng không còn tồn tại' });
    }

    if (user.status === 'locked') {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản của bạn đã bị khóa bởi Quản trị viên'
      });
    }

    let allowedTabs = ['tab-accounts'];
    if (user.role === ROLES.ADMIN) {
      allowedTabs = [
        'tab-accounts',
        'tab-schedules',
        'tab-assets',
        'tab-piik',
        'tab-tools',
        'tab-social-vault',
        'tab-phone',
        'tab-knowledge',
        'tab-admin'
      ];
    } else if (user.allowed_tabs) {
      try {
        const parsed = JSON.parse(user.allowed_tabs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          allowedTabs = parsed.filter((t) => t !== 'tab-admin');
        }
      } catch (e) {}
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      allowed_tabs: allowedTabs
    };
    next();
  });
}

/**
 * Middleware kiểm tra vai trò người dùng (RBAC)
 * @param {string} requiredRole - 'admin' hoặc 'user'
 */
function requireRole(requiredRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    }

    if (req.user.role !== requiredRole && req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền thực hiện hành động này (Yêu cầu quyền Admin)'
      });
    }

    next();
  };
}

/**
 * Middleware kiểm tra quyền thao tác trên tài khoản cụ thể
 * @param {'view'|'launch'|'reveal_password'|'edit'|'delete'} action
 */
function canAccessAccount(action = 'view') {
  return (req, res, next) => {
    const accountId = req.params.id;
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Thiếu Account ID' });
    }

    // Admin có toàn quyền trên mọi tài khoản
    if (req.user.role === ROLES.ADMIN) {
      return next();
    }

    // Nếu là User thường:
    const perm = db.prepare(`
      SELECT can_view, can_launch, can_reveal_password
      FROM user_account_permissions
      WHERE user_id = ? AND account_id = ?
    `).get(req.user.id, accountId);

    if (!perm || !perm.can_view) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không được phân quyền truy cập tài khoản này!'
      });
    }

    if (action === 'launch' && !perm.can_launch) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền mở trình duyệt cho tài khoản này!'
      });
    }

    if (action === 'reveal_password' && !perm.can_reveal_password) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xem/sao chép mật khẩu gốc của tài khoản này!'
      });
    }

    if (['edit', 'delete'].includes(action)) {
      // Chỉ Admin hoặc chủ sở hữu tài khoản mới có quyền sửa/xóa
      const acc = db.prepare('SELECT owner_user_id FROM accounts WHERE id = ?').get(accountId);
      if (!acc || acc.owner_user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Chỉ Quản trị viên hoặc người tạo tài khoản mới có quyền chỉnh sửa/xóa!'
        });
      }
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole,
  canAccessAccount
};

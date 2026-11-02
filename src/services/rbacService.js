const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');

/**
 * Lấy danh sách toàn bộ người dùng trong hệ thống (ẩn password hash)
 * @returns {Array<object>}
 */
function getAllUsers() {
  const stmt = db.prepare(`
    SELECT id, username, role, status, last_login, created_at, updated_at,
    (SELECT COUNT(*) FROM user_account_permissions WHERE user_id = users.id) as assigned_accounts_count
    FROM users
    ORDER BY created_at DESC
  `);
  return stmt.all();
}

/**
 * Lấy thông tin chi tiết một User theo ID
 * @param {string} id
 * @returns {object|null}
 */
function getUserById(id) {
  const stmt = db.prepare(`
    SELECT id, username, role, status, last_login, created_at, updated_at
    FROM users WHERE id = ?
  `);
  return stmt.get(id) || null;
}

/**
 * Tìm người dùng theo username (dành cho bước xác thực login)
 * @param {string} username
 * @returns {object|null}
 */
function getUserByUsername(username) {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username) || null;
}

/**
 * Tạo người dùng mới
 * @param {string} username
 * @param {string} password
 * @param {'admin'|'user'} [role='user']
 * @returns {object}
 */
function createUser(username, password, role = 'user') {
  if (!username || !password) {
    throw new Error('Username và Password không được để trống');
  }

  const existing = getUserByUsername(username);
  if (existing) {
    throw new Error(`Tên người dùng '${username}' đã tồn tại`);
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const id = uuidv4();

  const stmt = db.prepare(`
    INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  stmt.run(id, username, passwordHash, role);

  return { id, username, role, status: 'active' };
}

/**
 * Cập nhật thông tin hoặc đổi mật khẩu người dùng
 * @param {string} id
 * @param {object} updates - { password, role, status }
 */
function updateUser(id, updates = {}) {
  const user = getUserById(id);
  if (!user) {
    throw new Error('Người dùng không tồn tại');
  }

  const fields = [];
  const params = [];

  if (updates.password && updates.password.trim() !== '') {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(updates.password, salt);
    fields.push('password_hash = ?');
    params.push(hash);
  }

  if (updates.role && ['admin', 'user'].includes(updates.role)) {
    fields.push('role = ?');
    params.push(updates.role);
  }

  if (updates.status && ['active', 'locked'].includes(updates.status)) {
    fields.push('status = ?');
    params.push(updates.status);
  }

  if (fields.length === 0) {
    return user;
  }

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...params);

  return getUserById(id);
}

/**
 * Xóa người dùng (không được xóa Super Admin gốc)
 * @param {string} id
 */
function deleteUser(id) {
  const user = getUserById(id);
  if (!user) {
    throw new Error('Người dùng không tồn tại');
  }

  if (user.username === 'admin') {
    throw new Error('Không thể xóa Super Admin gốc của hệ thống!');
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return true;
}

/**
 * Lấy danh sách quyền tài khoản của một User
 * @param {string} userId
 * @returns {Array<object>}
 */
function getUserPermissions(userId) {
  const stmt = db.prepare(`
    SELECT p.*, a.platform, a.account_name, a.username as account_username
    FROM user_account_permissions p
    JOIN accounts a ON p.account_id = a.id
    WHERE p.user_id = ?
  `);
  return stmt.all(userId);
}

/**
 * Gán quyền truy cập tài khoản cho User
 * @param {string} userId
 * @param {string} accountId
 * @param {object} perms - { can_view, can_launch, can_reveal_password }
 * @param {string} grantedBy
 */
function grantPermission(userId, accountId, perms = {}, grantedBy = 'system') {
  const id = uuidv4();
  const canView = perms.can_view !== undefined ? (perms.can_view ? 1 : 0) : 1;
  const canLaunch = perms.can_launch !== undefined ? (perms.can_launch ? 1 : 0) : 1;
  const canReveal = perms.can_reveal_password !== undefined ? (perms.can_reveal_password ? 1 : 0) : 0;

  const stmt = db.prepare(`
    INSERT INTO user_account_permissions (id, user_id, account_id, can_view, can_launch, can_reveal_password, granted_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, account_id) DO UPDATE SET
      can_view = excluded.can_view,
      can_launch = excluded.can_launch,
      can_reveal_password = excluded.can_reveal_password,
      granted_by = excluded.granted_by
  `);
  stmt.run(id, userId, accountId, canView, canLaunch, canReveal, grantedBy);
}

/**
 * Thu hồi quyền truy cập tài khoản của User
 * @param {string} userId
 * @param {string} accountId
 */
function revokePermission(userId, accountId) {
  db.prepare('DELETE FROM user_account_permissions WHERE user_id = ? AND account_id = ?').run(userId, accountId);
}

/**
 * Cập nhật danh sách quyền tài khoản hàng loạt cho một User
 * @param {string} userId
 * @param {Array<{ accountId: string, can_view: boolean, can_launch: boolean, can_reveal_password: boolean }>} permissions
 * @param {string} grantedBy
 */
function syncUserPermissions(userId, permissions = [], grantedBy = 'admin') {
  const runTransaction = db.transaction(() => {
    db.prepare('DELETE FROM user_account_permissions WHERE user_id = ?').run(userId);
    for (const p of permissions) {
      if (p.can_view) {
        grantPermission(userId, p.accountId, p, grantedBy);
      }
    }
  });
  runTransaction();
}

module.exports = {
  getAllUsers,
  getUserById,
  getUserByUsername,
  createUser,
  updateUser,
  deleteUser,
  getUserPermissions,
  grantPermission,
  revokePermission,
  syncUserPermissions
};

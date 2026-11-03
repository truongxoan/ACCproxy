const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');

const ALL_TABS = [
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

const DEFAULT_USER_TABS = ['tab-accounts'];

function sanitizeAllowedTabs(rawTabs, role = 'user') {
  if (role === 'admin') {
    return [...ALL_TABS];
  }
  let parsed = rawTabs;
  if (typeof rawTabs === 'string') {
    try {
      parsed = JSON.parse(rawTabs);
    } catch (e) {
      parsed = DEFAULT_USER_TABS;
    }
  }
  if (!Array.isArray(parsed)) {
    return [...DEFAULT_USER_TABS];
  }
  const clean = parsed.filter((t) => typeof t === 'string' && ALL_TABS.includes(t) && t !== 'tab-admin');
  return clean.length > 0 ? Array.from(new Set(clean)) : [...DEFAULT_USER_TABS];
}

function formatUserRow(row) {
  if (!row) return null;
  return {
    ...row,
    allowed_tabs: sanitizeAllowedTabs(row.allowed_tabs, row.role)
  };
}

/**
 * Lấy danh sách toàn bộ người dùng trong hệ thống (ẩn password hash)
 * @returns {Array<object>}
 */
function getAllUsers() {
  const stmt = db.prepare(`
    SELECT id, username, role, status, allowed_tabs, last_login, created_at, updated_at,
    (
      SELECT COUNT(DISTINCT a.id)
      FROM accounts a
      LEFT JOIN user_account_permissions p ON a.id = p.account_id AND p.user_id = users.id
      WHERE a.owner_user_id = users.id OR (p.user_id = users.id AND p.can_view = 1)
    ) as assigned_accounts_count,
    (SELECT COUNT(*) FROM accounts WHERE owner_user_id = users.id) as owned_accounts_count
    FROM users
    ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, created_at DESC
  `);
  return stmt.all().map(formatUserRow);
}

/**
 * Lấy thông tin chi tiết một User theo ID
 * @param {string} id
 * @returns {object|null}
 */
function getUserById(id) {
  const stmt = db.prepare(`
    SELECT id, username, role, status, allowed_tabs, last_login, created_at, updated_at
    FROM users WHERE id = ?
  `);
  return formatUserRow(stmt.get(id));
}

/**
 * Tìm người dùng theo username (dành cho bước xác thực login)
 * @param {string} username
 * @returns {object|null}
 */
function getUserByUsername(username) {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return formatUserRow(stmt.get(username));
}

/**
 * Tạo người dùng mới kèm phân quyền Tab hiển thị & Tài khoản
 * @param {string} username
 * @param {string} password
 * @param {'admin'|'user'} [role='user']
 * @param {Array<string>} [allowedTabs]
 * @param {Array<object>} [permissions]
 * @param {string} [grantedBy='admin']
 * @returns {object}
 */
function createUser(username, password, role = 'user', allowedTabs = null, permissions = [], grantedBy = 'admin') {
  const cleanUser = String(username || '').trim();
  const cleanPass = String(password || '');
  if (!cleanUser || !cleanPass) {
    throw new Error('Username và Password không được để trống');
  }

  const existing = getUserByUsername(cleanUser);
  if (existing) {
    throw new Error(`Tên người dùng '${cleanUser}' đã tồn tại`);
  }

  const validRole = role === 'admin' ? 'admin' : 'user';
  const finalTabs = sanitizeAllowedTabs(allowedTabs || DEFAULT_USER_TABS, validRole);
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(cleanPass, salt);
  const id = uuidv4();

  const runTx = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, allowed_tabs, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    stmt.run(id, cleanUser, passwordHash, validRole, JSON.stringify(finalTabs));

    if (Array.isArray(permissions) && permissions.length > 0 && validRole !== 'admin') {
      for (const p of permissions) {
        const accId = p && (p.accountId || p.account_id);
        if (accId && p.can_view) {
          grantPermission(id, accId, p, grantedBy);
        }
      }
    }
  });

  runTx();

  return getUserById(id);
}

/**
 * Cập nhật thông tin hoặc đổi mật khẩu người dùng
 * @param {string} id
 * @param {object} updates - { password, role, status, allowed_tabs }
 */
function updateUser(id, updates = {}) {
  const user = getUserById(id);
  if (!user) {
    throw new Error('Người dùng không tồn tại');
  }

  const fields = [];
  const params = [];

  if (updates.password && String(updates.password).trim() !== '') {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(String(updates.password), salt);
    fields.push('password_hash = ?');
    params.push(hash);
  }

  const nextRole = updates.role && ['admin', 'user'].includes(updates.role) ? updates.role : user.role;
  if (updates.role && ['admin', 'user'].includes(updates.role)) {
    fields.push('role = ?');
    params.push(updates.role);
  }

  if (updates.status && ['active', 'locked'].includes(updates.status)) {
    if ((user.username === 'TX' || user.username === 'admin') && updates.status === 'locked') {
      throw new Error('Không thể khóa tài khoản Super Admin gốc!');
    }
    fields.push('status = ?');
    params.push(updates.status);
  }

  if (updates.allowed_tabs !== undefined) {
    const cleanTabs = sanitizeAllowedTabs(updates.allowed_tabs, nextRole);
    fields.push('allowed_tabs = ?');
    params.push(JSON.stringify(cleanTabs));
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

  if (user.username === 'admin' || user.username === 'TX') {
    throw new Error('Không thể xóa Super Admin tối cao của hệ thống!');
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
 * Cập nhật danh sách quyền tài khoản hàng loạt & quyền hiển thị Tab cho một User
 * @param {string} userId
 * @param {Array<{ accountId: string, can_view: boolean, can_launch: boolean, can_reveal_password: boolean }>} permissions
 * @param {string} grantedBy
 * @param {Array<string>|null} [allowedTabs=null]
 */
function syncUserPermissions(userId, permissions = [], grantedBy = 'admin', allowedTabs = null) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('Người dùng không tồn tại');
  }

  const runTransaction = db.transaction(() => {
    db.prepare('DELETE FROM user_account_permissions WHERE user_id = ?').run(userId);
    for (const p of permissions) {
      const accId = p && (p.accountId || p.account_id);
      if (accId && p.can_view) {
        grantPermission(userId, accId, p, grantedBy);
      }
    }

    // Bảo toàn quyền toàn diện của User trên các tài khoản/kênh do chính User đó tự tạo
    const ownedAccounts = db.prepare('SELECT id FROM accounts WHERE owner_user_id = ?').all(userId);
    for (const ownAcc of ownedAccounts) {
      grantPermission(userId, ownAcc.id, { can_view: 1, can_launch: 1, can_reveal_password: 1 }, 'owner');
    }

    if (allowedTabs !== null && allowedTabs !== undefined) {
      const cleanTabs = sanitizeAllowedTabs(allowedTabs, user.role);
      db.prepare('UPDATE users SET allowed_tabs = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(JSON.stringify(cleanTabs), userId);
    }
  });
  runTransaction();
  return getUserById(userId);
}

module.exports = {
  ALL_TABS,
  DEFAULT_USER_TABS,
  sanitizeAllowedTabs,
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

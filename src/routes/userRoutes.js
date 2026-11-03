const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUserPermissions,
  syncUserPermissions
} = require('../services/rbacService');

const router = express.Router();

// Tất cả route trong file này yêu cầu quyền Admin
router.use(authenticateToken);
router.use(requireRole('admin'));

/**
 * GET /api/users
 * Lấy danh sách toàn bộ người dùng
 */
router.get('/', (req, res) => {
  try {
    const users = getAllUsers();
    return res.json({ success: true, users });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/users
 * Tạo người dùng mới kèm phân quyền Tab hiển thị và Tài khoản
 */
router.post('/', (req, res) => {
  try {
    const { username, password, role, allowed_tabs, permissions } = req.body;
    const newUser = createUser(
      username,
      password,
      role || 'user',
      allowed_tabs || null,
      permissions || [],
      req.user.username
    );
    logAudit(req, 'CREATE_USER', 'user', newUser.id, {
      createdUser: newUser.username,
      role: newUser.role,
      allowedTabs: newUser.allowed_tabs
    });
    return res.status(201).json({ success: true, user: newUser, message: 'Tạo tài khoản thành công' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/users/:id
 * Cập nhật thông tin/đổi mật khẩu/khóa User/cập nhật allowed_tabs
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { password, role, status, allowed_tabs } = req.body;
    const updated = updateUser(id, { password, role, status, allowed_tabs });
    logAudit(req, 'UPDATE_USER', 'user', id, { role, status, passwordChanged: !!password, allowed_tabs });
    return res.json({ success: true, user: updated, message: 'Cập nhật thành công' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/users/:id
 * Xóa người dùng
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    deleteUser(id);
    logAudit(req, 'DELETE_USER', 'user', id);
    return res.json({ success: true, message: 'Đã xóa người dùng thành công' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/users/:id/permissions
 * Xem danh sách phân quyền tài khoản & tab của user
 */
router.get('/:id/permissions', (req, res) => {
  try {
    const { id } = req.params;
    const targetUser = getUserById(id);
    const permissions = getUserPermissions(id);
    return res.json({
      success: true,
      permissions,
      allowed_tabs: targetUser ? targetUser.allowed_tabs : ['tab-accounts'],
      user: targetUser
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/users/:id/permissions
 * Đồng bộ danh sách phân quyền tài khoản & tab hiển thị cho user
 */
router.post('/:id/permissions', (req, res) => {
  try {
    const { id } = req.params;
    const { permissions, allowed_tabs, password } = req.body;
    if (password && String(password).trim() !== '') {
      updateUser(id, { password: String(password).trim() });
    }
    const updatedUser = syncUserPermissions(
      id,
      permissions || [],
      req.user.username,
      allowed_tabs !== undefined ? allowed_tabs : null
    );
    logAudit(req, 'SYNC_PERMISSIONS', 'user', id, {
      count: (permissions || []).length,
      allowedTabs: updatedUser ? updatedUser.allowed_tabs : undefined
    });
    return res.json({
      success: true,
      user: updatedUser,
      message: 'Đã cập nhật phân quyền thành công'
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;

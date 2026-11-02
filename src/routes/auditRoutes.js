const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const db = require('../config/db');

const router = express.Router();
router.use(authenticateToken);
router.use(requireRole('admin'));

/**
 * GET /api/audit-logs
 * Lấy lịch sử vết kiểm toán (Audit Logs) có phân trang và bộ lọc
 */
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const { action, userId } = req.query;

    const conditions = [];
    const params = [];

    if (action && action.trim() !== '') {
      conditions.push('l.action = ?');
      params.push(action.trim());
    }

    if (userId && userId.trim() !== '') {
      conditions.push('l.user_id = ?');
      params.push(userId.trim());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) as total FROM audit_logs l ${whereClause}`;
    const totalRow = db.prepare(countSql).get(...params);

    const querySql = `
      SELECT l.*, u.username
      FROM audit_logs l
      LEFT JOIN users u ON l.user_id = u.id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const logs = db.prepare(querySql).all(...params, limit, offset);

    return res.json({
      success: true,
      total: totalRow.total,
      limit,
      offset,
      logs
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

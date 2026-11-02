const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { analyzeSecuritySuggestions } = require('../services/suggestionService');
const { ROLES } = require('../config/constants');

const router = express.Router();
router.use(authenticateToken);

/**
 * GET /api/suggestions
 * Quét toàn bộ hệ thống và đưa ra các cảnh báo & gợi ý thông minh
 */
router.get('/', (req, res) => {
  try {
    // Nếu là Admin thì quét toàn bộ hệ thống, nếu là User thì chỉ quét tài khoản được cấp quyền
    const targetUserId = req.user.role === ROLES.ADMIN ? null : req.user.id;
    const suggestions = analyzeSecuritySuggestions(targetUserId);

    return res.json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

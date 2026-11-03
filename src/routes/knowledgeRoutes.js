const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');
const { getKnowledgeSummary, getRepos, getHubItems, syncRemoteKnowledge } = require('../services/knowledgeService');

const router = express.Router();
router.use(authenticateToken);

/**
 * GET /api/knowledge/summary
 * Lấy tóm tắt kiến thức chiến lược & các trụ cột công nghệ
 */
router.get('/summary', (req, res) => {
  try {
    const summary = getKnowledgeSummary();
    return res.json(summary);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/knowledge/repos
 * Lấy danh sách 360+ GitHub Repositories (hỗ trợ category, search, language, pagination)
 */
router.get('/repos', (req, res) => {
  try {
    const { category, search, language, page, limit } = req.query;
    const result = getRepos({ category, search, language, page, limit });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/knowledge/hub
 * Lấy danh sách tài nguyên và bài chia sẻ từ kho Hub
 */
router.get('/hub', (req, res) => {
  try {
    const { category, search, author, page, limit } = req.query;
    const result = getHubItems({ category, search, author, page, limit });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/knowledge/sync
 * Kích hoạt đồng bộ live từ kho tri thức triennguyen.com về máy chủ
 */
router.post('/sync', async (req, res) => {
  try {
    const result = await syncRemoteKnowledge();
    logAudit(req, 'SYNC_KNOWLEDGE', 'system', null, result);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

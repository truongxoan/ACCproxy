const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');
const { launchProfile } = require('../services/browserService');
const { decrypt } = require('../services/cryptoService');
const { ROLES } = require('../config/constants');

const router = express.Router();
router.use(authenticateToken);

// Map link upload studio trực tiếp của từng nền tảng
const STUDIO_UPLOAD_URLS = {
  tiktok: 'https://www.tiktok.com/creator-center/upload?from=upload',
  google: 'https://studio.youtube.com/channel/upload', // YouTube Studio
  youtube: 'https://studio.youtube.com/channel/upload',
  facebook: 'https://www.facebook.com/reels/create',
  x: 'https://x.com/compose/post',
  custom: 'https://www.google.com'
};

/**
 * GET /api/schedules
 * Lấy danh sách lịch nhắc nhở up video
 */
router.get('/', (req, res) => {
  try {
    let schedules = [];

    if (req.user.role === ROLES.ADMIN) {
      schedules = db.prepare(`
        SELECT s.*, a.account_name, a.username as account_username, a.login_url, u.username as assigned_username
        FROM content_schedules s
        JOIN accounts a ON s.account_id = a.id
        LEFT JOIN users u ON s.assigned_user_id = u.id
        ORDER BY s.scheduled_time ASC
      `).all();
    } else {
      schedules = db.prepare(`
        SELECT DISTINCT s.*, a.account_name, a.username as account_username, a.login_url, u.username as assigned_username
        FROM content_schedules s
        JOIN accounts a ON s.account_id = a.id
        LEFT JOIN user_account_permissions p ON a.id = p.account_id AND p.user_id = ?
        LEFT JOIN users u ON s.assigned_user_id = u.id
        WHERE a.owner_user_id = ? OR (p.user_id = ? AND p.can_view = 1) OR s.assigned_user_id = ?
        ORDER BY s.scheduled_time ASC
      `).all(req.user.id, req.user.id, req.user.id, req.user.id);
    }

    // Tính toán thời gian còn lại đến giờ đăng hôm nay
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentTotalMin = currentHour * 60 + currentMin;

    const enriched = schedules.map(s => {
      const [h, m] = s.scheduled_time.split(':').map(Number);
      const scheduleTotalMin = (h || 0) * 60 + (m || 0);
      const diffMin = scheduleTotalMin - currentTotalMin;

      let timeStatus = 'upcoming'; // Sắp tới
      if (s.status === 'posted') {
        timeStatus = 'completed';
      } else if (diffMin < 0) {
        timeStatus = 'overdue'; // Quá giờ mà chưa up
      } else if (diffMin <= 30) {
        timeStatus = 'urgent'; // Trong vòng 30 phút nữa phải up
      }

      return {
        ...s,
        minutes_remaining: diffMin,
        time_status: timeStatus,
        studio_url: STUDIO_UPLOAD_URLS[s.platform.toLowerCase()] || a_login_url || STUDIO_UPLOAD_URLS.custom
      };
    });

    return res.json({ success: true, schedules: enriched });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/schedules/summary
 * Thống kê tiến độ up video hôm nay
 */
router.get('/summary', (req, res) => {
  try {
    let total = 0;
    let posted = 0;
    if (req.user.role === ROLES.ADMIN) {
      total = db.prepare('SELECT COUNT(*) as c FROM content_schedules').get().c;
      posted = db.prepare("SELECT COUNT(*) as c FROM content_schedules WHERE status = 'posted'").get().c;
    } else {
      total = db.prepare(`
        SELECT COUNT(DISTINCT s.id) as c
        FROM content_schedules s
        JOIN accounts a ON s.account_id = a.id
        LEFT JOIN user_account_permissions p ON a.id = p.account_id AND p.user_id = ?
        WHERE a.owner_user_id = ? OR (p.user_id = ? AND p.can_view = 1) OR s.assigned_user_id = ?
      `).get(req.user.id, req.user.id, req.user.id, req.user.id).c;
      posted = db.prepare(`
        SELECT COUNT(DISTINCT s.id) as c
        FROM content_schedules s
        JOIN accounts a ON s.account_id = a.id
        LEFT JOIN user_account_permissions p ON a.id = p.account_id AND p.user_id = ?
        WHERE (a.owner_user_id = ? OR (p.user_id = ? AND p.can_view = 1) OR s.assigned_user_id = ?)
          AND s.status = 'posted'
      `).get(req.user.id, req.user.id, req.user.id, req.user.id).c;
    }
    const pending = total - posted;

    return res.json({
      success: true,
      total,
      posted,
      pending,
      percent: total > 0 ? Math.round((posted / total) * 100) : 100
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * POST /api/schedules
 * Thêm lịch nhắc nhở đăng video mới
 */
router.post('/', (req, res) => {
  try {
    const {
      account_id,
      video_title,
      scheduled_time,
      frequency,
      caption,
      hashtags,
      assigned_user_id,
      notes
    } = req.body;

    if (!account_id || !video_title || !scheduled_time) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn Tài khoản, Tiêu đề video và Giờ đăng!'
      });
    }

    const acc = db.prepare('SELECT platform FROM accounts WHERE id = ?').get(account_id);
    if (!acc) {
      return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại' });
    }

    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO content_schedules (
        id, account_id, assigned_user_id, video_title, platform,
        scheduled_time, frequency, status, caption, hashtags, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      id,
      account_id,
      assigned_user_id || req.user.id,
      video_title.trim(),
      acc.platform,
      scheduled_time.trim(),
      frequency || 'daily',
      caption || null,
      hashtags || null,
      notes || null
    );

    logAudit(req, 'CREATE_SCHEDULE', 'content_schedule', id, { video_title, scheduled_time });

    return res.status(201).json({
      success: true,
      message: 'Đã lên lịch nhắc nhở đăng video thành công!',
      scheduleId: id
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/schedules/:id
 * Cập nhật trạng thái hoặc thông tin lịch (Đánh dấu đã đăng, cập nhật link)
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, posted_url, video_title, scheduled_time, caption, hashtags, notes } = req.body;

    const existing = db.prepare('SELECT * FROM content_schedules WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Lịch đăng không tồn tại' });
    }

    const fields = [];
    const params = [];

    if (status) {
      fields.push('status = ?');
      params.push(status);
      if (status === 'posted') {
        fields.push('posted_at = CURRENT_TIMESTAMP');
      }
    }

    if (posted_url !== undefined) {
      fields.push('posted_url = ?');
      params.push(posted_url);
    }

    if (video_title) {
      fields.push('video_title = ?');
      params.push(video_title);
    }

    if (scheduled_time) {
      fields.push('scheduled_time = ?');
      params.push(scheduled_time);
    }

    if (caption !== undefined) {
      fields.push('caption = ?');
      params.push(caption);
    }

    if (hashtags !== undefined) {
      fields.push('hashtags = ?');
      params.push(hashtags);
    }

    if (notes !== undefined) {
      fields.push('notes = ?');
      params.push(notes);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    db.prepare(`UPDATE content_schedules SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    logAudit(req, 'UPDATE_SCHEDULE', 'content_schedule', id, { status, posted_url });

    return res.json({ success: true, message: 'Cập nhật lịch đăng thành công!' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/schedules/:id
 * Xóa lịch nhắc nhở
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM content_schedules WHERE id = ?').run(id);
    logAudit(req, 'DELETE_SCHEDULE', 'content_schedule', id);
    return res.json({ success: true, message: 'Đã xóa lịch đăng' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/schedules/:id/launch-studio
 * 1-Click: Mở thẳng trình duyệt Chromium cách ly + Proxy vào đúng Studio Upload Video của nền tảng!
 */
router.post('/:id/launch-studio', async (req, res) => {
  try {
    const schedule = db.prepare(`
      SELECT s.*, a.*
      FROM content_schedules s
      JOIN accounts a ON s.account_id = a.id
      WHERE s.id = ?
    `).get(req.params.id);

    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Lịch đăng không tồn tại' });
    }

    // Chọn URL đích là Studio upload video của nền tảng đó
    const uploadUrl = STUDIO_UPLOAD_URLS[schedule.platform.toLowerCase()] || schedule.login_url || 'https://www.google.com';

    const proxyPass = schedule.proxy_pass_encrypted ? decrypt(schedule.proxy_pass_encrypted) : null;
    const accountForLaunch = {
      ...schedule,
      login_url: uploadUrl, // Ghi đè URL đích để mở thẳng vào trang up video
      proxy_pass: proxyPass
    };

    const launchResult = await launchProfile(accountForLaunch);
    logAudit(req, 'LAUNCH_UPLOAD_STUDIO', 'content_schedule', schedule.id, { platform: schedule.platform, uploadUrl });

    return res.json({
      success: true,
      message: `Đã mở trang Up Video (${schedule.platform.toUpperCase()}) cho kênh [${schedule.account_name || schedule.username}]!`,
      launchResult
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

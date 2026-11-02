require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { PORT } = require('./config/constants');
const { closeAllProfiles } = require('./services/browserService');
const { sendVideoPostingAlert, getTelegramConfig } = require('./services/telegramService');
const db = require('./config/db');

// Khởi tạo Database SQLite & Seeding

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const accountRoutes = require('./routes/accountRoutes');
const suggestionRoutes = require('./routes/suggestionRoutes');
const auditRoutes = require('./routes/auditRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const toolRoutes = require('./routes/toolRoutes');
const providerRoutes = require('./routes/providerRoutes');
const assetRoutes = require('./routes/assetRoutes');

const app = express();

// 1. Lớp phòng thủ mạng (Network & HTTP Headers Protection)
app.use(
  helmet({
    contentSecurityPolicy: false, // Cho phép nạp CDN TailwindCSS, FontAwesome và Inline Scripts phục vụ SPA
    crossOriginEmbedderPolicy: false
  })
);

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 2. Chốt chặn chống Brute-Force mật khẩu đăng nhập
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 20, // Tối đa 20 lần thử sai từ một địa chỉ IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Bạn đã thử đăng nhập sai quá nhiều lần. Vui lòng quay lại sau 15 phút!'
  }
});
app.use('/api/auth/login', loginLimiter);

// 3. Phục vụ tài nguyên tĩnh Frontend
app.use(express.static(path.join(process.cwd(), 'public')));

// 4. Đăng ký các tuyến API nghiệp vụ
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/suggestions', suggestionRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/tools', toolRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/assets', assetRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Điều hướng SPA về index.html cho các route không khớp API
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  } else {
    res.status(404).json({ success: false, message: 'Endpoint không tồn tại' });
  }
});

// Xử lý lỗi toàn cục (Global Error Handler)
app.use((err, req, res, next) => {
  console.error('❌ [SERVER ERROR]:', err);
  res.status(500).json({
    success: false,
    message: 'Lỗi hệ thống nội bộ',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Khởi chạy máy chủ
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('================================================================');
  console.log(`🚀 [SERVER KHỞI CHẠY THÀNH CÔNG]`);
  console.log(`🌐 Local Access:   http://localhost:${PORT}`);
  console.log(`🌐 Network Access: http://0.0.0.0:${PORT} (Dùng chung cho 2, 4, 6 người trong LAN / VPN / Cloudflare Tunnel)`);
  console.log(`🔒 Trạng thái: Sẵn sàng phục vụ đa người dùng đồng bộ thời gian thực!`);
  console.log('================================================================');

  // Khởi động vòng lặp kiểm tra lịch nhắc nhở đăng video tự động (Mỗi 60s)
  setInterval(async () => {
    try {
      const now = new Date();
      const currentH = String(now.getHours()).padStart(2, '0');
      const currentM = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentH}:${currentM}`;

      const matchedSchedules = db.prepare(`
        SELECT s.*, a.account_name, a.username as account_username, u.username as assigned_username
        FROM content_schedules s
        JOIN accounts a ON s.account_id = a.id
        LEFT JOIN users u ON s.assigned_user_id = u.id
        WHERE s.status = 'pending' AND s.scheduled_time = ?
      `).all(currentTimeStr);

      for (const sched of matchedSchedules) {
        console.log(`⏰ [ALARM] Tới giờ đăng video [${sched.video_title}] cho kênh [${sched.account_name || sched.account_username}]!`);
        await sendVideoPostingAlert(sched);
      }
    } catch (e) {
      // Bỏ qua lỗi ngầm nếu DB đang bận
    }
  }, 60 * 1000);
});

// Tự động thu dọn tài nguyên khi đóng server
async function handleShutdown() {
  console.log('\n🛑 Đang tắt máy chủ an toàn, đóng toàn bộ Chromium Profiles...');
  await closeAllProfiles();
  server.close(() => {
    console.log('✅ Máy chủ đã dừng hoạt động.');
    process.exit(0);
  });
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { DB_PATH, PROFILES_DIR, UPLOADS_DIR } = require('./constants');

// Đảm bảo thư mục lưu trữ dữ liệu tồn tại
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(PROFILES_DIR)) {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Tối ưu hóa hiệu năng SQLite: WAL mode & bật Foreign Keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Khởi tạo các bảng theo kiến trúc RBAC & Audit Logging
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'user')) DEFAULT 'user',
    status TEXT CHECK(status IN ('active', 'locked')) DEFAULT 'active',
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT,
    platform TEXT NOT NULL,
    login_url TEXT,
    account_name TEXT,
    username TEXT NOT NULL,
    password_encrypted TEXT,
    totp_secret_encrypted TEXT,
    proxy_protocol TEXT DEFAULT 'http',
    proxy_host TEXT,
    proxy_port INTEGER,
    proxy_user TEXT,
    proxy_pass_encrypted TEXT,
    last_ip TEXT,
    last_country TEXT,
    last_country_code TEXT,
    proxy_latency INTEGER,
    user_agent TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS user_account_permissions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    can_view INTEGER DEFAULT 1,
    can_launch INTEGER DEFAULT 1,
    can_reveal_password INTEGER DEFAULT 0,
    granted_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, account_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS content_schedules (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    assigned_user_id TEXT,
    video_title TEXT NOT NULL,
    platform TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,               -- Giờ đăng trong ngày (VD: '11:30', '19:45')
    scheduled_date TEXT,                       -- Ngày cụ thể nếu không phải lặp lại hàng ngày (YYYY-MM-DD)
    frequency TEXT DEFAULT 'daily',            -- 'daily', 'once', 'weekdays'
    status TEXT DEFAULT 'pending',             -- 'pending', 'posted', 'missed'
    posted_at DATETIME,
    posted_url TEXT,                           -- Link video sau khi đăng
    caption TEXT,                              -- Caption bài đăng
    hashtags TEXT,                             -- Bộ hashtag chuẩn SEO
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY(assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS proxy_providers (
    id TEXT PRIMARY KEY,
    provider_name TEXT NOT NULL,
    provider_type TEXT NOT NULL,
    api_key TEXT NOT NULL,
    api_url TEXT,
    last_check_status TEXT,
    current_proxy TEXT,
    country_code TEXT,
    timeout_seconds INTEGER,
    expires_at DATETIME,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vault_assets (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    title TEXT,
    content_text TEXT,
    file_path TEXT NOT NULL,
    associated_account_id TEXT,
    associated_schedule_id TEXT,
    owner_user_id TEXT,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(associated_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    FOREIGN KEY(associated_schedule_id) REFERENCES content_schedules(id) ON DELETE SET NULL,
    FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS social_vault (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT,
    platform TEXT NOT NULL,
    label TEXT NOT NULL,
    username TEXT NOT NULL,
    password_encrypted TEXT,
    totp_secret_encrypted TEXT,
    recovery_phone TEXT,
    recovery_email TEXT,
    backup_codes_encrypted TEXT,
    profile_url TEXT,
    notes TEXT,
    is_pinned INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL
  );
`);

// Migration an toàn bổ sung cột nếu bảng đã tồn tại từ trước
try {
  db.exec('ALTER TABLE accounts ADD COLUMN last_country_code TEXT');
} catch (e) {
  // Cột đã tồn tại
}

try {
  db.exec(`ALTER TABLE users ADD COLUMN allowed_tabs TEXT DEFAULT '["tab-accounts"]'`);
} catch (e) {
  // Cột đã tồn tại
}

try {
  db.exec('ALTER TABLE proxy_providers ADD COLUMN owner_user_id TEXT');
} catch (e) {
  // Cột đã tồn tại
}

// Tự động đồng bộ Super Admin chỉ huy tối cao: TX (và xóa bỏ tài khoản admin mặc định cũ)
const txUser = db.prepare("SELECT * FROM users WHERE username = 'TX'").get();
const legacyAdmin = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
const txPasswordHash = bcrypt.hashSync('123qweqwerr', bcrypt.genSaltSync(10));

if (!txUser) {
  if (legacyAdmin) {
    db.prepare(`
      UPDATE users
      SET username = 'TX',
          password_hash = ?,
          role = 'admin',
          status = 'active',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(txPasswordHash, legacyAdmin.id);
  } else {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at)
      VALUES (?, 'TX', ?, 'admin', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(uuidv4(), txPasswordHash);
  }
} else {
  // Đảm bảo tài khoản TX luôn giữ quyền admin active và mật khẩu chuẩn của Đại Ca
  if (!bcrypt.compareSync('123qweqwerr', txUser.password_hash) || txUser.role !== 'admin' || txUser.status !== 'active') {
    db.prepare(`
      UPDATE users
      SET password_hash = ?,
          role = 'admin',
          status = 'active',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(txPasswordHash, txUser.id);
  }
  if (legacyAdmin) {
    db.prepare("DELETE FROM users WHERE username = 'admin'").run();
  }
}

module.exports = db;

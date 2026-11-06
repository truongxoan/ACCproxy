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

  CREATE TABLE IF NOT EXISTS rented_accounts (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT,
    service TEXT NOT NULL DEFAULT 'grok',
    label TEXT,
    username TEXT NOT NULL,
    password_encrypted TEXT,
    totp_secret_encrypted TEXT,
    seller TEXT,
    price REAL,
    currency TEXT DEFAULT 'VND',
    rental_days INTEGER DEFAULT 7,
    rented_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    status TEXT CHECK(status IN ('active', 'expired', 'returned')) DEFAULT 'active',
    notes TEXT,
    is_pinned INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_rented_owner ON rented_accounts(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_rented_expires ON rented_accounts(expires_at);

  CREATE TABLE IF NOT EXISTS shop_products (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail TEXT,
    in_stock INTEGER DEFAULT 0,
    synced_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS shop_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    price_vnd_original REAL,
    price_vnd REAL,
    price_usd REAL,
    available_quantity INTEGER,
    in_stock INTEGER DEFAULT 0,
    manual_upgrade INTEGER DEFAULT 0,
    FOREIGN KEY(product_id) REFERENCES shop_products(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_shop_variant_product ON shop_variants(product_id);

  CREATE TABLE IF NOT EXISTS shop_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    variant_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_title TEXT,
    variant_title TEXT,
    quantity INTEGER DEFAULT 1,
    unit_price_vnd REAL,
    total_vnd REAL,
    cost_vnd_original REAL,
    currency TEXT DEFAULT 'VND',
    status TEXT CHECK(status IN ('pending_payment', 'paid', 'delivered', 'cancelled', 'failed')) DEFAULT 'pending_payment',
    payment_ref TEXT,
    upgrade_account TEXT,
    roboticvn_order_id TEXT,
    roboticvn_display_id INTEGER,
    delivery_encrypted TEXT,
    failure_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_shop_orders_user ON shop_orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON shop_orders(status);

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

for (const col of [
  "ALTER TABLE users ADD COLUMN email TEXT",
  "ALTER TABLE users ADD COLUMN google_id TEXT",
  "ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'",
  "ALTER TABLE users ADD COLUMN avatar_url TEXT"
]) {
  try { db.exec(col); } catch (e) { /* Cột đã tồn tại */ }
}
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL'); } catch (e) {}
try { db.exec('ALTER TABLE shop_orders ADD COLUMN transfer_content TEXT'); } catch (e) { /* Cột đã tồn tại */ }
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google ON users(google_id) WHERE google_id IS NOT NULL'); } catch (e) {}

// Super Admin TX: seed 1 lần duy nhất khi chưa có.
// - Mật khẩu mặc định của admin được lưu DƯỚI DẠNG BCRYPT HASH (không có plaintext trong code).
// - Đổi mật khẩu bằng biến môi trường ADMIN_PASSWORD (ưu tiên cao nhất, chỉ dùng lúc seed/chuyển đổi tài khoản cũ).
// - Đã BỎ cơ chế tự reset mật khẩu mỗi lần khởi động: admin đổi mật khẩu trong mục Quản Trị thì sẽ giữ nguyên.
const ADMIN_PASSWORD_HASH = '$2a$10$AZMBXcgR8PdDE2ybkCAUcOaABAckd3M0xI5mO.NrvO.TxuafrEl7O';
const txUser = db.prepare("SELECT * FROM users WHERE username = 'TX'").get();
const legacyAdmin = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
const envAdminHash = process.env.ADMIN_PASSWORD
  ? bcrypt.hashSync(process.env.ADMIN_PASSWORD, bcrypt.genSaltSync(10))
  : null;
const seedAdminHash = envAdminHash || ADMIN_PASSWORD_HASH;

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
    `).run(envAdminHash || legacyAdmin.password_hash, legacyAdmin.id);
  } else {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, status, allowed_tabs, created_at, updated_at)
      VALUES (?, 'TX', ?, 'admin', 'active', '["tab-accounts","tab-schedules","tab-assets","tab-piik","tab-tools","tab-social-vault","tab-rentals","tab-shop","tab-phone","tab-knowledge","tab-admin"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(uuidv4(), seedAdminHash);
  }
} else {
  // Chỉ sửa role/status nếu bị sai; KHÔNG đụng tới password_hash đã đặt.
  if (txUser.role !== 'admin' || txUser.status !== 'active') {
    db.prepare(`
      UPDATE users SET role = 'admin', status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(txUser.id);
  }
  if (legacyAdmin) {
    db.prepare("DELETE FROM users WHERE username = 'admin'").run();
  }
}

module.exports = db;

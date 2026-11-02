const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  DB_PATH: path.join(process.cwd(), 'data', 'accounts.db'),
  UPLOADS_DIR: path.join(process.cwd(), 'data', 'uploads'),
  PROFILES_DIR: path.join(process.cwd(), 'profiles'),
  MASTER_KEY: process.env.MASTER_ENCRYPTION_KEY || 'd7a31f9b8c2e4a6f1d5e7b9c3a2f8e1d4b6c8a2e5f7d9b1c3a5f8e2d4b6c8a1f',
  JWT_SECRET: process.env.JWT_SECRET || 'super_secret_jwt_key_default_1234567890_antigravity',
  AUTO_LOCK_MINUTES: parseInt(process.env.AUTO_LOCK_MINUTES, 10) || 5,
  CLIPBOARD_WIPE_SECONDS: parseInt(process.env.CLIPBOARD_WIPE_SECONDS, 10) || 15,
  ROLES: {
    ADMIN: 'admin',
    USER: 'user'
  },
  PLATFORMS: [
    'facebook',
    'google',
    'tiktok',
    'x',
    'github',
    'amazon',
    'custom'
  ]
};

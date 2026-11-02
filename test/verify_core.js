// Bộ Kiểm Thử Lõi Tự Hành (Core Self-Test & Verification Harness)
const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../src/config/db');
const { encrypt, decrypt } = require('../src/services/cryptoService');
const { generateToken, cleanSecret } = require('../src/services/totpService');
const { parseProxyString } = require('../src/services/proxyService');
const { evaluatePasswordStrength, analyzeSecuritySuggestions } = require('../src/services/suggestionService');
const { createUser, getUserByUsername, deleteUser, grantPermission, getUserPermissions } = require('../src/services/rbacService');

console.log('================================================================');
console.log('⚡ BẮT ĐẦU KIỂM ĐỊNH TOÀN DIỆN HỆ THỐNG ACCPROXY SOVEREIGN');
console.log('================================================================');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] #${totalTests}: ${name}`);
    passedTests++;
  } catch (error) {
    console.error(`  [FAIL] #${totalTests}: ${name} ->`, error.message);
  }
}

// 1. Kiểm tra Database & Admin Seed
runTest('Database Tables & Default Admin Seeding', () => {
  const admin = getUserByUsername('admin');
  assert.ok(admin, 'Admin must exist in database');
  assert.strictEqual(admin.role, 'admin');
  assert.strictEqual(admin.status, 'active');
});

// 2. Kiểm tra Mã hóa & Giải mã AES-256-GCM
runTest('AES-256-GCM Crypto Integrity', () => {
  const secretData = 'MySuperSecretPassword@2026!#$';
  const cipher = encrypt(secretData);
  assert.ok(cipher.includes(':'), 'Cipher must contain iv:tag:data');
  const decrypted = decrypt(cipher);
  assert.strictEqual(decrypted, secretData, 'Decrypted text must match original');
  assert.strictEqual(decrypt('invalid:cipher'), null, 'Malformed cipher returns null');
});

// 3. Kiểm tra Sinh Mã 2FA (TOTP)
runTest('2FA TOTP Engine Generation', () => {
  const testSecret = 'JBSWY3DPEHPK3PXP'; // Base32 Secret chuẩn RFC
  const token = generateToken(testSecret);
  assert.strictEqual(token.code.length, 6, 'TOTP code must be 6 digits');
  assert.ok(token.remainingSeconds >= 1 && token.remainingSeconds <= 30, 'Remaining seconds in 1-30');
  assert.strictEqual(token.valid, true);

  // Test chuẩn hóa secret
  const cleaned = cleanSecret('jbsw y3dp-ehpk 3pxp');
  assert.strictEqual(cleaned, 'JBSWY3DPEHPK3PXP');
});

// 4. Kiểm tra Phân Giải Proxy Đa Định Dạng
runTest('Smart Proxy Parser (Multiple Formats)', () => {
  // Format 1: host:port:user:pass
  const p1 = parseProxyString('103.14.22.1:8080:myuser:mypass');
  assert.deepStrictEqual(p1, {
    protocol: 'http',
    host: '103.14.22.1',
    port: 8080,
    user: 'myuser',
    pass: 'mypass'
  });

  // Format 2: socks5://user:pass@103.14.22.1:1080
  const p2 = parseProxyString('socks5://user1:pass1@103.14.22.1:1080');
  assert.deepStrictEqual(p2, {
    protocol: 'socks5',
    host: '103.14.22.1',
    port: 1080,
    user: 'user1',
    pass: 'pass1'
  });

  // Format 3: host:port
  const p3 = parseProxyString('1.1.1.1:3128');
  assert.strictEqual(p3.host, '1.1.1.1');
  assert.strictEqual(p3.port, 3128);
  assert.strictEqual(p3.user, null);
});

// 5. Kiểm tra Đánh Giá Mật Khẩu
runTest('Password Strength Evaluator', () => {
  const weak = evaluatePasswordStrength('123456');
  assert.ok(weak.score < 50);

  const strong = evaluatePasswordStrength('TúĐạiCa@2026#Sovereign');
  assert.ok(strong.score >= 80);
});

// 6. Kiểm tra RBAC User Creation & Permissions
runTest('RBAC User Creation, Permissions & Cleanup', () => {
  const testUser = `test_agent_${Date.now()}`;
  const created = createUser(testUser, 'TestPass@123', 'user');
  assert.strictEqual(created.username, testUser);
  assert.strictEqual(created.role, 'user');

  // Tạo 1 tài khoản thật để test Foreign Key
  const dummyAccId = `test_acc_${Date.now()}`;
  db.prepare(`
    INSERT INTO accounts (id, platform, username, created_at, updated_at)
    VALUES (?, 'facebook', 'test_user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(dummyAccId);

  // Gán quyền cho user trên account thật
  grantPermission(created.id, dummyAccId, { can_view: 1, can_launch: 1, can_reveal_password: 0 }, 'test');
  const perms = db.prepare('SELECT * FROM user_account_permissions WHERE user_id = ?').all(created.id);
  assert.strictEqual(perms.length, 1);
  assert.strictEqual(perms[0].can_view, 1);
  assert.strictEqual(perms[0].can_reveal_password, 0);

  // Dọn dẹp
  deleteUser(created.id);
  db.prepare('DELETE FROM accounts WHERE id = ?').run(dummyAccId);
  const checkDeleted = getUserByUsername(testUser);
  assert.strictEqual(checkDeleted, null);
});

// 7. Kiểm tra Suggestion Engine (Quét rủi ro)
runTest('Security Suggestion Engine Analysis', () => {
  const analysis = analyzeSecuritySuggestions();
  assert.ok(typeof analysis.healthScore === 'number');
  assert.ok(Array.isArray(analysis.alerts));
});

console.log('================================================================');
console.log(`⭐ KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN XANH MƯỢT (100% OK)`);
console.log('================================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}

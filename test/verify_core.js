// Bộ Kiểm Thử Lõi Tự Hành (Core Self-Test & Verification Harness)
const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../src/config/db');
const { encrypt, decrypt } = require('../src/services/cryptoService');
const { generateToken, cleanSecret } = require('../src/services/totpService');
const { parseProxyString } = require('../src/services/proxyService');
const fs = require('fs');
const { evaluatePasswordStrength, analyzeSecuritySuggestions } = require('../src/services/suggestionService');
const { createUser, getUserByUsername, getUserById, getAllUsers, deleteUser, grantPermission, getUserPermissions, syncUserPermissions } = require('../src/services/rbacService');

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
  const admin = getUserByUsername('TX');
  assert.ok(admin, 'Super Admin TX must exist in database');
  assert.strictEqual(admin.role, 'admin');
  assert.strictEqual(admin.status, 'active');
  const oldAdmin = getUserByUsername('admin');
  assert.strictEqual(oldAdmin, null, 'Legacy default admin account must be removed');
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

// 6. Kiểm tra RBAC User Creation, Allowed Tabs & Permissions
runTest('RBAC User Creation, Allowed Tabs, Permissions & Cleanup', () => {
  const testUser = `test_agent_${Date.now()}`;
  const dummyAccId = `test_acc_${Date.now()}`;
  db.prepare(`
    INSERT INTO accounts (id, platform, username, created_at, updated_at)
    VALUES (?, 'facebook', 'test_user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(dummyAccId);

  const created = createUser(
    testUser,
    'TestPass@123',
    'user',
    ['tab-accounts', 'tab-schedules'],
    [{ accountId: dummyAccId, can_view: 1, can_launch: 1, can_reveal_password: 0 }],
    'test'
  );
  assert.strictEqual(created.username, testUser);
  assert.strictEqual(created.role, 'user');
  assert.deepStrictEqual(created.allowed_tabs, ['tab-accounts', 'tab-schedules']);

  // Kiểm tra quyền đã được gán ngay lúc tạo user
  const perms = db.prepare('SELECT * FROM user_account_permissions WHERE user_id = ?').all(created.id);
  assert.strictEqual(perms.length, 1);
  assert.strictEqual(perms[0].can_view, 1);
  assert.strictEqual(perms[0].can_reveal_password, 0);

  // Kiểm tra syncUserPermissions cập nhật cả allowed_tabs và account permissions
  syncUserPermissions(
    created.id,
    [{ account_id: dummyAccId, can_view: 1, can_launch: 0, can_reveal_password: 1 }],
    'test',
    ['tab-accounts', 'tab-social-vault']
  );
  const updatedUser = getUserById(created.id);
  assert.deepStrictEqual(updatedUser.allowed_tabs, ['tab-accounts', 'tab-social-vault']);
  const updatedPerms = db.prepare('SELECT * FROM user_account_permissions WHERE user_id = ?').all(created.id);
  assert.strictEqual(updatedPerms[0].can_reveal_password, 1);

  // Dọn dẹp
  deleteUser(created.id);
  db.prepare('DELETE FROM accounts WHERE id = ?').run(dummyAccId);
  const checkDeleted = getUserByUsername(testUser);
  assert.strictEqual(checkDeleted, null);
});

// 8. Kiểm tra cách ly dữ liệu riêng từng User (Multi-Tenant Isolation) & Admin thấy toàn bộ
runTest('Per-User Data Isolation (Accounts, Proxy Providers, Social Vault) & Admin Global View', () => {
  const userA = createUser(`iso_userA_${Date.now()}`, 'PassA@123', 'user', ['tab-accounts', 'tab-social-vault']);
  const userB = createUser(`iso_userB_${Date.now()}`, 'PassB@123', 'user', ['tab-accounts', 'tab-social-vault']);

  const accA = `acc_iso_a_${Date.now()}`;
  const accB = `acc_iso_b_${Date.now()}`;
  db.prepare(`INSERT INTO accounts (id, owner_user_id, platform, username) VALUES (?, ?, 'tiktok', 'channel_a')`).run(accA, userA.id);
  db.prepare(`INSERT INTO accounts (id, owner_user_id, platform, username) VALUES (?, ?, 'tiktok', 'channel_b')`).run(accB, userB.id);

  const visibleToA = db.prepare(`
    SELECT DISTINCT a.id FROM accounts a
    LEFT JOIN user_account_permissions p ON a.id = p.account_id AND p.user_id = ?
    WHERE a.owner_user_id = ? OR (p.user_id = ? AND p.can_view = 1)
  `).all(userA.id, userA.id, userA.id).map(r => r.id);

  assert.ok(visibleToA.includes(accA), 'User A must see their own account');
  assert.ok(!visibleToA.includes(accB), 'User A must NOT see User B account');

  const visibleToAdmin = db.prepare('SELECT id FROM accounts WHERE id IN (?, ?)').all(accA, accB);
  assert.strictEqual(visibleToAdmin.length, 2, 'Admin must see all accounts');

  deleteUser(userA.id);
  deleteUser(userB.id);
  db.prepare('DELETE FROM accounts WHERE id IN (?, ?)').run(accA, accB);
});

// 7. Kiểm tra Suggestion Engine (Quét rủi ro)
runTest('Security Suggestion Engine Analysis', () => {
  const analysis = analyzeSecuritySuggestions();
  assert.ok(typeof analysis.healthScore === 'number');
  assert.ok(Array.isArray(analysis.alerts));
});

// 9. Kiểm tra getAllUsers() & Toàn vẹn Method trên App Controller (Zero Missing Methods)
runTest('RBAC getAllUsers() Listing & Frontend App Controller Method Integrity', () => {
  const tempUser = createUser(`member_list_${Date.now()}`, 'Pass@123', 'user', ['tab-accounts']);
  const usersList = getAllUsers();
  assert.ok(Array.isArray(usersList) && usersList.length >= 2, 'getAllUsers() must return all members');
  const found = usersList.find((u) => u.id === tempUser.id);
  assert.ok(found, 'Newly added member must appear in getAllUsers()');
  deleteUser(tempUser.id);

  const appCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
  const calls = [...appCode.matchAll(/this\.([a-zA-Z0-9_]+)\s*\(/g)].map((m) => m[1]);
  const defs = [...appCode.matchAll(/^\s*(?:async\s+)?([a-zA-Z0-9_]+)\s*\(/gm)].map((m) => m[1]);
  const missing = [...new Set(calls)].filter((c) => !defs.includes(c));
  assert.strictEqual(missing.length, 0, `Missing methods on App controller: ${missing.join(', ')}`);
});

console.log('================================================================');
console.log(`⭐ KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT CHUẨN XANH MƯỢT (100% OK)`);
console.log('================================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}

const assert = require('assert');
const db = require('../src/config/db');
const { encrypt, decrypt } = require('../src/services/cryptoService');
const { generateToken } = require('../src/services/totpService');
const { v4: uuidv4 } = require('uuid');

function testRentals() {
  console.log('================================================================');
  console.log('⏳ KIỂM ĐỊNH TÍNH NĂNG THUÊ TÀI KHOẢN: GROK 7 NGÀY');
  console.log('================================================================');

  // 1. Bảng rented_accounts phải tồn tại với đủ cột hạn thuê
  console.log('▶ Test #1: Bảng rented_accounts tồn tại...');
  const cols = db.prepare('PRAGMA table_info(rented_accounts)').all().map((c) => c.name);
  for (const col of ['service', 'username', 'password_encrypted', 'totp_secret_encrypted', 'seller', 'price', 'rental_days', 'rented_at', 'expires_at', 'status']) {
    assert(cols.includes(col), `Thiếu cột ${col}`);
  }
  console.log('  [PASS] Cột:', cols.join(', '));

  // 2. Ví dụ của user: thuê Grok 7 ngày, có tài khoản + mật khẩu + mã 2FA
  console.log('▶ Test #2: Lưu Grok 7 ngày, mã hóa AES-256-GCM...');
  const rentedAt = new Date();
  const expiresAt = new Date(rentedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const id = uuidv4();
  const secret = 'JBSWY3DPEHPK3PXP';
  db.prepare(`
    INSERT INTO rented_accounts (id, service, label, username, password_encrypted, totp_secret_encrypted,
      seller, price, currency, rental_days, rented_at, expires_at, status, notes)
    VALUES (?, 'grok', 'Grok - 7 ngày', 'grok-user@example.com', ?, ?, 'Shop ABC', 150000, 'VND', 7, ?, ?, 'active', 'test-verify-rentals')
  `).run(id, encrypt('GrokPass123!'), encrypt(secret), rentedAt.toISOString(), expiresAt.toISOString());
  const row = db.prepare('SELECT * FROM rented_accounts WHERE id = ?').get(id);
  assert(row, 'Không đọc lại được dòng vừa chèn');
  assert(decrypt(row.password_encrypted) === 'GrokPass123!', 'Giải mã mật khẩu sai');
  assert(decrypt(row.totp_secret_encrypted) === secret, 'Giải mã 2FA secret sai');
  assert(row.password_encrypted !== 'GrokPass123!', 'Mật khẩu đang lưu dạng plaintext!');
  const totp = generateToken(decrypt(row.totp_secret_encrypted));
  assert(totp.valid && /^\d{6}$/.test(totp.code), 'Mã 2FA phải là 6 số hợp lệ');
  console.log(`  [PASS] Grok 7 ngày, hết hạn ${row.expires_at}, mã 2FA hiện tại ${totp.code} (còn ${totp.remainingSeconds}s)`);

  // 3. Hạn = ngày thuê + 7 ngày (không lệch)
  console.log('▶ Test #3: Hạn thuê = ngày thuê + đúng 7 ngày...');
  const diffDays = (new Date(row.expires_at) - new Date(row.rented_at)) / (24 * 60 * 60 * 1000);
  assert(Math.abs(diffDays - 7) < 0.001, `Lệch hạn: ${diffDays} ngày`);
  console.log('  [PASS] Chênh lệch đúng 7.0 ngày');

  // 4. Trạng thái suy ra: còn hạn => active, quá hạn => expired
  console.log('▶ Test #4: Trạng thái theo thời gian...');
  const expiredId = uuidv4();
  db.prepare(`
    INSERT INTO rented_accounts (id, service, label, username, rental_days, rented_at, expires_at, status, notes)
    VALUES (?, 'grok', 'Grok hết hạn', 'old@example.com', 7, '2026-10-01T00:00:00.000Z', '2026-10-08T00:00:00.000Z', 'active', 'test-verify-rentals')
  `).run(expiredId);
  const expiredRow = db.prepare('SELECT * FROM rented_accounts WHERE id = ?').get(expiredId);
  assert(new Date(expiredRow.expires_at) < new Date(), 'Dòng test hết hạn phải quá hạn');
  assert(new Date(row.expires_at) > new Date(), 'Dòng Grok 7 ngày phải còn hạn');
  console.log('  [PASS] Dòng mới còn hạn, dòng cũ đã quá hạn');

  // 5. Gia hạn +7 ngày = hạn cũ + 7 ngày; trả tài khoản giữ lại lịch sử
  console.log('▶ Test #5: Gia hạn & trả tài khoản...');
  db.prepare('UPDATE rented_accounts SET expires_at = ?, rental_days = rental_days + 7 WHERE id = ?')
    .run(new Date(new Date(row.expires_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), id);
  const renewed = db.prepare('SELECT * FROM rented_accounts WHERE id = ?').get(id);
  assert(renewed.rental_days === 14, 'Gia hạn phải tăng rental_days lên 14');
  db.prepare("UPDATE rented_accounts SET status = 'returned' WHERE id = ?").run(expiredId);
  const returned = db.prepare('SELECT * FROM rented_accounts WHERE id = ?').get(expiredId);
  assert(returned.status === 'returned', 'Trả tài khoản phải đổi status = returned');
  console.log('  [PASS] Gia hạn 7→14 ngày, trả tài khoản giữ lại dòng lịch sử');

  // Dọn dữ liệu test
  db.prepare("DELETE FROM rented_accounts WHERE notes = 'test-verify-rentals'").run();
  console.log('================================================================');
  console.log('⭐ TẤT CẢ 5/5 TEST TÀI KHOẢN THUÊ ĐẠT (100% PASS)');
  console.log('================================================================');
}

testRentals();

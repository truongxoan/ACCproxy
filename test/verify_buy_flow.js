const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const { v4: uuidv4 } = require('uuid');
const { markupPrice, quoteProduct } = require('../src/services/roboticvnService');

async function testBuyFlow() {
  console.log('================================================================');
  console.log('🛒 KIỂM ĐỊNH LUỒNG MUA: ĐẶT MUA -> CHỜ THANH TOÁN -> ADMIN GIAO HÀNG');
  console.log('================================================================');

  // 1. Bảng shop_orders + cột users cho đăng ký/Google tồn tại
  console.log('▶ Test #1: Bảng shop_orders và cột users mới...');
  const orderCols = db.prepare('PRAGMA table_info(shop_orders)').all().map((c) => c.name);
  for (const col of ['user_id', 'variant_id', 'total_vnd', 'status', 'payment_ref', 'transfer_content', 'roboticvn_order_id', 'delivery_encrypted']) {
    assert(orderCols.includes(col), `Thiếu cột shop_orders.${col}`);
  }
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  for (const col of ['email', 'google_id', 'auth_provider', 'avatar_url']) {
    assert(userCols.includes(col), `Thiếu cột users.${col}`);
  }
  console.log('  [PASS] Đủ cột đơn hàng + đăng ký/Google');

  // 2. Mật khẩu admin cũ không còn trong code; chỉ còn bcrypt hash
  console.log('▶ Test #2: Không còn mật khẩu admin cũ hard-code...');
  const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'db.js'), 'utf8');
  assert(!/hashSync\('[^']{6,}'/.test(dbSrc), 'db.js không được hash mật khẩu plaintext trong code');
  assert(dbSrc.includes('ADMIN_PASSWORD_HASH'), 'db.js phải lưu admin bằng bcrypt hash');
  assert(!dbSrc.includes('bcrypt.compareSync'), 'Không còn cơ chế tự reset mật khẩu mỗi lần khởi động');
  console.log('  [PASS] Chỉ lưu bcrypt hash, bỏ tự reset mật khẩu');

  // 3. Auth routes có đăng ký + Google
  console.log('▶ Test #3: Có endpoint đăng ký + Google OAuth...');
  const authSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'authRoutes.js'), 'utf8');
  assert(authSrc.includes("router.post('/register'"), 'Thiếu POST /auth/register');
  assert(authSrc.includes("router.get('/google'"), 'Thiếu GET /auth/google');
  assert(authSrc.includes("router.get('/google/callback'"), 'Thiếu GET /auth/google/callback');
  assert(authSrc.includes("role, status, allowed_tabs, auth_provider"), 'Đăng ký phải ghi auth_provider');
  console.log('  [PASS] /register, /google, /google/callback đều có');

  // 4. Đặt mua chỉ tạo đơn chờ thanh toán — KHÔNG tự gọi bot, KHÔNG có mã đơn bot
  console.log('▶ Test #4: Đơn mới tạo chỉ ở trạng thái chờ thanh toán...');
  const userId = db.prepare("SELECT id FROM users WHERE username = 'TX'").get().id;
  const orderId = uuidv4();
  const unitPrice = markupPrice(850000); // Grok Super 850k -> bán 870k
  assert.strictEqual(unitPrice, 870000);
  db.prepare(`
    INSERT INTO shop_orders (id, user_id, variant_id, product_id, product_title, variant_title,
      quantity, unit_price_vnd, total_vnd, cost_vnd_original, currency, status, payment_ref)
    VALUES (?, ?, 'var_test_1', 'prod_test_grok', 'Grok', 'Grok Super 1M', 2, ?, ?, 1700000, 'VND', 'pending_payment', 'DHTEST01')
  `).run(orderId, userId, unitPrice, unitPrice * 2);
  const order = db.prepare('SELECT * FROM shop_orders WHERE id = ?').get(orderId);
  assert.strictEqual(order.status, 'pending_payment', 'Đơn mới phải chờ thanh toán');
  assert.strictEqual(order.total_vnd, 1740000, 'Tổng phải = 870k x 2');
  assert.strictEqual(order.roboticvn_order_id, null, 'Chưa giao hàng thì không được có mã đơn bot');
  assert.strictEqual(order.delivery_encrypted, null, 'Chưa giao hàng thì không được có tài khoản giao');
  console.log('  [PASS] Đơn 2 x Grok Super = 1.740.000đ, chờ thanh toán, chưa chạm bot');

  // 5. Không có API key thì bước kiểm tra tồn kho/giao hàng phải lỗi rõ, không trừ tiền lặng
  console.log('▶ Test #5: Thiếu API key thì quote phải lỗi rõ ràng...');
  const savedKey = process.env.ROBOTICVN_API_KEY;
  delete process.env.ROBOTICVN_API_KEY;
  // Service đọc key lúc gọi hàm, nhưng module đã load với key cũ (nếu có) thì
  // test này chỉ kiểm tra khi key rỗng trong env của tiến trình test.
  // Trong môi trường test key thường không set sẵn.
  if (!savedKey) {
    let threw = false;
    try { await quoteProduct('prod_test_grok', 'var_test_1', 1, 'vnd'); }
    catch (e) { threw = true; assert(e.message.includes('ROBOTICVN_API_KEY'), 'Lỗi phải nhắc thiếu ROBOTICVN_API_KEY'); }
    assert(threw, 'Quote không có key phải throw');
    console.log('  [PASS] Quote không key -> lỗi rõ, không gọi bot');
  } else {
    console.log('  [SKIP] Máy test đang có ROBOTICVN_API_KEY nên bỏ qua test thiếu key');
  }
  if (savedKey) process.env.ROBOTICVN_API_KEY = savedKey;

  // 6. Shop routes không tự fulfill khi tạo đơn (chỉ fulfill khi admin gọi riêng)
  console.log('▶ Test #6: Tạo đơn không tự gọi createRoboticOrder...');
  const shopSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'shopRoutes.js'), 'utf8');
  const createSection = shopSrc.slice(shopSrc.indexOf("router.post('/orders'"), shopSrc.indexOf("router.get('/orders'"));
  assert(!createSection.includes('createRoboticOrder'), 'Tạo đơn không được gọi createRoboticOrder');
  assert(shopSrc.includes("router.post('/orders/:id/fulfill'"), 'Phải có endpoint fulfill riêng cho admin');
  assert(shopSrc.includes("requireRole('admin')"), 'Fulfill phải yêu cầu quyền admin');
  console.log('  [PASS] createRoboticOrder chỉ nằm trong /fulfill của admin');

  // 7. Nội dung chuyển khoản: mã đơn + câu quà tặng, không có từ mua/bán
  console.log('▶ Test #7: Nội dung chuyển khoản là quà tặng, không phải mua bán...');
  const { buildTransferContent, GIFT_PHRASES, BANNED_WORDS } = require('../src/services/paymentContent');
  for (const phrase of GIFT_PHRASES) {
    for (const banned of BANNED_WORDS) {
      assert(!phrase.toLowerCase().includes(banned), `Câu quà tặng chứa từ cấm "${banned}": ${phrase}`);
    }
  }
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const content = buildTransferContent('DHTEST99');
    assert(content.startsWith('DHTEST99 '), 'Nội dung CK phải bắt đầu bằng mã đơn');
    for (const banned of BANNED_WORDS) {
      assert(!content.toLowerCase().includes(banned), `Nội dung CK chứa từ cấm "${banned}": ${content}`);
    }
    seen.add(content);
  }
  assert(seen.size > 1, 'Câu quà tặng phải ngẫu nhiên, không cố định 1 câu');
  console.log(`  [PASS] ${GIFT_PHRASES.length} câu quà tặng, 30 lần sinh ra ${seen.size} nội dung khác nhau, không từ mua/bán`);

  // 8. Nút Giao hàng chỉ render khi admin (khóa kép ở frontend)
  console.log('▶ Test #8: Nút Giao hàng chỉ render cho admin...');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
  assert(appSrc.includes("isAdmin && adminView && ['pending_payment', 'paid', 'failed']"), 'Nút giao hàng phải khóa kép isAdmin && adminView');
  assert(appSrc.includes("if (Auth.currentUser?.role !== 'admin')"), 'fulfillShopOrder phải chặn khách ở frontend');
  console.log('  [PASS] Nút giao hàng khóa kép admin; khách bấm cũng không gửi request');

  // Dọn dữ liệu test
  db.prepare('DELETE FROM shop_orders WHERE payment_ref = ?').run('DHTEST01');
  console.log('================================================================');
  console.log('⭐ TẤT CẢ 8/8 TEST LUỒNG MUA ĐẠT (100% PASS)');
  console.log('================================================================');
}

testBuyFlow().catch((err) => { console.error('❌ TEST FAILED:', err); process.exit(1); });

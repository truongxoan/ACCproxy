const assert = require('assert');
const db = require('../src/config/db');
const { MARKUP_VND, markupPrice, syncToDb } = require('../src/services/roboticvnService');

function testShop() {
  console.log('================================================================');
  console.log('🛒 KIỂM ĐỊNH CỬA HÀNG ROBOTICVN: CHỈ HIỂN THỊ, GIÁ +20.000đ/GÓI');
  console.log('================================================================');

  // 1. Mức tăng giá đúng 20.000đ, áp cho từng gói
  console.log('▶ Test #1: Giá bán = giá gốc + 20.000đ...');
  assert.strictEqual(MARKUP_VND, 20000, 'Mức tăng phải là 20000');
  assert.strictEqual(markupPrice(850000), 870000, 'Grok Super 850k -> 870k');
  assert.strictEqual(markupPrice(90000), 110000, 'GPT Apple Pay 90k -> 110k');
  assert.strictEqual(markupPrice(5000), 25000, 'Gói 5k -> 25k');
  assert.strictEqual(markupPrice(null), null, 'Gói không có giá VND thì không cộng');
  assert.strictEqual(markupPrice(undefined), null, 'Gói không có giá VND thì không cộng');
  console.log('  [PASS] 850.000 -> 870.000, 90.000 -> 110.000, 5.000 -> 25.000, null -> null');

  // 2. Bảng shop tồn tại
  console.log('▶ Test #2: Bảng shop_products / shop_variants tồn tại...');
  const productCols = db.prepare('PRAGMA table_info(shop_products)').all().map((c) => c.name);
  const variantCols = db.prepare('PRAGMA table_info(shop_variants)').all().map((c) => c.name);
  for (const col of ['id', 'title', 'thumbnail', 'in_stock']) assert(productCols.includes(col), `Thiếu cột shop_products.${col}`);
  for (const col of ['product_id', 'price_vnd_original', 'price_vnd', 'available_quantity']) assert(variantCols.includes(col), `Thiếu cột shop_variants.${col}`);
  console.log('  [PASS] Đủ cột, có cột riêng giá gốc và giá bán');

  // 3. Đồng bộ snapshot: giá trong DB đã là giá +20k, giá gốc vẫn giữ để đối soát
  console.log('▶ Test #3: syncToDb lưu đúng giá đã tăng...');
  const sample = [
    {
      id: 'prod_test_grok', title: '🔥 Grok', description: 'test', thumbnail: null, in_stock: true,
      variants: [
        { id: 'var_test_1', title: 'Grok Super 1M', description: null, prices: { vnd: 850000, usd: 32.7 }, available_quantity: 10, in_stock: true, manual_upgrade: false },
        { id: 'var_test_2', title: 'Grok API 1D', description: null, prices: { usd: 1.23 }, available_quantity: 5, in_stock: true, manual_upgrade: false }
      ]
    }
  ];
  const result = syncToDb(db, sample);
  assert.strictEqual(result.products, 1, 'Phải lưu 1 sản phẩm');
  assert.strictEqual(result.variants, 2, 'Phải lưu 2 gói');
  const v1 = db.prepare('SELECT * FROM shop_variants WHERE id = ?').get('var_test_1');
  assert.strictEqual(v1.price_vnd_original, 850000, 'Giữ giá gốc 850k');
  assert.strictEqual(v1.price_vnd, 870000, 'Giá bán phải là 870k');
  const v2 = db.prepare('SELECT * FROM shop_variants WHERE id = ?').get('var_test_2');
  assert.strictEqual(v2.price_vnd, null, 'Gói chỉ có giá USD thì price_vnd null, không tự đổi tiền');
  assert.strictEqual(v2.price_usd, 1.23, 'Giữ nguyên giá USD');
  const lastSync = db.prepare("SELECT value FROM system_settings WHERE key = 'shop_last_sync'").get();
  assert(lastSync && lastSync.value, 'Phải ghi dấu thời gian đồng bộ');
  console.log(`  [PASS] Grok Super: gốc 850.000 -> bán 870.000; đồng bộ lúc ${lastSync.value}`);

  // 4. Đồng bộ lần 2 thay thế snapshot cũ (sản phẩm ngừng bán sẽ biến mất)
  console.log('▶ Test #4: Đồng bộ lại thay snapshot cũ...');
  syncToDb(db, []);
  assert.strictEqual(db.prepare('SELECT COUNT(*) as c FROM shop_products').get().c, 0, 'Snapshot cũ phải bị thay');
  assert.strictEqual(db.prepare('SELECT COUNT(*) as c FROM shop_variants').get().c, 0, 'Gói cũ phải bị thay');
  console.log('  [PASS] Snapshot cũ được thay bằng snapshot mới');

  // 5. Đồng bộ sản phẩm không tự đặt hàng / nạp ví; đặt hàng bot chỉ nằm
  //    trong /fulfill của admin (kiểm tra chi tiết ở verify_buy_flow.js).
  console.log('▶ Test #5: Đồng bộ không tự đặt hàng / nạp ví...');
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'routes', 'shopRoutes.js'), 'utf8');
  const syncSection = src.slice(src.indexOf("router.post('/sync'"), src.indexOf("router.post('/orders'"));
  assert(!syncSection.includes('createRoboticOrder'), 'Đồng bộ không được gọi createRoboticOrder');
  assert(!src.includes('topup'), 'shopRoutes không được nạp ví');
  assert(!src.includes('payment_method'), 'shopRoutes không được tự chọn phương thức thanh toán khi đồng bộ');
  console.log('  [PASS] Đồng bộ chỉ đọc sản phẩm; đặt hàng bot chỉ có trong /fulfill admin');

  console.log('================================================================');
  console.log('⭐ TẤT CẢ 5/5 TEST CỬA HÀNG ĐẠT (100% PASS)');
  console.log('================================================================');
}

testShop();

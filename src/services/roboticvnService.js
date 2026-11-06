/**
 * RoboticVN Customer API v2 — CHỈ ĐỌC, CHỈ HIỂN THỊ, KHÔNG THANH TOÁN.
 *
 * - Đọc danh sách + chi tiết sản phẩm từ https://api.roboticvn.com/api/v2
 * - Xác thực bằng header `x-api-key`, key lấy từ biến môi trường
 *   ROBOTICVN_API_KEY — KHÔNG hard-code key, KHÔNG lưu key vào DB/file,
 *   KHÔNG trả key ra API nào của web này.
 * - Giá bán hiển thị = giá gốc VND + 20.000đ / gói (SHOP_MARKUP_VND).
 *   Gói không có giá VND thì giữ nguyên giá USD (không cộng thêm).
 * - Đặt hàng (POST /orders) CHỈ được gọi từ bước "admin xác nhận đã nhận
 *   tiền & giao hàng" trong shopRoutes.js — không bao giờ tự động khi khách
 *   bấm Đặt mua. Khách bấm Đặt mua chỉ tạo đơn chờ thanh toán trong DB local.
 */
const { ProxyAgent } = require('undici');
const BASE_URL = process.env.ROBOTICVN_API_URL || 'https://api.roboticvn.com/api/v2';
const MARKUP_VND = parseInt(process.env.SHOP_MARKUP_VND, 10) || 20000;

// Môi trường chạy sau proxy egress (vd: sandbox này) cần đi qua proxy,
// còn máy người dùng chạy trực tiếp thì không có biến proxy -> fetch thẳng.
// Chỉ dùng URL proxy, không log hay trả nó ra ngoài.
let proxyDispatcher;
try {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (proxyUrl) proxyDispatcher = new ProxyAgent(proxyUrl);
} catch (e) {
  proxyDispatcher = undefined;
}

function getApiKey() {
  return process.env.ROBOTICVN_API_KEY || '';
}

function getProxyDispatcher() {
  return proxyDispatcher;
}

/** Giá bán trên web = giá gốc VND + 20.000đ. Gói không có giá VND -> null. */
function markupPrice(originalVnd) {
  if (originalVnd === null || originalVnd === undefined || originalVnd === '') return null;
  const n = Number(originalVnd);
  if (Number.isNaN(n)) return null;
  return n + MARKUP_VND;
}

async function apiGet(path) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Chưa cấu hình ROBOTICVN_API_KEY (biến môi trường). Không thể đồng bộ sản phẩm.');
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'x-api-key': apiKey, Accept: 'application/json', 'Accept-Language': 'vi-VN' },
    signal: AbortSignal.timeout(20000),
    ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {})
  });
  if (!res.ok) {
    let msg = `RoboticVN trả HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error?.message) msg = body.error.message;
    } catch (e) { /* giữ msg mặc định */ }
    throw new Error(msg);
  }
  const json = await res.json();
  // Hầu hết endpoint trả {data: ...}; riêng /delivery có thể trả thẳng object.
  return json.data !== undefined ? json.data : json;
}

async function apiPost(path, body) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Chưa cấu hình ROBOTICVN_API_KEY (biến môi trường).');
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Language': 'vi-VN' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
    ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {})
  });
  if (!res.ok) {
    let msg = `RoboticVN trả HTTP ${res.status}`;
    try {
      const bodyJson = await res.json();
      if (bodyJson?.error?.message) msg = bodyJson.error.message;
    } catch (e) { /* giữ msg mặc định */ }
    throw new Error(msg);
  }
  const json = await res.json();
  return json.data;
}

/** Báo giá + tồn kho thời gian thực cho 1 gói (chỉ đọc). */
async function quoteProduct(productId, variantId, quantity, currencyCode = 'vnd') {
  return apiPost(`/products/${encodeURIComponent(productId)}/quote`, {
    variant_id: variantId,
    quantity,
    currency_code: currencyCode
  });
}

/**
 * Tạo đơn bên RoboticVN, trả bằng số dư ví của shop.
 * CHỈ gọi sau khi admin xác nhận đã nhận tiền của khách. Trừ tiền ví thật.
 */
async function createRoboticOrder(items, currencyCode = 'vnd') {
  return apiPost('/orders', { items, currency_code: currencyCode, payment_method: 'wallet' });
}

async function getRoboticOrder(orderId) {
  return apiGet(`/orders/${encodeURIComponent(orderId)}?locale=vi-VN`);
}

/** Lấy tài khoản/mật khẩu đã giao cho 1 đơn (chỉ chủ đơn + admin được xem). */
async function getRoboticDelivery(orderId) {
  return apiGet(`/orders/${encodeURIComponent(orderId)}/delivery?locale=vi-VN`);
}

async function getWalletBalance() {
  return apiGet('/wallet/balance');
}

async function listProducts() {
  return apiGet('/products?limit=100&locale=vi-VN');
}

async function getProductDetail(productId) {
  return apiGet(`/products/${encodeURIComponent(productId)}?locale=vi-VN`);
}

/** Lấy toàn bộ sản phẩm + chi tiết từng gói, chạy song song tối đa 8 request. */
async function fetchAllProducts() {
  const summaries = await listProducts();
  const products = [];
  const CONCURRENCY = 8;
  for (let i = 0; i < summaries.length; i += CONCURRENCY) {
    const batch = summaries.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((s) => getProductDetail(s.id)));
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled' && r.value) products.push(r.value);
      else console.warn(`⚠️ [RoboticVN] Không lấy được chi tiết ${batch[j].title}:`, r.reason?.message || r.reason);
    }
  }
  return products;
}

/**
 * Đồng bộ snapshot sản phẩm vào SQLite: xóa snapshot cũ, chèn snapshot mới.
 * Trả về số lượng sản phẩm / gói đã lưu.
 */
function syncToDb(db, products) {
  const syncedAt = new Date().toISOString();
  let variantCount = 0;
  const run = db.transaction(() => {
    db.prepare('DELETE FROM shop_variants').run();
    db.prepare('DELETE FROM shop_products').run();
    const insertProduct = db.prepare(`
      INSERT INTO shop_products (id, title, description, thumbnail, in_stock, synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertVariant = db.prepare(`
      INSERT INTO shop_variants
        (id, product_id, title, description, price_vnd_original, price_vnd, price_usd,
         available_quantity, in_stock, manual_upgrade)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of products) {
      insertProduct.run(
        p.id, p.title || '', p.description || null, p.thumbnail || null,
        p.in_stock ? 1 : 0, syncedAt
      );
      for (const v of p.variants || []) {
        const prices = v.prices || {};
        const originalVnd = prices.vnd === undefined || prices.vnd === null ? null : Number(prices.vnd);
        insertVariant.run(
          v.id, p.id, v.title || '', v.description || null,
          originalVnd, markupPrice(originalVnd),
          prices.usd === undefined || prices.usd === null ? null : Number(prices.usd),
          v.available_quantity === undefined || v.available_quantity === null ? null : Number(v.available_quantity),
          v.in_stock ? 1 : 0, v.manual_upgrade ? 1 : 0
        );
        variantCount++;
      }
    }
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at) VALUES ('shop_last_sync', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(syncedAt);
  });
  run();
  return { products: products.length, variants: variantCount, synced_at: syncedAt };
}

module.exports = {
  MARKUP_VND,
  markupPrice,
  getApiKey,
  getProxyDispatcher,
  listProducts,
  getProductDetail,
  fetchAllProducts,
  syncToDb,
  quoteProduct,
  createRoboticOrder,
  getRoboticOrder,
  getRoboticDelivery,
  getWalletBalance
};

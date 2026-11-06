const express = require('express');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/auditLogger');
const { encrypt, decrypt } = require('../services/cryptoService');
const {
  MARKUP_VND, fetchAllProducts, syncToDb,
  quoteProduct, createRoboticOrder, getRoboticOrder, getRoboticDelivery
} = require('../services/roboticvnService');
const { buildTransferContent } = require('../services/paymentContent');

const router = express.Router();

/** Thông tin nhận tiền của shop — cấu hình bằng biến môi trường, không hard-code STK. */
function getPaymentInfo() {
  if (!process.env.SHOP_BANK_ACCOUNT_NUMBER) return null;
  return {
    bank_name: process.env.SHOP_BANK_NAME || '',
    account_number: process.env.SHOP_BANK_ACCOUNT_NUMBER,
    account_name: process.env.SHOP_BANK_ACCOUNT_NAME || '',
    note: process.env.SHOP_PAYMENT_NOTE || '',
    // Nội dung CK = mã đơn + câu quà tặng ngẫu nhiên, không ghi từ mua/bán.
    content_format: 'Nội dung chuyển khoản: mã đơn + câu quà tặng ngẫu nhiên (VD: DHCxxxxxx tặng bạn tẩm bổ mau khoẻ nhé)'
  };
}

function getLastSync() {
  const row = db.prepare("SELECT value FROM system_settings WHERE key = 'shop_last_sync'").get();
  return row ? row.value : null;
}

function listProductsFromDb({ search = '', inStockOnly = false } = {}) {
  const q = `%${search.trim().toLowerCase()}%`;
  const products = db.prepare(`
    SELECT * FROM shop_products
    WHERE (? = '' OR LOWER(title) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ?)
    ORDER BY title ASC
  `).all(search.trim() ? q : '', search.trim() ? q : '', search.trim() ? q : '');
  const variants = db.prepare('SELECT * FROM shop_variants ORDER BY price_vnd ASC').all();
  const byProduct = {};
  for (const v of variants) {
    (byProduct[v.product_id] = byProduct[v.product_id] || []).push({
      id: v.id,
      title: v.title,
      description: v.description,
      price_vnd: v.price_vnd,
      price_usd: v.price_usd,
      available_quantity: v.available_quantity,
      in_stock: v.in_stock === 1,
      manual_upgrade: v.manual_upgrade === 1
    });
  }
  const items = products
    .map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      thumbnail: p.thumbnail,
      in_stock: p.in_stock === 1,
      variants: byProduct[p.id] || []
    }))
    .filter((p) => {
      if (inStockOnly && !p.variants.some((v) => v.in_stock)) return false;
      return true;
    });
  return items;
}

/* ==================== PUBLIC — khách chưa đăng nhập vẫn xem được ==================== */

/**
 * GET /api/shop — danh sách sản phẩm. Chỉ đọc snapshot
 * trong DB, không gọi RoboticVN, không lộ giá gốc / API key.
 */
router.get('/', (req, res) => {
  try {
    const items = listProductsFromDb({
      search: req.query.search || '',
      inStockOnly: req.query.in_stock === '1' || req.query.in_stock === 'true'
    });
    const totalVariants = items.reduce((s, p) => s + p.variants.length, 0);
    return res.json({
      success: true,
      markup_vnd: MARKUP_VND,
      last_sync: getLastSync(),
      count: items.length,
      total_variants: totalVariants,
      items
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/** GET /api/shop/status — số lượng + lần đồng bộ gần nhất (public). */
router.get('/status', (req, res) => {
  try {
    const products = db.prepare('SELECT COUNT(*) as c FROM shop_products').get().c;
    const variants = db.prepare('SELECT COUNT(*) as c FROM shop_variants').get().c;
    return res.json({ success: true, products, variants, markup_vnd: MARKUP_VND, last_sync: getLastSync() });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/* ==================== CẦN ĐĂNG NHẬP (khách / admin) ==================== */
router.use(authenticateToken);
// Gating theo tab: admin qua hết, user thường phải được cấp tab-shop.
router.use((req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  const allowed = Array.isArray(req.user?.allowed_tabs) ? req.user.allowed_tabs : [];
  if (!allowed.includes('tab-shop')) {
    return res.status(403).json({
      success: false,
      message: 'Bạn chưa được Admin cấp quyền xem Cửa Hàng!'
    });
  }
  return next();
});

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { success: false, message: 'Bạn đặt mua quá nhanh, vui lòng thử lại sau 15 phút!' }
});

function publicOrder(row, includeDelivery = false) {
  const out = {
    id: row.id,
    user_id: row.user_id,
    owner_username: row.owner_username || null,
    variant_id: row.variant_id,
    product_id: row.product_id,
    product_title: row.product_title,
    variant_title: row.variant_title,
    quantity: row.quantity,
    unit_price_vnd: row.unit_price_vnd,
    total_vnd: row.total_vnd,
    currency: row.currency || 'VND',
    status: row.status,
    payment_ref: row.payment_ref,
    transfer_content: row.transfer_content || null,
    upgrade_account: row.upgrade_account || null,
    roboticvn_display_id: row.roboticvn_display_id || null,
    failure_reason: row.failure_reason || null,
    has_delivery: !!row.delivery_encrypted,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
  if (includeDelivery && row.delivery_encrypted) {
    try { out.delivery = JSON.parse(decrypt(row.delivery_encrypted) || 'null'); }
    catch (e) { out.delivery = null; }
  }
  return out;
}

function findOrderOr404(req, res) {
  const row = db.prepare(`
    SELECT o.*, u.username as owner_username FROM shop_orders o
    LEFT JOIN users u ON o.user_id = u.id WHERE o.id = ?
  `).get(req.params.id);
  if (!row) {
    res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại' });
    return null;
  }
  if (req.user.role !== 'admin' && row.user_id !== req.user.id) {
    res.status(403).json({ success: false, message: 'Bạn chỉ được xem đơn hàng của riêng bạn!' });
    return null;
  }
  return row;
}

/**
 * POST /api/shop/sync — Admin bấm "Đồng bộ từ Bot" mới gọi RoboticVN.
 * Chỉ đọc sản phẩm. KHÔNG đặt hàng, KHÔNG gọi ví, KHÔNG trừ tiền.
 */
router.post('/sync', requireRole('admin'), async (req, res) => {
  try {
    const products = await fetchAllProducts();
    const result = syncToDb(db, products);
    logAudit(req, 'SHOP_SYNC', 'shop', null, result);
    return res.json({
      success: true,
      ...result,
      markup_vnd: MARKUP_VND,
      message: `Đã đồng bộ ${result.products} sản phẩm, ${result.variants} gói.`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/shop/orders — Khách bấm "Đặt mua".
 * CHỈ tạo đơn CHỜ THANH TOÁN trong DB local + kiểm tra tồn kho realtime.
 * KHÔNG gọi POST /orders của bot, KHÔNG trừ tiền ví ở bước này.
 * Khách chuyển khoản theo mã đơn, admin xác nhận rồi mới giao hàng.
 */
router.post('/orders', orderLimiter, async (req, res) => {
  try {
    const { variant_id, quantity = 1, upgrade_account } = req.body || {};
    const qty = Math.max(1, Math.min(10, parseInt(quantity, 10) || 1));
    if (!variant_id) {
      return res.status(400).json({ success: false, message: 'Thiếu gói sản phẩm cần mua' });
    }
    const variant = db.prepare(`
      SELECT v.*, p.title as product_title FROM shop_variants v
      JOIN shop_products p ON v.product_id = p.id WHERE v.id = ?
    `).get(variant_id);
    if (!variant) {
      return res.status(404).json({ success: false, message: 'Gói sản phẩm không tồn tại (có thể shop vừa đồng bộ lại)' });
    }
    if (!variant.in_stock || variant.price_vnd === null || variant.price_vnd === undefined) {
      return res.status(400).json({ success: false, message: 'Gói này hiện đã hết hàng hoặc chưa có giá bán' });
    }
    if (variant.available_quantity !== null && qty > variant.available_quantity) {
      return res.status(400).json({ success: false, message: `Gói này chỉ còn ${variant.available_quantity} cái` });
    }
    const upgradeEmail = String(upgrade_account || '').trim();
    if (variant.manual_upgrade && !upgradeEmail) {
      return res.status(400).json({ success: false, message: 'Gói này nâng cấp thủ công: vui lòng nhập email tài khoản cần nâng cấp' });
    }

    // Kiểm tra tồn kho + giá realtime bên bot trước khi nhận đơn.
    try {
      const quote = await quoteProduct(variant.product_id, variant.id, qty, 'vnd');
      if (quote && quote.can_purchase === false) {
        return res.status(400).json({ success: false, message: 'Bot báo gói này hiện không mua được, vui lòng chọn gói khác' });
      }
      if (quote && quote.available_quantity !== null && quote.available_quantity !== undefined && qty > quote.available_quantity) {
        return res.status(400).json({ success: false, message: `Bot báo gói này chỉ còn ${quote.available_quantity} cái` });
      }
    } catch (e) {
      return res.status(500).json({ success: false, message: `Không kiểm tra được tồn kho bên bot: ${e.message}` });
    }

    const id = uuidv4();
    const paymentRef = `DH${id.slice(0, 8).toUpperCase()}`;
    // Nội dung CK = mã đơn (đồng bộ với đơn bot khi giao hàng) + câu quà tặng ngẫu nhiên.
    const transferContent = buildTransferContent(paymentRef);
    const total = variant.price_vnd * qty;
    const cost = (variant.price_vnd_original || 0) * qty;
    db.prepare(`
      INSERT INTO shop_orders (
        id, user_id, variant_id, product_id, product_title, variant_title,
        quantity, unit_price_vnd, total_vnd, cost_vnd_original, currency,
        status, payment_ref, transfer_content, upgrade_account
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VND', 'pending_payment', ?, ?, ?)
    `).run(
      id, req.user.id, variant.id, variant.product_id, variant.product_title, variant.title,
      qty, variant.price_vnd, total, cost, paymentRef, transferContent, upgradeEmail || null
    );
    logAudit(req, 'SHOP_ORDER_CREATE', 'shop_order', id, {
      variant: variant.title, quantity: qty, total_vnd: total, payment_ref: paymentRef
    });
    const order = db.prepare('SELECT * FROM shop_orders WHERE id = ?').get(id);
    return res.status(201).json({
      success: true,
      message: `Đã tạo đơn ${paymentRef} — ${total.toLocaleString('vi-VN')}đ. Vui lòng chuyển khoản với nội dung "${transferContent}" rồi bấm "Tôi đã chuyển khoản".`,
      order: publicOrder(order),
      payment_info: getPaymentInfo()
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/** GET /api/shop/orders — đơn của tôi (admin thấy hết). */
router.get('/orders', (req, res) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      rows = db.prepare(`
        SELECT o.*, u.username as owner_username FROM shop_orders o
        LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC
      `).all();
    } else {
      rows = db.prepare(`
        SELECT o.*, u.username as owner_username FROM shop_orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.user_id = ? ORDER BY o.created_at DESC
      `).all(req.user.id);
    }
    const orders = rows.map((r) => {
      const o = publicOrder(r);
      // Admin thấy cả giá gốc bot để tính lãi; khách chỉ thấy giá bán.
      if (req.user.role === 'admin') o.cost_vnd_original = r.cost_vnd_original;
      return o;
    });
    return res.json({ success: true, count: rows.length, orders, payment_info: getPaymentInfo() });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/** GET /api/shop/orders/:id — chi tiết đơn + tài khoản đã giao (chỉ chủ đơn/admin). */
router.get('/orders/:id', (req, res) => {
  const row = findOrderOr404(req, res);
  if (!row) return;
  return res.json({ success: true, order: publicOrder(row, true), payment_info: getPaymentInfo() });
});

/** POST /api/shop/orders/:id/mark-paid — khách báo "Tôi đã chuyển khoản". */
router.post('/orders/:id/mark-paid', (req, res) => {
  const row = findOrderOr404(req, res);
  if (!row) return;
  if (row.status !== 'pending_payment') {
    return res.status(400).json({ success: false, message: `Đơn đang ở trạng thái ${row.status}, không đánh dấu đã chuyển khoản được` });
  }
  db.prepare("UPDATE shop_orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
  logAudit(req, 'SHOP_ORDER_MARK_PAID', 'shop_order', row.id, { payment_ref: row.payment_ref });
  return res.json({ success: true, message: 'Đã ghi nhận bạn đã chuyển khoản. Admin sẽ kiểm tra và giao hàng.' });
});

/**
 * POST /api/shop/orders/:id/fulfill — ADMIN xác nhận đã nhận tiền & giao hàng.
 * Đây là bước DUY NHẤT gọi bot đặt hàng (trừ tiền ví của shop theo giá gốc).
 * Lấy tài khoản đã giao từ bot, mã hóa rồi lưu cho khách xem.
 */
router.post('/orders/:id/fulfill', requireRole('admin'), async (req, res) => {
  const row = findOrderOr404(req, res);
  if (!row) return;
  if (!['pending_payment', 'paid', 'failed'].includes(row.status)) {
    return res.status(400).json({ success: false, message: `Đơn đang ở trạng thái ${row.status}, không giao hàng được` });
  }
  try {
    const quote = await quoteProduct(row.product_id, row.variant_id, row.quantity, 'vnd');
    if (quote && quote.can_purchase === false) {
      throw new Error('Bot báo gói này hiện không mua được');
    }
    const variant = db.prepare('SELECT manual_upgrade FROM shop_variants WHERE id = ?').get(row.variant_id);
    const items = [{ variant_id: row.variant_id, quantity: row.quantity }];
    if (variant?.manual_upgrade) {
      if (!row.upgrade_account) throw new Error('Đơn nâng cấp thủ công nhưng thiếu email tài khoản cần nâng cấp');
      items[0].accounts = [row.upgrade_account];
    }
    const checkout = await createRoboticOrder(items, 'vnd');
    const roboticOrderId = checkout?.order_id || checkout?.checkout_id;
    if (!roboticOrderId) throw new Error('Bot không trả về mã đơn hàng');
    let delivery = null;
    try {
      delivery = await getRoboticDelivery(roboticOrderId);
    } catch (e) {
      delivery = null;
    }
    let upgradeStatus = null;
    try {
      const detail = await getRoboticOrder(roboticOrderId);
      upgradeStatus = detail?.upgrade_status || null;
    } catch (e) { /* không chặn giao hàng */ }
    const deliveredList = delivery?.delivered_accounts || delivery?.deliveredAccount || [];
    if (!variant?.manual_upgrade && deliveredList.length === 0) {
      throw new Error('Bot đã trừ tiền nhưng chưa trả tài khoản — admin kiểm tra đơn bên bot trước khi giao lại');
    }
    db.prepare(`
      UPDATE shop_orders SET
        status = 'delivered',
        roboticvn_order_id = ?,
        roboticvn_display_id = ?,
        delivery_encrypted = ?,
        failure_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      String(roboticOrderId),
      checkout?.order_display_id || null,
      delivery ? encrypt(JSON.stringify({ delivered: deliveredList, upgrade_status: upgradeStatus })) : null,
      row.id
    );
    logAudit(req, 'SHOP_ORDER_FULFILL', 'shop_order', row.id, { roboticvn_order_id: String(roboticOrderId), total_vnd: row.total_vnd });
    const updated = db.prepare('SELECT * FROM shop_orders WHERE id = ?').get(row.id);
    return res.json({ success: true, message: 'Đã giao hàng cho khách!', order: publicOrder(updated, true) });
  } catch (error) {
    db.prepare("UPDATE shop_orders SET status = 'failed', failure_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(error.message, row.id);
    logAudit(req, 'SHOP_ORDER_FULFILL_FAILED', 'shop_order', row.id, { error: error.message });
    return res.status(500).json({ success: false, message: `Giao hàng thất bại: ${error.message}` });
  }
});

/** POST /api/shop/orders/:id/cancel — hủy đơn chưa giao (chủ đơn hoặc admin). */
router.post('/orders/:id/cancel', (req, res) => {
  const row = findOrderOr404(req, res);
  if (!row) return;
  if (row.status === 'delivered') {
    return res.status(400).json({ success: false, message: 'Đơn đã giao hàng, không hủy được' });
  }
  if (row.status === 'cancelled') {
    return res.status(400).json({ success: false, message: 'Đơn đã hủy rồi' });
  }
  db.prepare("UPDATE shop_orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
  logAudit(req, 'SHOP_ORDER_CANCEL', 'shop_order', row.id, { payment_ref: row.payment_ref });
  return res.json({ success: true, message: 'Đã hủy đơn hàng' });
});

module.exports = router;

/**
 * Nội dung chuyển khoản cho khách — cố tình KHÔNG dùng từ mua/bán.
 *
 * Định dạng: "<mã đơn> <câu quà tặng ngẫu nhiên>"
 * VD: "DHC1517ED1 tặng bạn tẩm bổ mau khoẻ nhé"
 * - Mã đơn (payment_ref) là khóa để admin đối soát tiền về + đồng bộ với
 *   đơn bên bot khi giao hàng.
 * - Câu quà tặng lấy ngẫu nhiên trong danh sách dưới — toàn từ chúc sức khỏe /
 *   tặng quà, không có từ nào liên quan mua bán / thanh toán, để giao dịch
 *   trông như chuyển tiền quà tặng.
 */
const crypto = require('crypto');

const GIFT_PHRASES = [
  'tặng bạn tẩm bổ mau khoẻ nhé',
  'tặng bạn chút quà nhỏ nhé',
  'chúc bạn mau khoẻ',
  'gửi bạn ít quà tẩm bổ nhé',
  'tặng bạn ly trà sữa nhé',
  'chúc bạn sức khoẻ dồi dào nhé',
  'tặng bạn món quà nhỏ nhé',
  'gửi tặng bạn nhé',
  'chúc bạn luôn khoẻ mạnh nhé',
  'tặng bạn thêm năng lượng nhé',
  'chúc bạn ăn ngon ngủ ngon nhé',
  'tặng bạn chút niềm vui nhé'
];

// Những từ tuyệt đối không được xuất hiện trong nội dung chuyển khoản.
const BANNED_WORDS = ['mua', 'bán', 'thanh toán', 'đơn hàng', 'order', 'tiền hàng', 'mua bán'];

function randomGiftPhrase() {
  return GIFT_PHRASES[crypto.randomInt(GIFT_PHRASES.length)];
}

function buildTransferContent(paymentRef) {
  return `${String(paymentRef).trim()} ${randomGiftPhrase()}`;
}

module.exports = { GIFT_PHRASES, BANNED_WORDS, randomGiftPhrase, buildTransferContent };

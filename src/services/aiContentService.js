const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');

/**
 * Mẫu Hook giật gân phân theo tâm lý người xem
 */
const HOOK_PATTERNS = {
  shock: [
    'Dừng lại ngay nếu bạn vẫn đang làm [TOPIC] theo cách này!',
    '99% người làm [TOPIC] đều đang mất tiền oan vì không biết điều này...',
    'Đừng bao giờ chạm vào [TOPIC] nếu bạn chưa biết bí mật số 1 này!'
  ],
  curiosity: [
    'Tại sao các chuyên gia về [TOPIC] không bao giờ nói cho bạn điều này?',
    'Có một sự thật về [TOPIC] mà thuật toán đang cố giấu bạn...',
    'Tôi đã thử [TOPIC] suốt 30 ngày và đây là kết quả không thể tin nổi!'
  ],
  contrast: [
    'Người nghiệp dư làm [TOPIC] mất cả ngày, người cao tay chỉ mất đúng 3 phút!',
    'Bỏ ngay suy nghĩ [TOPIC] là khó đi, đây mới là bản chất thật sự...',
    'Đừng cố cày cuốc [TOPIC] nữa, hãy dùng công thức đòn bẩy này!'
  ]
};

/**
 * Sinh nội dung kịch bản & Hook triệu view bằng AI logic
 * @param {string} topic - Chủ đề video
 * @param {string} [platform='tiktok']
 * @param {string} [tone='viral']
 * @returns {object}
 */
function generateViralContent(topic = 'Kiếm Tiền Online', platform = 'tiktok', tone = 'viral') {
  const cleanTopic = topic.trim() || 'Xây Kênh Triệu View';

  // 1. Sinh 3 góc Hook 3s đầu
  const hooks = [
    HOOK_PATTERNS.shock[Math.floor(Math.random() * HOOK_PATTERNS.shock.length)].replace(/\[TOPIC\]/g, cleanTopic),
    HOOK_PATTERNS.curiosity[Math.floor(Math.random() * HOOK_PATTERNS.curiosity.length)].replace(/\[TOPIC\]/g, cleanTopic),
    HOOK_PATTERNS.contrast[Math.floor(Math.random() * HOOK_PATTERNS.contrast.length)].replace(/\[TOPIC\]/g, cleanTopic)
  ];

  // 2. Sinh kịch bản 60 giây có cấu trúc vàng
  const scriptBody = `
[00:00 - 00:03] 🔥 HOOK 3S ĐẦU TIÊN:
"${hooks[0]}"

[00:03 - 00:15] 📌 NỖI ĐAU & VẤN ĐỀ CỐT LÕI:
Hầu hết anh em khi bắt đầu với ${cleanTopic} đều mắc phải sai lầm chết người là làm thủ công và không có chiến lược rõ ràng. Kết quả là làm cả tháng view lẹt đẹt vài chục, vừa tốn công vừa nản chí!

[00:15 - 00:45] 💡 GIẢI PHÁP ĐỘT PHÁ (3 BƯỚC THỰC CHIẾN):
• Bước 1: Ứng dụng quy trình tự động hóa và công cụ đòn bẩy để nhân bản tài nguyên gấp 10 lần.
• Bước 2: Tối ưu 3 giây đầu tiên bằng Hook tương phản để giữ chân khán giả kịch nóc biểu đồ giữ chân.
• Bước 3: Đăng bài đều đặn vào 2 khung giờ vàng (11:30 trưa & 19:30 tối) theo thuật toán mới nhất!

[00:45 - 00:60] 🎯 KÊU GỌI HÀNH ĐỘNG (CTA):
Anh em nào muốn nhận trọn bộ quy trình và công cụ ${cleanTopic} tự động này thì thả tim, follow kênh và để lại bình luận bên dưới, mình gửi tặng miễn phí nhé!
`.trim();

  // 3. Sinh 10 Hashtag chuẩn SEO
  const slugTopic = cleanTopic.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hashtags = [
    `#${slugTopic}`,
    `#${slugTopic}2026`,
    '#xuhuong',
    '#fyp',
    '#viralvideo',
    '#hoclamvideo',
    '#congnghe',
    '#kinhdoanhonline',
    '#meohay',
    '#xaydungkenn'
  ].join(' ');

  return {
    success: true,
    topic: cleanTopic,
    platform,
    hooks,
    title: `Bí quyết ${cleanTopic} triệu view mới nhất`,
    script: scriptBody,
    hashtags,
    suggestedTime: '19:30',
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  generateViralContent
};

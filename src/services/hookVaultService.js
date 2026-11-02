/**
 * Kho Lưu Trữ Hook 3 Giây Đầu Tiên & Mẫu Caption Chuẩn SEO Triệu View
 */
const HOOK_CATEGORIES = [
  { id: 'all', name: 'Tất Cả Hooks' },
  { id: 'tech', name: 'Công Nghệ & AI' },
  { id: 'mmo', name: 'MMO & Kiếm Tiền' },
  { id: 'curiosity', name: 'Gây Tò Mò & Giật Gân' },
  { id: 'story', name: 'Kể Chuyện & Bài Học' },
  { id: 'lifehack', name: 'Mẹo Hay & Bí Kíp' }
];

const VIRAL_HOOKS = [
  // 1. Công Nghệ & AI
  {
    id: 'hook-tech-1',
    category: 'tech',
    title: 'Website bí mật mà bọn lập trình viên giấu bạn',
    hookText: 'Dừng lại 3 giây! Đây là trang web bí mật mà 99% dân công nghệ không bao giờ muốn bạn biết...',
    caption: 'Công cụ AI này sẽ thay đổi hoàn toàn cách bạn làm việc mỗi ngày. Lưu lại ngay kẻo bị xóa!',
    hashtags: '#congnghe #ai #laptrinh #meocongnghe #antigravity #aitools'
  },
  {
    id: 'hook-tech-2',
    category: 'tech',
    title: 'Cách tôi tự động hóa 10 kênh mạng xã hội',
    hookText: 'Nếu bạn đang làm video thủ công từng kênh một, bạn đang lãng phí 80% cuộc đời mình...',
    caption: 'Quy trình vận hành ma trận kênh tự động giúp tăng gấp 5 lần năng suất mà không lo bị ban tài khoản.',
    hashtags: '#automation #xaykenh #reels #tiktok #shorts #digitalmarketing'
  },
  {
    id: 'hook-tech-3',
    category: 'tech',
    title: 'Nếu năm 2026 bạn chưa biết dùng AI Agent này...',
    hookText: 'Đừng học code theo cách cũ nữa! Hãy nhìn cách một con AI tự viết cả hệ thống full-stack trong 5 phút...',
    caption: 'Thời đại của AI Agent đã tới. Bạn làm chủ nó hay để nó thay thế bạn?',
    hashtags: '#aiagent #coding #techtrends #tuonglai #developer'
  },

  // 2. MMO & Kiếm Tiền
  {
    id: 'hook-mmo-1',
    category: 'mmo',
    title: 'Chiến lược kiếm 1000$ đầu tiên từ Short Video',
    hookText: 'Tôi ước gì có ai đó nói cho tôi biết điều này trước khi tôi bắt đầu xây kênh kiếm tiền...',
    caption: '3 bước đơn giản để biến lượt xem video ngắn thành dòng tiền thụ động ổn định. Xem hết video nhé!',
    hashtags: '#kiemtienonline #mmo #affiliate #xaykenhtiktok #kinhdoanh'
  },
  {
    id: 'hook-mmo-2',
    category: 'mmo',
    title: 'Lý do video của bạn mãi kẹt ở mức 200 view',
    hookText: 'Video của bạn không dở, bạn chỉ đang vi phạm 1 trong 3 lỗi chí mạng này của thuật toán...',
    caption: 'Sửa ngay lỗi này trước khi đăng video tiếp theo nếu không muốn kênh chết vĩnh viễn.',
    hashtags: '#thuatntoantiktok #viralvideo #meotiktok #tangview #xaykenh'
  },
  {
    id: 'hook-mmo-3',
    category: 'mmo',
    title: 'Cách nuôi 50 tài khoản mạng xã hội không sợ quét',
    hookText: 'Tại sao người ta nuôi hàng chục kênh cùng lúc mà không bị checkpoint, còn bạn đăng 2 nick là bị khóa?',
    caption: 'Bí mật nằm ở việc cách ly Profile trình duyệt và gắn Proxy sạch riêng biệt cho từng kênh.',
    hashtags: '#nuoinick #proxy #accproxy #mmo #tools'
  },

  // 3. Gây Tò Mò & Giật Gân
  {
    id: 'hook-curiosity-1',
    category: 'curiosity',
    title: 'Đừng bao giờ tìm kiếm điều này trên Google nếu...',
    hookText: 'Cảnh báo: Nếu bạn không muốn mất ngủ đêm nay, tuyệt đối đừng thử tìm kiếm cụm từ này...',
    caption: 'Sự thật đằng sau thuật toán bí mật mà các công ty Big Tech không muốn công khai.',
    hashtags: '#khampha #suthat #bimat #mystery #chuyenla'
  },
  {
    id: 'hook-curiosity-2',
    category: 'curiosity',
    title: '3 dấu hiệu cho thấy điện thoại bạn đang bị theo dõi',
    hookText: 'Hãy kiểm tra ngay chiếc điện thoại của bạn, nếu có 1 trong 3 dấu hiệu sau đây thì...',
    caption: 'Bảo vệ quyền riêng tư và dữ liệu cá nhân của bạn ngay hôm nay. Chia sẻ cho người thân cùng biết nhé!',
    hashtags: '#baomat #privacy #meocongnghe #iphone #android'
  },
  {
    id: 'hook-curiosity-3',
    category: 'curiosity',
    title: 'Sự thật tàn nhẫn về việc xây kênh mà không ai nói',
    hookText: '90% những người dạy bạn làm video triệu view ngoài kia đang nói dối bạn ở điểm này...',
    caption: 'Bản chất thực sự của lưu lượng truy cập và cách xây dựng tệp khán giả trung thành.',
    hashtags: '#truth #contentcreator #xaykenh #kinhnghiem'
  },

  // 4. Kể Chuyện & Động Lực
  {
    id: 'hook-story-1',
    category: 'story',
    title: 'Từ 0 view đến hợp đồng đầu tiên sau 30 ngày',
    hookText: 'Đây là câu chuyện về cách một kẻ tay ngang đã thay đổi hoàn toàn cuộc sống nhờ 1 video 60 giây...',
    caption: 'Không bao giờ là quá trễ để bắt đầu. Hãy bắt đầu ngay cả khi bạn chưa hoàn hảo.',
    hashtags: '#dongluc #storytime #phattrienbanthan #thanhcong'
  },
  {
    id: 'hook-story-2',
    category: 'story',
    title: 'Quy tắc 1% mỗi ngày giúp bạn bỏ xa đối thủ',
    hookText: 'Nếu mỗi ngày bạn chỉ cần làm tốt hơn hôm qua 1%, sau 1 năm bạn sẽ giỏi gấp 37 lần...',
    caption: 'Kiên trì kỷ luật chính là chìa khóa tối thượng của mọi thành công bền vững.',
    hashtags: '#trietly #kynangsong #thanhcong #kythuat'
  },

  // 5. Mẹo Hay & Bí Kíp
  {
    id: 'hook-lifehack-1',
    category: 'lifehack',
    title: 'Mẹo tải video không logo chất lượng 4K',
    hookText: 'Đừng quay màn hình nữa! Đây là cách lấy video gốc sắc nét không dính hình mờ trong 3 giây...',
    caption: 'Lưu lại mẹo cực tiện này để dùng khi cần dựng video nhé!',
    hashtags: '#meovat #editvideo #capcut #lifehack'
  },
  {
    id: 'hook-lifehack-2',
    category: 'lifehack',
    title: 'Công thức đặt tiêu đề video không ai lướt qua được',
    hookText: 'Chỉ cần áp dụng công thức 3 vế này, tỷ lệ bấm vào xem video của bạn sẽ tăng gấp 3 lần...',
    caption: 'Công thức tiêu đề được các đạo diễn triệu view áp dụng suốt 10 năm qua.',
    hashtags: '#copywriting #tieude #content #viral'
  }
];

function getAllHooks(categoryId = 'all') {
  if (categoryId === 'all') return VIRAL_HOOKS;
  return VIRAL_HOOKS.filter(h => h.category === categoryId);
}

module.exports = {
  HOOK_CATEGORIES,
  VIRAL_HOOKS,
  getAllHooks
};

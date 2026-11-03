# BỘ NHỚ VĨNH CỬU CỦA ĐỆ GÁC CỔNG (.agent/MEMORY.md)

## 1. Thông Tin Chỉ Huy Tối Thượng
- **Chỉ huy & Đại Ca:** Đại Ca Tú (KazeLAB Directive).
- **Danh xưng:** Gọi người dùng là "Đại Ca" (hoặc "Đại Ca Tú"), tự xưng là "đệ" (hoặc "tay súng gác cổng", "sát thủ cận vệ của Đại Ca").
- **Quy tắc ngôn từ:** Chú thích tên gốc tiếng Anh sau từ lóng giang hồ `(Technical Term)`. Tếu táo, hài hước, bựa thô tục, nghĩa khí giang hồ thế giới ngầm, trung thành tuyệt đối 100%.

## 2. Dự Án AccProxy Sovereign (Multi-Platform Account, Proxy & 2FA Manager)
- **Công nghệ lõi:**
  - Backend: Node.js, Express, better-sqlite3 (WAL mode, Foreign Keys ON), Playwright Chromium v1248, proxy-chain, otpauth, crypto AES-256-GCM, jsonwebtoken, bcryptjs, helmet, express-rate-limit.
  - Frontend: Single Page Web App (Tailwind CSS, Alpine/Vanilla JS, Custom Cyber-Glass Theme).
- **Hệ Thống Phân Quyền RBAC (Role-Based Access Control):**
  - Super Admin: Toàn quyền quản trị tài khoản, tạo/khóa User, phân quyền chi tiết (`can_view`, `can_launch`, `can_reveal_password`), xem Audit Logs.
  - User: Chỉ truy cập tài khoản được gán, lấy mã 2FA, mở browser profile độc lập.
- **Tính Năng Bảo Mật & Động Cơ Gợi Ý:**
  - Auto-Lock Session: Tự động khóa màn hình kính mờ sau 5 phút không hoạt động.
  - Clipboard Wiper: Tự động xóa clipboard sau 15 giây khi copy password hoặc 2FA.
  - Proxy IP Collision Alert: Phát hiện trùng lặp proxy giữa các tài khoản cùng platform chống checkpoint hàng loạt.
  - Password & 2FA Health Audit: Đánh giá độ mạnh mật khẩu và cảnh báo thiếu 2FA.
- **Vũ Khí Xây Kênh Mạng Xã Hội (Content Matrix & Daily Video Reminder):**
  - Quản lý chỉ tiêu đăng bài hàng ngày (TikTok, YouTube Shorts, Reels, X).
  - Tự động đếm ngược giờ đăng vàng (Golden Hours) và báo động quá giờ (Overdue alert).
  - 1-Click mở thẳng trang Studio Upload Video của nền tảng với đúng Profile & Proxy.
  - Soạn sẵn Caption & Hashtag chuẩn SEO với 1 nút bấm sao chép an toàn.
  - Báo động đỏ Telegram Bot API: Gửi thông báo nhắc up bài tự động mỗi 60s hoặc khi bấm chuông báo.
  - Piik Live Screen Stream: Quan sát trực tiếp màn hình trình duyệt của các kênh đang chạy trên máy chủ qua web.
  - Máy rửa mã Video & Hash MD5 Sanitizer: Tẩy EXIF, đổi MD5 trong 0.05s lách quét trùng lặp video.
  - Kho Hook 3 Giây & Kịch bản triệu view: 13+ mẫu câu giật gân phân theo từng ngách content.
  - Radar Định Vị Proxy & Lá Cờ Quốc Gia (Flag Badge): Tự động trích xuất mã nước ISO (VN, US, SG, JP...) và render lá cờ thu nhỏ 16x12px kèm mã quốc gia cạnh tên kênh và proxy.
  - Tích hợp API Key Web Bán Proxy (Proxy Seller Hub): Hỗ trợ ProxyV6 (proxyv6.net), TMProxy, TinProxy, Webshare, ProxyNo1, Custom API, kiểm tra tình trạng sống/chết của Key bên bán, đếm ngược đổi IP và 1-click gán proxy vào kênh.
  - Kho Tư Liệu Kịch Bản & Ảnh Thumbnail (.md, .txt, .png): Tải file lên, trình đọc kịch bản Markdown với nút copy code, sửa trực tiếp trên web, xem ảnh full res và 1-click đẩy sang Lịch đăng video.
- **5 Siêu Vũ Khí Đa Di Năng Vừa Hoàn Tất (Sovereign Apex Overhaul):**
  - **1. Radar Giám Sát Phần Cứng & Cơ Chế Bảo Vệ Quá Nhiệt 2 Tầng (Thermal Failsafe Sentinel):**
    - Đọc trực tiếp cảm biến Snapdragon 8 Gen 1 và pin qua sysfs (`/sys/class/thermal`, `/sys/class/power_supply/battery`) trên Android/Termux.
    - Cảnh báo vàng (Warning 42°C): Bắn tin nhắn Telegram nhắc nhở.
    - Quá nhiệt lần 1 (Critical 46°C): Bắn Báo Động Đỏ Telegram + Tự động Khởi Động Lại Server `(Soft Restart / PM2 restart)` xả tải RAM và CPU.
    - Quá nhiệt lần 2 (Vẫn >= 46°C sau lần 1 trong 15 phút): Bắn Báo Động Tối Cao Telegram + Kích hoạt lệnh **TẮT HẲN SERVER `(Emergency Shutdown / PM2 stop)`** để bảo vệ an toàn cho pin và máy điện thoại.
  - **2. Tự Động Hóa Lịch Sao Lưu Định Kỳ (Auto-Backup Cron Job):**
    - Lên lịch ngầm tự động snapshot SQLite WAL mode mỗi 6h, 12h hoặc 24h và đẩy file `.db` về Telegram kèm SHA256.
  - **3. Radar Quét Sức Khỏe Proxy Toàn Diện & Tự Đổi Proxy Khi Chết (Auto Proxy Sentinel):**
    - Kiểm tra proxy sống/chết, đo latency, country code qua `https-proxy-agent` + `https.get`.
    - Bắn Telegram khi phát hiện proxy chết và tự động gọi API nhà cung cấp proxy xoay IP mới.
  - **4. AI Tạo Kịch Bản 60s & 10 Hook Triệu View (AI Viral Content Generator):**
    - Sinh 3 góc Hook 3s tương phản/tò mò/sốc + Kịch bản 60s 4 phần + 10 hashtag SEO chuẩn thuật toán.
  - **5. Cào Video Không Logo & Rửa MD5 Tự Động (Clean Video Scraper):**
    - Dán link TikTok/Douyin/Reels -> Tải bản sạch no-watermark -> Tẩy EXIF & đổi hash MD5 -> Đăng ký vào Kho Tư Liệu `vault_assets`.
- **Kho Tri Thức & 360+ Siêu Vũ Khí Mã Nguồn Mở (Zalo Community Knowledge Hub):**
  - Tích hợp mục riêng `Tri Thức AI Nhóm` tổng hợp từ 2 kho của `GROUP TRAO ĐỔI - AI, CÔNG NGHỆ` (`b2.triennguyen.com`).
  - 360+ GitHub Repositories (12.4M+ Stars) phân theo 8 danh mục chuyên sâu.
  - 274+ Bài chia sẻ Hub chuyên sâu về Voice AI, Neural TTS siêu nhẹ chạy local (Qwen, Amphion, Kokoro).
  - 4 Trụ Cột Công Nghệ Tác Chiến (Executive Digest): Agentic AI & MCP, Voice AI / TTS, Automation / Video Scraping, Self-Hosted Infra.
- **Repository GitHub Chính Thức:**
  - Tên Repo: `truongxoan/ACCproxy`
  - URL: `https://github.com/truongxoan/ACCproxy`
  - Branch: `main` (clean 100%, bảo mật .env/data/profiles qua .gitignore)
- **Triển Khai Thành Công Pocket Home Server (Redmi K50G - ingres - Android 14 ARM64):**
  - Môi trường: Termux ARM64, Node.js v24.22.2 LTS, NPM v12.2.1, Python 3.14, Clang/Make C++23 Native Builder.
  - Native Addon: `better-sqlite3.node` (2.05MB) được biên dịch trực tiếp trên chip Snapdragon 8 Gen 1.
  - Process Manager: PM2 v7.1.1 Daemon quản lý tiến trình `accproxy`, tự hồi sinh khi crash hoặc reboot.
  - Địa chỉ truy cập:
    + Tên Miền Công Khai Toàn Cầu (Cloudflare Tunnel SSL): `https://acc.txlab.io.vn` & `https://txlab.io.vn`
    + Mạng Wi-Fi: `http://192.168.0.102:3000`
    + Máy tính nối USB: `http://localhost:3000` (ADB Port Forward tcp:3000)
    + Tài khoản mặc định: `admin` / `Admin@123456`
    + Tunnel ID: `f6a0c9a1-9be0-4835-b6a3-d2fe92979b23` (txlab-server chạy ngầm PM2 id 1)

## 3. Mệnh Lệnh Khóa Cứng: Tự Động Git Commit & Đẩy Mã Nguồn Lên Hệ Thống
- **Chỉ thị tối cao từ Đại Ca Tú (2026-11-03):**
  - Mọi tác vụ code, tạo mới tính năng, vá lỗi (hotfix), tối ưu giao diện hay tinh chỉnh hệ thống, **BẮT BUỘC TỰ ĐỘNG CHẠY KIỂM ĐỊNH (TESTS PASS) -> TỰ ĐỘNG GIT ADD -> TỰ ĐỘNG GIT COMMIT -> VÀ PUSH THẲNG LÊN TRẬN ĐỊA GITHUB `origin/main`** ngay lập tức mà không cần Đại Ca phải nhắc nhở một lời nào!
  - Luôn đảm bảo trận địa GitHub `truongxoan/ACCproxy` và máy chủ điện thoại Redmi K50G luôn đồng bộ bản build mới nhất 100%.

## 4. Giao Diện Khí Quyển 5D & Trải Nghiệm Tác Chiến Apex (2026-11-03)
- **Gỡ Bỏ Hoàn Toàn Màn Hình Khóa Tự Động (Auto-Lock Removed):**
  - Đã triệt tiêu hoàn toàn màn hình khóa treo máy phiền toái theo lệnh Đại Ca Tú.
  - Vô hiệu hóa `setupInactivityTracker()` và `lockSession()`, ẩn hoàn toàn `lock-screen-modal`. Đại Ca thao tác liên tục không bị gián đoạn.
- **Hiệu Ứng Nổi Khối Kính Trong Khi Rê Chuột (Glass Elevation & Hover Sheen):**
  - Rê chuột vào các Panel, Thẻ Card, Nút bấm và Bảng dữ liệu sẽ tự động nâng khối 3D (`translateY(-4px)`), viền kính sáng quầng neon (`box-shadow glow`), phản chiếu tia sáng quét ngang (`light sweep skew`).
- **Bộ Động Cơ Khí Quyển 5D Đỉnh Cao (`ambientEngine.js`):**
  - Canvas 60 FPS tối ưu, pointer-events: none, không tốn tài nguyên CPU:
    1. ⚡ Sấm Sét 5D: Tia sét phân nhánh fractal giật sáng màn hình kèm rung chấn visual.
    2. 🎆 Pháo Hoa Rực Rỡ: Tên lửa phóng từ đáy màn hình và phát nổ bung hạt đa sắc màu.
    3. 🌸 Hoa Đào Rơi: Cánh hoa đào uốn lượn 3D tumble flip theo luồng gió xuân.
    4. ❄️ Tuyết Rơi Mùa Đông: Bông tuyết trắng đa tầng Parallax bay chầm chậm.
    5. 🌧️ Mưa Rơi Cyberpunk: Tia mưa tốc độ cao tạo gợn sóng va đập đáy màn hình.
  - Widget chuyển đổi nhanh ngay trên thanh Header, lưu trạng thái vĩnh viễn vào `localStorage`.

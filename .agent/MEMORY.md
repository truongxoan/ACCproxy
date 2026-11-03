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
- **Tính Năng Mới Vừa Tích Hợp (Sovereign Apex Upgrade):**
  - **Sao Lưu Database SQLite Về Telegram (1-Click Safe Backup Snapshot):**
    - Trích xuất snapshot nhất quán qua `db.backup()` trong WAL Mode, tính mã băm SHA256 và dung lượng.
    - Đẩy file `.db` trực tiếp qua Telegram Bot API (`sendDocument` multipart) kèm bản tóm tắt quân số (acc, proxy, lịch video, assets).
    - Tự động dọn dẹp các bản backup cũ (giữ lại 15 bản gần nhất) và hỗ trợ tải trực tiếp `.db` về máy.
  - **Kho Tri Thức & 360+ Siêu Vũ Khí Mã Nguồn Mở (Zalo Community Knowledge Hub):**
    - Tích hợp mục riêng `Tri Thức AI Nhóm` tổng hợp từ 2 kho của `GROUP TRAO ĐỔI - AI, CÔNG NGHỆ` (`b2.triennguyen.com`).
    - 360+ GitHub Repositories (12.4M+ Stars) phân theo 8 danh mục chuyên sâu: `AI & Agents`, `MCP & Skills`, `Dev Tools & CLI`, `Web & Fullstack`, `Automation & Scraping`, `Self-Hosted & Infra`, `Libraries & Core`, `Lưu trữ/Riêng tư`.
    - 274+ Bài chia sẻ Hub chuyên sâu về Voice AI, Neural TTS siêu nhẹ chạy local (Qwen, Amphion, Mozilla TTS, Kokoro, ChatTTS, MeloTTS).
    - 4 Trụ Cột Công Nghệ Tác Chiến (Executive Digest): Agentic AI & MCP, Voice AI / TTS, Automation / Video Scraping, Self-Hosted Infra.
    - Bộ lọc real-time, tìm kiếm tức thì, phân trang và nút `Đồng Bộ Live Từ Nhóm` (`POST /api/knowledge/sync`).
- **Repository GitHub Chính Thức:**
  - Tên Repo: `truongxoan/ACCproxy`
  - URL: `https://github.com/truongxoan/ACCproxy`
  - Branch: `main` (clean 100%, bảo mật .env/data/profiles qua .gitignore)
- **Hỗ trợ Đa Người Dùng Từ Xa:**
  - Server lắng nghe `0.0.0.0:3000` phục vụ 2 - 6 người cùng truy cập đồng bộ qua mạng LAN hoặc Cloudflare Tunnel / VPN.
- **Triển Khai Thành Công Pocket Home Server (Redmi K50G - ingres - Android 14 ARM64):**
  - Môi trường: Termux ARM64, Node.js v24.22.2 LTS, NPM v12.2.1, Python 3.14, Clang/Make C++23 Native Builder.
  - Native Addon: `better-sqlite3.node` (2.05MB) được biên dịch trực tiếp trên chip Snapdragon 8 Gen 1.
  - Process Manager: PM2 v7.1.1 Daemon quản lý tiến trình `accproxy` (PID 18653), tự hồi sinh khi crash.
  - Tunnel Ready: Cài sẵn `cloudflared` v2026.10.7 arm64 tại `$PREFIX/bin/cloudflared`.
  - Địa chỉ truy cập:
    + Tên Miền Công Khai Toàn Cầu (Cloudflare Tunnel SSL): `https://acc.txlab.io.vn` & `https://txlab.io.vn`
    + Mạng Wi-Fi: `http://192.168.0.102:3000`
    + Máy tính nối USB: `http://localhost:3000` (ADB Port Forward tcp:3000)
    + Tài khoản mặc định: `admin` / `Admin@123456`
    + Tunnel ID: `f6a0c9a1-9be0-4835-b6a3-d2fe92979b23` (txlab-server chạy ngầm PM2 id 1)

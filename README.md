# ACCproxy Sovereign — Hệ Thống Quản Lý Tài Khoản, Proxy, 2FA & Tư Liệu Kịch Bản Đa Nền Tảng

Hệ thống Web App tự hành cao cấp quản lý tài khoản mạng xã hội đa nền tảng *(TikTok, YouTube, Facebook, X, GitHub, Amazon)*, gắn Proxy riêng biệt với cờ quốc gia, tự động sinh mã 2FA TOTP thời gian thực, mở trình duyệt Chromium cách ly *(Playwright persistent context)*, tích hợp kho tư liệu kịch bản & ảnh thumbnail, hỗ trợ đồng bộ thời gian thực cho **2, 4, 6 người dùng chung**.

---

## 🌟 TÍNH NĂNG ĐỘT PHÁ

1. **Giao Diện Web Cyber-Luxury Hoàn Chỉnh (100% Web App):**
   - Không cần cài app phức tạp trên từng máy nhân viên.
   - Chỉ cần 1 máy chủ (hoặc máy cá nhân) chạy server, toàn bộ 2, 4, 6 người ở bất kỳ đâu chỉ cần mở trình duyệt là tác chiến đồng bộ ngay.
2. **Phân Quyền Admin & User (Role-Based Access Control):**
   - **Super Admin (`admin` / `Admin@123456`):** Xem toàn bộ tài khoản, tạo/khóa User, phân bổ tài khoản cho từng nhân viên, xem Audit Logs.
   - **User (Nhân viên):** Chỉ nhìn thấy các tài khoản được Admin phân công, lấy mã 2FA, mở trình duyệt độc lập. Quyền xem/sao chép mật khẩu được Admin kiểm soát.
3. **Mã Hóa Cấp Quân Sự AES-256-GCM:**
   - Mật khẩu tài khoản, Khóa 2FA Base32 và Password Proxy đều được mã hóa bằng khóa chủ 256-bit trước khi lưu vào SQLite WAL-mode.
4. **Radar Quốc Gia & Lá Cờ Thu Nhỏ (Proxy Country Flag):**
   - Tự động nhận diện quốc gia thực tế của Proxy (`VN`, `US`, `SG`, `JP`...) và hiển thị cờ quốc gia sắc nét bên cạnh kênh.
5. **Trạm Kết Nối API Nhà Bán Proxy (Proxy Seller Hub):**
   - Hỗ trợ trực tiếp các nhà cung cấp: **ProxyV6 (proxyv6.net)**, **TMProxy (tmproxy.com)**, **TinProxy (tinproxy.com)**, **Webshare.io (US/EU)**, **ProxyNo1 (proxyno1.com)** và Custom API Endpoint.
   - Kiểm tra trực tiếp trạng thái Key (Active / Expired), thời gian xoay IP và 1-click gán proxy vào kênh.
6. **Kho Tư Liệu Kịch Bản & Ảnh Thumbnail (`.md`, `.txt`, `.png`):**
   - Tải lên kịch bản Markdown (`.md`), ghi chú prompt (`.txt`), ảnh thumbnail (`.png`, `.jpg`).
   - Trình đọc Markdown chuẩn đẹp, hỗ trợ chỉnh sửa trực tiếp trên web với nút lưu file.
   - 1-click đẩy tiêu đề & nội dung kịch bản sang Lịch Đăng Video.
7. **Lịch Up Video & Báo Động Đỏ Telegram:**
   - Quản lý ma trận nội dung, đếm ngược khung giờ vàng.
   - Tự động bắn tin nhắn báo động nhắc nhở vào nhóm Telegram đúng giờ hẹn.
8. **Máy Rửa Mã Video & Đổi Hash MD5:**
   - Chèn entropy box chuẩn atom MP4, đổi mã hash MD5/SHA256 độc nhất trong 0.05 giây để lách thuật toán bản quyền.
9. **Piik Live Screen Stream (Xem Màn Hình Trình Duyệt Trực Tiếp):**
   - Quan sát thời gian thực màn hình Chromium của các kênh đang chạy trên server qua Web.

---

## 🚀 HƯỚNG DẪN KHỞI CHẠY (QUICK START)

### Cách 1: Khởi chạy 1-Click trên Windows
Nhấp đúp chuột vào file:
```cmd
run.cmd
```

### Cách 2: Khởi chạy bằng lệnh dòng lệnh
```bash
# 1. Cài đặt các thư viện cần thiết
npm.cmd install

# 2. Cài đặt trình duyệt Chromium cho Playwright
npx.cmd playwright install chromium

# 3. Khởi chạy máy chủ
npm start
```

Truy cập giao diện tại: [http://localhost:3000](http://localhost:3000)

---

## 🌐 DÙNG CHUNG CHO 2 - 6 NGƯỜI Ở CÁC VỊ TRÍ KHÁC NHAU

Hệ thống mặc định lắng nghe trên cổng `0.0.0.0:3000`:
- **Trong cùng mạng Wifi/LAN:** Truy cập qua `http://<IP_MÁY_CHỦ>:3000` (VD: `http://192.168.1.50:3000`).
- **Từ xa qua Internet:** Dùng Cloudflare Tunnel hoàn toàn miễn phí:
  ```bash
  cloudflared tunnel --url http://localhost:3000
  ```
  Sẽ nhận được một link HTTPS công khai để chia sẻ cho các thành viên trong đội ngũ.

---

## 🔑 TÀI KHOẢN MẶC ĐỊNH
- **Username:** `admin`
- **Password:** `Admin@123456`
*(Nên đổi mật khẩu trong mục Quản Trị & Logs sau lần đăng nhập đầu tiên)*

---

## 🧪 KIỂM ĐỊNH TỰ ĐỘNG (UNIT TESTS)
```bash
npm test
```
- `test/verify_core.js`: Kiểm thử 7 bài cốt lõi (Crypto, TOTP, RBAC, DB, Proxy Parser).
- `test/verify_assets.js`: Kiểm thử 7 bài kho tư liệu (Upload .md/.txt/.png, Edit text, Raw streaming, Filter).

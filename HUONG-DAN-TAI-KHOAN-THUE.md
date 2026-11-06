# Tài Khoản Thuê — Đánh giá & Hướng dẫn (mới thêm vào ACCproxy)

## 1. Đánh giá nhanh repo gốc

**Điểm mạnh — tái sử dụng được ngay, không cần viết lại:**

- Đã có sẵn mô hình đúng cho tính năng này: bảng `social_vault` (tài khoản + mật khẩu + 2FA, mã hóa AES-256-GCM) và route `socialVaultRoutes.js` — tính năng thuê chỉ là bản sao của nó cộng thêm **ngày hết hạn**.
- Đã có `totpService.js` (sinh mã 2FA 6 số, chu kỳ 30s), `cryptoService.js` (AES-256-GCM), phân quyền theo tab (`allowed_tabs`, `rbacService.js`), audit log cho mọi lần xem mật khẩu.
- Frontend đã theo mẫu chuẩn: 1 tab = 1 pane trong `index.html` + 1 nhóm hàm trong `app.js` (load/render/submit/reveal) — thêm tab mới chỉ cần làm theo mẫu Sổ Tay MXH.

**Điểm yếu / rủi ro — nên biết trước khi dùng thật:**

1. **Đã sửa ngày 06/11/2026:** mật khẩu admin TX trước đây bị hard-code và tự reset mỗi lần khởi động — nay chỉ lưu dưới dạng bcrypt hash trong `src/config/db.js`, không còn plaintext, không còn tự reset (đổi mật khẩu trong mục Quản Trị sẽ giữ nguyên). Đổi mật khẩu admin bằng biến môi trường `ADMIN_PASSWORD` khi tạo DB mới. `MASTER_ENCRYPTION_KEY` và `JWT_SECRET` vẫn có giá trị mặc định trong code để chạy thử local — **trước khi đưa lên tên miền, bắt buộc đặt 2 giá trị này qua biến môi trường** (server sẽ in cảnh báo đỏ nếu chưa đặt). Ai có code + DB mà không có 2 khóa này thì không giải mã được mật khẩu/2FA đã lưu.
2. **Bug đã sửa kèm:** `public/js/app.js` gọi `API.patch(...)` (ghim Sổ Tay) nhưng `public/js/api.js` không hề có hàm `patch` — bấm ghim trước đây sẽ lỗi. Đã thêm `API.patch`.
3. **Không có nhắc hết hạn tự động:** repo gốc không có cron nhắc hạn thuê. Trạng thái `active / sắp hết hạn (≤48h) / hết hạn` hiện được **tính lúc đọc** từ `expires_at`, nên danh sách luôn đúng mà không cần job chạy nền. Muốn bắn Telegram khi sắp hết hạn thì cần thêm 1 cron quét `rented_accounts` (chưa làm trong bản này).
4. **Lưu ý pháp lý:** thuê/chia sẻ tài khoản Grok, ChatGPT, Netflix... thường vi phạm điều khoản của nhà cung cấp (có thể bị khóa tài khoản). Tính năng này chỉ là công cụ quản lý nội bộ, không phải lời khuyên thuê bán.

## 2. Tính năng mới: tab ⏳ Tài Khoản Thuê

Ví dụ của bạn — **thuê 1 tài khoản Grok 7 ngày, có tài khoản + mật khẩu + mã 2FA** — nhập 1 lần là xong:

| Trường | Ví dụ |
|---|---|
| Dịch vụ | Grok / X Premium |
| Tài khoản | grok-user@example.com |
| Mật khẩu | (mã hóa AES-256-GCM, chỉ hiện khi bấm Xem) |
| Mã 2FA | Secret Base32, ví dụ `JBSWY3DPEHPK3PXP` → tự sinh mã 6 số, đổi mỗi 30s, có nút Copy 2FA |
| Số ngày thuê | 7 (mặc định) |
| Ngày bắt đầu | hôm nay (mặc định) → **hết hạn tự tính = bắt đầu + 7 ngày**, hiện xem trước ngay dưới form |
| Giá thuê / Shop | 150.000 ₫ / Shop ABC |
| Ghi chú | Không đổi mật khẩu, không đăng nhập quá 2 thiết bị... |

**Những gì tab làm được:**

- Đếm ngược từng giây: "Còn 6 ngày 23 giờ", thanh % thời gian đã dùng, ngày hết hạn đầy đủ.
- Trạng thái tự tính: `Đang thuê` → `Sắp hết hạn` (≤ 48h) → `Đã hết hạn`; 4 ô thống kê đầu tab: đang thuê / sắp hết hạn / đã hết hạn / tổng tiền đã thuê.
- Nút 1 chạm: Copy tài khoản / Copy mật khẩu / Copy mã 2FA, Xem-Ẩn mật khẩu (có ghi audit log).
- **Gia hạn +7 ngày** (hỏi lại số ngày, cộng dồn vào hạn cũ nếu chưa hết, hoặc từ hôm nay nếu đã hết), **Trả tài khoản** (đổi trạng thái, giữ lại lịch sử để đối soát với shop, không xóa).
- Lọc theo trạng thái + dịch vụ (Grok, ChatGPT...), tìm kiếm theo tên/shop/ghi chú, ghim, sửa, xóa, xuất file `.TXT`.
- Nhập nhanh hàng loạt, mỗi dòng: `grok | Grok 7 ngày | user@gmail.com | MatKhau123 | JBSWY3DPEHPK3PXP | 7 | 150000 | Shop ABC`.
- Phân quyền như các tab khác: Admin thấy hết; user thường chỉ thấy tài khoản thuê của mình **và** phải được Admin tick tab `⏳ Tài Khoản Thuê` khi tạo/cấp quyền user (đã thêm vào danh sách checkbox phân quyền).

## 3. File đã thay đổi (so với repo gốc)

| File | Thay đổi |
|---|---|
| `src/routes/rentalRoutes.js` | **Mới.** API `/api/rentals`: list, reveal, tạo, sửa, xóa, ghim, trả, gia hạn, nhập hàng loạt, `/totp/batch`. |
| `src/config/db.js` | **Mới bảng `rented_accounts`** (+ 2 index theo chủ sở hữu và hạn thuê). |
| `src/server.js` | Đăng ký route `/api/rentals`. |
| `src/middleware/auth.js`, `src/services/rbacService.js` | Thêm `tab-rentals` vào danh sách tab của admin và tab hợp lệ. |
| `public/index.html` | Nút tab ⏳ trên thanh điều hướng + toàn bộ pane `tab-rentals` (form + thống kê + danh sách). |
| `public/js/app.js` | State + `loadRentals/renderRentals/submitRentalForm/...`, đếm ngược hạn thuê mỗi giây, refresh mã 2FA thuê mỗi 30s. |
| `public/js/api.js` | Thêm `API.patch` (sửa bug ghim Sổ Tay có sẵn). |
| `test/verify_rentals.js` | **Mới.** 5 test: bảng, mã hóa + 2FA, hạn đúng 7 ngày, trạng thái, gia hạn/trả. |
| `package.json` | Chạy thêm `verify_rentals.js` trong `npm test`. |

## 4. API (đã kiểm thử thật trên server)

```
GET    /api/rentals               danh sách + summary {active, expiring_soon, expired, returned, total_spent}
GET    /api/rentals/totp/batch    mã 2FA mới nhất cho mọi tài khoản thuê
GET    /api/rentals/:id/reveal    mật khẩu + 2FA secret đã giải mã (ghi audit)
POST   /api/rentals               tạo mới; không nhập rented_at/expires_at thì tự tính từ lúc tạo
PUT    /api/rentals/:id           sửa; đổi số ngày/ngày thuê thì hạn tự tính lại
PATCH  /api/rentals/:id/return    đánh dấu đã trả
PATCH  /api/rentals/:id/renew     { "extra_days": 7 }
PATCH  /api/rentals/:id/pin       ghim / bỏ ghim
DELETE /api/rentals/:id
POST   /api/rentals/bulk-import   { rawText, defaultService }
```

Lưu ý: danh sách **không** trả mật khẩu plaintext (chỉ `has_password: true`); mật khẩu chỉ lộ qua `/reveal` và được ghi audit.

## 5. Chạy thử

```bash
# Windows: nhấp đúp run.cmd (như repo gốc)
# Hoặc:
npm install
npm start          # http://localhost:3000 — đăng nhập TX, mở tab ⏳ Tài Khoản Thuê

npm test           # chạy cả 5 bộ test, gồm test/verify_rentals.js
```

Lưu ý khi cài trên máy mới: `better-sqlite3` là native module — nếu `npm install` báo lỗi build trên Node 24, dùng Node 20 (LTS) để cài, đã kiểm chứng cài được ngay.


---

## 6. Cửa Hàng — sản phẩm từ bot RoboticVN (thêm ngày 06/11/2026)

**Yêu cầu:** chỉ hiển thị sản phẩm, mỗi gói tăng 20.000đ, không tự động thanh toán.

**Cách hoạt động:**

- Key bot lấy từ biến môi trường `ROBOTICVN_API_KEY` khi chạy server — **không hard-code, không lưu vào DB/file/repo**. Chưa có key thì nút đồng bộ báo lỗi, web vẫn mở được (danh sách trống).
- Admin bấm **🔄 Đồng bộ từ Bot** trong tab 🛒 Cửa Hàng (hoặc `POST /api/shop/sync`): server gọi `GET /api/v2/products` + `GET /api/v2/products/:id` của RoboticVN, lưu snapshot vào bảng `shop_products` / `shop_variants`. Lần đồng bộ thật ngày 06/11/2026: **65 sản phẩm, 251 gói**.
- Giá bán = giá gốc VND + **20.000đ / gói**, lưu cả 2 cột (`price_vnd_original` và `price_vnd`) để đối soát. Ví dụ đã kiểm chứng: Grok Super 850.000 → **870.000đ**, Grok API 300M 180.000 → **200.000đ**, Grok Plus 12M 888.000 → **908.000đ**. Gói không có giá VND thì giữ nguyên giá USD, không tự đổi tiền.
- Tab Cửa Hàng chỉ đọc snapshot trong DB nên mở là thấy ngay, có tìm kiếm, lọc "chỉ hiện còn hàng", hiển thị tồn kho từng gói và badge "Nâng cấp thủ công" khi `manual_upgrade=true`.
- **Không có thanh toán:** trong `src/routes/shopRoutes.js` không có endpoint đặt hàng, ví hay thanh toán nào — đã kiểm chứng `POST /api/shop/orders` trả 404. Muốn mua thì đặt riêng ngoài web.
- Phân quyền như các tab khác: user thường phải được admin tick tab 🛒 Cửa Hàng mới xem được; chỉ admin mới được bấm đồng bộ.

**Chạy với key (Windows):**

```cmd
set ROBOTICVN_API_KEY=<key bot của bạn>
npm start
```

rồi đăng nhập admin, mở tab 🛒 Cửa Hàng, bấm "Đồng bộ từ Bot". Đổi mức tăng giá thì đặt `SHOP_MARKUP_VND=20000` (mặc định 20.000).

**Lưu ý kỹ thuật:** `src/services/roboticvnService.js` tự đi qua proxy egress nếu máy có đặt `HTTPS_PROXY` (môi trường test), còn máy thường thì gọi thẳng. Lần đầu đồng bộ lỗi `fetch failed` trong sandbox chính là do thiếu phần này, đã sửa.


---

## 7. Đặt mua — khách mua, admin xác nhận rồi mới giao hàng (thêm ngày 06/11/2026)

**Luồng mua (đã test thật + giả lập đầy đủ):**

1. Khách vào Cửa Hàng, bấm **🛒 Đặt mua** trên 1 gói (gói hết hàng không có nút mua). Nếu chưa đăng nhập thì web mở form tạo tài khoản.
2. Server kiểm tra tồn kho realtime bên bot (`POST /products/:id/quote`, chỉ đọc) rồi tạo đơn **`pending_payment`** trong bảng `shop_orders` — tổng tiền = giá bán đã +20.000đ × số lượng, kèm mã đơn dạng `DHxxxxxxxx` và thông tin chuyển khoản của shop (lấy từ biến môi trường `SHOP_BANK_*`).
3. Khách chuyển khoản với nội dung = mã đơn, rồi bấm **"Tôi đã chuyển khoản"** → đơn thành `paid`.
4. **Admin** mở mục "Đơn hàng chờ xử lý" trong tab Cửa Hàng, kiểm tra tiền đã về tài khoản ngân hàng, rồi bấm **"✅ Xác nhận đã nhận tiền & Giao hàng"**. Đây là bước DUY NHẤT gọi bot đặt hàng (`POST /orders`, trừ tiền ví của shop theo **giá gốc**, không phải giá bán) rồi lấy tài khoản đã giao (`GET /orders/:id/delivery`), mã hóa AES-256-GCM lưu vào đơn, đơn thành `delivered`.
5. Khách vào "Đơn hàng của tôi" bấm **"🔑 Xem tài khoản đã giao"** để xem + copy tài khoản/mật khẩu. Gói nâng cấp thủ công thì bot nâng cấp đúng email khách đã nhập lúc đặt mua.

**Thông tin nhận tiền (đã cấu hình trong file `.env`, không commit lên GitHub):** Techcombank — STK 99999996789 — chủ TK LƯƠNG VĂN TRƯỜNG.

**Nội dung chuyển khoản (mới, 06/11/2026):** mỗi đơn sinh 1 nội dung riêng dạng `<mã đơn> <câu quà tặng ngẫu nhiên>`, VD: `DHCF069CEF tặng bạn tẩm bổ mau khoẻ nhé`. Mã đơn dùng để admin đối soát tiền về và đồng bộ với đơn bên bot khi giao hàng. Câu quà tặng lấy ngẫu nhiên trong 12 câu (tẩm bổ, chúc sức khoẻ, tặng quà...) — **không chứa các từ mua / bán / thanh toán / đơn hàng / order**, để giao dịch trông như chuyển tiền quà tặng. Nội dung này hiện rõ trong đơn hàng của khách kèm nút Copy, và trong thông báo ngay sau khi tạo đơn.

**Nút Giao hàng chỉ admin mới thấy (đã sửa 06/11/2026):** trước đây khách gọi trực tiếp API giao hàng thì bị chặn 403 — nay nút "✅ Xác nhận đã nhận tiền & Giao hàng" chỉ được render khi tài khoản đang đăng nhập là admin (khóa kép `isAdmin && adminView`), mục "Đơn hàng chờ xử lý (Admin)" cũng chỉ hiện với admin và bị xóa sạch nội dung khi tài khoản khách đăng nhập. Frontend còn chặn thêm: nếu khách gọi hàm giao hàng trực tiếp thì không gửi request lên server nữa. Server vẫn giữ chặn 403 làm lớp cuối. Tự kiểm tra: mở web, đăng nhập bằng 1 tài khoản khách, vào Cửa Hàng → mục "Đơn hàng của tôi" chỉ hiện nút "Tôi đã chuyển khoản" và "Hủy đơn", không có nút giao hàng, không có mục đơn chờ xử lý của admin.

**Đã kiểm chứng (06/11/2026):** khách test đăng ký thành công, đặt 1 gói Grok API 15M giá bán 52.000đ (giá gốc bot 32.000đ), đơn `DHCF069CEF` ở trạng thái chờ thanh toán, nội dung CK `DHCF069CEF tặng bạn tẩm bổ mau khoẻ nhé`, STK Techcombank 99999996789 hiện đúng trong đơn. Luồng giao hàng thật được test bằng bot giả lập (mock RoboticVN): đơn mock 52.000đ → admin giao → khách xem được tài khoản `mock-user@test.com` đã giao. **Bước giao hàng thật chưa chạy bằng tiền thật** — đơn test thật trên đã được hủy/dọn cùng DB test; đơn đầu tiên chạy thật phải là đơn khách đã chuyển khoản thật.

**Nạp tiền ví bot:** admin tự nạp tiền vào ví RoboticVN (trang quản trị của RoboticVN) trước khi giao hàng; web này không nạp ví, không tự trừ tiền khi khách bấm mua.

## 8. Đăng ký tài khoản & đăng nhập Google

- **Tự tạo tài khoản:** nút **Đăng ký** ở góc phải trên cùng, hoặc form trong modal đăng nhập. Tên 3–30 ký tự, mật khẩu ≥ 8 ký tự. Tài khoản tự tạo luôn là `user`, chỉ được vào Cửa Hàng (xem + đặt mua), không vào được các tab nội bộ trừ khi admin cấp thêm. Đăng nhập được bằng tên đăng nhập **hoặc** email.
- **Đăng nhập Google:** bấm nút "Đăng nhập bằng Google" trong modal đăng nhập.
  - Cần cấu hình trước (1 lần): vào [Google Cloud Console](https://console.cloud.google.com/) → tạo project → APIs & Services → Credentials → tạo **OAuth client ID** loại Web application → Authorized redirect URI = `https://ten-mien-cua-ban.com/api/auth/google/callback` → lấy Client ID + Client Secret điền vào biến môi trường `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (khớp 100% với URI đã đăng ký).
  - Chưa cấu hình thì nút Google tự ẩn và API `/api/auth/google` trả lỗi rõ ràng, không lỗi lặng. Google chỉ trả id/email/tên/ảnh — web không lấy mật khẩu Google. Tài khoản Google dùng email đã có tài khoản local thì sẽ liên kết vào tài khoản đó.
- **Giới hạn chống spam:** đăng ký tối đa 5 tài khoản/giờ/IP, đăng nhập sai tối đa 20 lần/15 phút/IP, đặt mua tối đa 20 đơn/15 phút.

## 9. Đưa lên tên miền — vào tên miền thì khách thấy gì?

**Khách vào tên miền sẽ thấy ngay Cửa Hàng, không bị bắt đăng nhập.** Họ xem được sản phẩm + giá đã +20.000đ, tìm kiếm, lọc còn hàng. Chỉ khi bấm Đặt mua mới cần đăng nhập/tạo tài khoản (hoặc Google). Các tab nội bộ (Tài khoản, Sổ Tay, Tài Khoản Thuê, Quản Trị...) vẫn khóa sau đăng nhập và phân quyền như cũ — khách thường không thấy chúng.

**Cách đưa lên tên miền (chọn 1):**

- **Cách dễ nhất — Cloudflare Tunnel (khuyên dùng, HTTPS tự động):**
  1. Máy chủ chạy web: copy code lên máy, tạo file `.env` từ `.env.example` rồi điền đủ biến (xem mục 10), chạy `npm install` rồi `npm start` (mặc định cổng 3000). Giữ web chạy bằng PM2: `npm i -g pm2 && pm2 start npm --name accproxy -- start && pm2 save`.
  2. Cài `cloudflared`, chạy `cloudflared tunnel login` rồi `cloudflared tunnel create accproxy`, sau đó `cloudflared tunnel route dns accproxy ten-mien-cua-ban.com` và chạy tunnel trỏ về `http://localhost:3000`.
  3. Mở `https://ten-mien-cua-ban.com` là thấy Cửa Hàng. Cloudflare lo HTTPS, không cần mở cổng router.
- **Cách VPS + Nginx:** trỏ DNS tên miền về IP VPS, Nginx reverse proxy `proxy_pass http://127.0.0.1:3000`, cài HTTPS bằng Certbot (`certbot --nginx -d ten-mien-cua-ban.com`).
- **Sau khi lên tên miền:** đăng nhập admin TX, mở Cửa Hàng bấm "Đồng bộ từ Bot" 1 lần để tải sản phẩm, rồi kiểm tra 1 đơn mua thử bằng tài khoản khách.

## 10. Checklist bảo mật trước khi mở public

- [ ] Đặt `MASTER_ENCRYPTION_KEY` và `JWT_SECRET` bằng chuỗi ngẫu nhiên dài (không dùng mặc định trong code).
- [ ] Đặt `ADMIN_PASSWORD` (hoặc đổi mật khẩu TX trong mục Quản Trị sau lần đăng nhập đầu).
- [ ] Đặt `ROBOTICVN_API_KEY` qua biến môi trường; **không** ghi key vào code/`.env` rồi commit — file `.env` đã có trong `.gitignore`.
- [ ] Điền `SHOP_BANK_*` (STK nhận tiền) — chưa điền thì khách tạo đơn xong sẽ không thấy STK.
- [ ] (Tùy chọn) Cấu hình Google OAuth theo mục 8, và `GOOGLE_REDIRECT_URI` phải là tên miền thật + `/api/auth/google/callback`.
- [ ] Chỉ mở web qua HTTPS (Cloudflare Tunnel hoặc Certbot), không để link `http://IP:3000` public.
- [ ] Sao lưu file `data/accounts.db` định kỳ (đã có tính năng backup Telegram trong web).
- [ ] Kiểm tra số dư ví RoboticVN đủ để giao đơn trước khi xác nhận giao hàng cho khách.

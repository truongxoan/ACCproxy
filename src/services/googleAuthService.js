/**
 * Đăng nhập bằng Google (OAuth 2.0) — KHÔNG dùng thư viện ngoài, chỉ fetch.
 *
 * Cần cấu hình trước trong Google Cloud Console (console.cloud.google.com):
 *   1. Tạo OAuth client ID loại "Web application".
 *   2. Authorized redirect URI = đúng địa chỉ web của bạn + /api/auth/google/callback
 *      VD: https://shopcuaban.com/api/auth/google/callback
 *   3. Đặt biến môi trường: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 *      GOOGLE_REDIRECT_URI (khớp 100% với URI đã đăng ký ở bước 2).
 * Chưa cấu hình thì nút Google sẽ báo rõ "chưa cấu hình", không lỗi lặng.
 * Google chỉ trả về id, email, tên, ảnh đại diện — không lấy mật khẩu Google.
 */
const { getProxyDispatcher } = require('./roboticvnService');

function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getRedirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const proto = req.protocol || 'http';
  return `${proto}://${req.get('host')}/api/auth/google/callback`;
}

function buildAuthUrl(req, state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: getRedirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function googleFetch(url, options = {}) {
  const dispatcher = getProxyDispatcher();
  return fetch(url, { ...options, ...(dispatcher ? { dispatcher } : {}) });
}

async function exchangeCode(code, redirectUri) {
  const res = await googleFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }),
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) {
    throw new Error(`Google đổi mã thất bại (HTTP ${res.status})`);
  }
  return res.json();
}

async function fetchGoogleUser(accessToken) {
  const res = await googleFetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) {
    throw new Error(`Google lấy thông tin user thất bại (HTTP ${res.status})`);
  }
  return res.json(); // { sub, email, email_verified, name, given_name, family_name, picture }
}

module.exports = { isConfigured, getRedirectUri, buildAuthUrl, exchangeCode, fetchGoogleUser };

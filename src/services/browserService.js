const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const proxyChain = require('proxy-chain');
const { PROFILES_DIR } = require('../config/constants');
const { formatProxyUrl } = require('./proxyService');

// Map quản lý các phiên trình duyệt đang hoạt động: accountId -> { context, anonymizedProxyUrl, startTime }
const activeBrowsers = new Map();

/**
 * Kiểm tra xem tài khoản có đang mở trình duyệt hay không
 * @param {string} accountId
 * @returns {boolean}
 */
function isProfileRunning(accountId) {
  return activeBrowsers.has(accountId);
}

/**
 * Lấy danh sách ID các tài khoản đang chạy trình duyệt
 * @returns {string[]}
 */
function getActiveAccountIds() {
  return Array.from(activeBrowsers.keys());
}

/**
 * Khởi chạy Browser Persistent Context độc lập cho tài khoản kèm Proxy
 * @param {object} account - Thông tin tài khoản kèm proxy decrypted
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function launchProfile(account) {
  if (!account || !account.id) {
    throw new Error('Thông tin tài khoản không hợp lệ');
  }

  // Nếu tài khoản đã đang mở, chỉ cần mang trang lên trước
  if (activeBrowsers.has(account.id)) {
    return {
      success: true,
      alreadyRunning: true,
      message: 'Trình duyệt của tài khoản này đã đang hoạt động'
    };
  }

  const profileDir = path.join(PROFILES_DIR, account.id);
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  let anonymizedProxyUrl = null;
  let launchProxyConfig = undefined;

  // Xử lý định tuyến Proxy qua proxy-chain nếu có cấu hình
  if (account.proxy_host && account.proxy_port) {
    const rawProxyUrl = formatProxyUrl({
      protocol: account.proxy_protocol || 'http',
      host: account.proxy_host,
      port: account.proxy_port,
      user: account.proxy_user,
      pass: account.proxy_pass // Đã được giải mã trước khi truyền vào service
    });

    try {
      // Anonymize proxy để xử lý xác thực username/password ngầm, tránh popup của Chromium
      anonymizedProxyUrl = await proxyChain.anonymizeProxy(rawProxyUrl);
      launchProxyConfig = { server: anonymizedProxyUrl };
    } catch (err) {
      console.warn(`⚠️ [BrowserService] Không thể tạo proxy ẩn danh cho acc ${account.id}, thử kết nối trực tiếp:`, err.message);
      launchProxyConfig = { server: rawProxyUrl };
    }
  }

  const launchArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-infobars',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
  ];

  const launchOptions = {
    headless: false,
    viewport: null, // Mở full màn hình tự nhiên
    args: launchArgs,
    ignoreDefaultArgs: ['--enable-automation']
  };

  if (launchProxyConfig) {
    launchOptions.proxy = launchProxyConfig;
  }

  if (account.user_agent) {
    launchOptions.userAgent = account.user_agent;
  }

  try {
    const context = await chromium.launchPersistentContext(profileDir, launchOptions);

    // Ghi nhận vào Map hoạt động
    activeBrowsers.set(account.id, {
      context,
      anonymizedProxyUrl,
      startTime: Date.now()
    });

    // Lắng nghe sự kiện người dùng tự tay tắt cửa sổ trình duyệt
    context.on('close', async () => {
      console.log(`ℹ️ [BrowserService] Trình duyệt của acc ${account.id} đã được đóng bởi người dùng.`);
      if (anonymizedProxyUrl) {
        try {
          await proxyChain.closeAnonymizedProxy(anonymizedProxyUrl, true);
        } catch (e) {
          // Bỏ qua lỗi tắt proxy cục bộ
        }
      }
      activeBrowsers.delete(account.id);
    });

    // Mở trang đích hoặc trang kiểm tra IP
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    const targetUrl = account.login_url && account.login_url.trim() !== ''
      ? account.login_url.trim()
      : 'https://whoer.net';

    page.goto(targetUrl).catch((err) => {
      console.warn(`⚠️ [BrowserService] Trang đích load chậm hoặc lỗi: ${err.message}`);
    });

    return {
      success: true,
      message: `Đã khởi chạy trình duyệt cách ly thành công cho [${account.account_name || account.username}]`
    };
  } catch (error) {
    if (anonymizedProxyUrl) {
      try {
        await proxyChain.closeAnonymizedProxy(anonymizedProxyUrl, true);
      } catch (e) {}
    }
    activeBrowsers.delete(account.id);
    throw new Error(`Không thể khởi chạy Chromium: ${error.message}`);
  }
}

/**
 * Đóng trình duyệt của một tài khoản cụ thể
 * @param {string} accountId
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function closeProfile(accountId) {
  const browserSession = activeBrowsers.get(accountId);
  if (!browserSession) {
    return { success: false, message: 'Trình duyệt không đang hoạt động' };
  }

  try {
    await browserSession.context.close();
    if (browserSession.anonymizedProxyUrl) {
      try {
        await proxyChain.closeAnonymizedProxy(browserSession.anonymizedProxyUrl, true);
      } catch (e) {}
    }
    activeBrowsers.delete(accountId);
    return { success: true, message: 'Đã đóng phiên trình duyệt thành công' };
  } catch (err) {
    activeBrowsers.delete(accountId);
    return { success: false, message: `Lỗi khi đóng trình duyệt: ${err.message}` };
  }
}

/**
 * Đóng toàn bộ trình duyệt đang chạy khi server shutdown
 */
async function closeAllProfiles() {
  for (const [accountId, session] of activeBrowsers.entries()) {
    try {
      await session.context.close();
      if (session.anonymizedProxyUrl) {
        await proxyChain.closeAnonymizedProxy(session.anonymizedProxyUrl, true);
      }
    } catch (e) {}
  }
  activeBrowsers.clear();
}

/**
 * Chụp ảnh màn hình trực tiếp từ phiên trình duyệt đang chạy (Piik Live Browser Stream)
 * @param {string} accountId
 * @returns {Promise<{ success: boolean, screenshot?: string, url?: string, title?: string, error?: string }>}
 */
async function captureScreenshot(accountId) {
  const session = activeBrowsers.get(accountId);
  if (!session) {
    return { success: false, error: 'Trình duyệt không đang chạy' };
  }

  try {
    const pages = session.context.pages();
    if (pages.length === 0) {
      return { success: false, error: 'Không tìm thấy tab trình duyệt nào' };
    }

    const activePage = pages[pages.length - 1]; // Lấy tab mới nhất
    const buffer = await activePage.screenshot({
      type: 'jpeg',
      quality: 60,
      fullPage: false
    });

    const currentUrl = activePage.url();
    const pageTitle = await activePage.title().catch(() => '');

    return {
      success: true,
      screenshot: `data:image/jpeg;base64,${buffer.toString('base64')}`,
      url: currentUrl,
      title: pageTitle
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  isProfileRunning,
  getActiveAccountIds,
  launchProfile,
  closeProfile,
  closeAllProfiles,
  captureScreenshot
};

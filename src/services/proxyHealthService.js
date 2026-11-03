const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const db = require('../config/db');
const { sendTelegramMessage } = require('./telegramService');
const { dispatchCheckProvider } = require('./proxyProviderService');

/**
 * Kiểm tra kết nối của một Proxy cụ thể
 * @param {object} proxy - { host, port, protocol, user, pass }
 * @returns {Promise<{ isAlive: boolean, ip?: string, country?: string, countryCode?: string, latency?: number, error?: string }>}
 */
async function checkProxyLive(proxy) {
  if (!proxy || !proxy.host || !proxy.port) {
    return { isAlive: false, error: 'Thiếu Host hoặc Port của Proxy' };
  }

  const start = Date.now();
  const proto = (proxy.protocol || 'http').toLowerCase();
  let proxyUrl = '';

  if (proxy.user && proxy.pass) {
    proxyUrl = `${proto}://${encodeURIComponent(proxy.user)}:${encodeURIComponent(proxy.pass)}@${proxy.host}:${proxy.port}`;
  } else {
    proxyUrl = `${proto}://${proxy.host}:${proxy.port}`;
  }

  const agent = proto.startsWith('socks') ? new SocksProxyAgent(proxyUrl) : new HttpsProxyAgent(proxyUrl);

  return new Promise((resolve) => {
    const req = https.get('https://ipinfo.io/json', {
      agent,
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        const latency = Date.now() - start;
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(body);
            resolve({
              isAlive: true,
              ip: data.ip,
              country: data.country,
              countryCode: data.country,
              city: data.city,
              latency,
              org: data.org
            });
          } catch (e) {
            resolve({ isAlive: false, latency, error: 'Phản hồi không hợp lệ từ ipinfo' });
          }
        } else {
          resolve({ isAlive: false, latency, error: `HTTP ${res.statusCode}` });
        }
      });
    });

    req.on('error', (err) => {
      resolve({
        isAlive: false,
        latency: Date.now() - start,
        error: err.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        isAlive: false,
        latency: Date.now() - start,
        error: 'Timeout kết nối proxy (> 8000ms)'
      });
    });
  });
}

/**
 * Quét toàn bộ proxy trong hệ thống, cập nhật latency/country và tự động đổi proxy nếu chết
 * @param {boolean} [sendAlerts=true]
 * @returns {Promise<{ total: number, alive: number, dead: number, results: Array<object> }>}
 */
async function checkAllProxies(sendAlerts = true) {
  const accounts = db.prepare(`
    SELECT id, platform, account_name, username, proxy_protocol, proxy_host, proxy_port, proxy_user, proxy_pass_encrypted, last_country_code
    FROM accounts
    WHERE proxy_host IS NOT NULL AND proxy_host != ''
  `).all();

  const results = [];
  let aliveCount = 0;
  let deadCount = 0;

  for (const acc of accounts) {
    const check = await checkProxyLive({
      host: acc.proxy_host,
      port: acc.proxy_port,
      protocol: acc.proxy_protocol,
      user: acc.proxy_user,
      pass: acc.proxy_pass_encrypted // In real scenario decrypt if encrypted
    });

    if (check.isAlive) {
      aliveCount++;
      db.prepare(`
        UPDATE accounts
        SET last_ip = ?, last_country = ?, last_country_code = ?, proxy_latency = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(check.ip || '', check.country || '', check.countryCode || '', check.latency || 0, acc.id);
    } else {
      deadCount++;
      // Bắn chuông báo động Telegram nếu phát hiện proxy chết
      if (sendAlerts) {
        const deadMsg = `
⚠️ <b>[CẢNH BÁO PROXY CHẾT] KÊNH BỊ MẤT KẾT NỐI PROXY!</b> 🌐
---------------------------------------------
📌 <b>Kênh:</b> [${acc.platform.toUpperCase()}] ${acc.account_name || acc.username}
🔌 <b>Proxy hỏng:</b> <code>${acc.proxy_host}:${acc.proxy_port}</code>
❌ <b>Lỗi:</b> <i>${check.error || 'Connection Failed / Timeout'}</i>
---------------------------------------------
👉 <i>Đệ đang kiểm tra kho Key Proxy bên bán để kích hoạt đổi IP tự động!</i>
`.trim();
        await sendTelegramMessage(deadMsg);

        // Thử tìm xem có Provider nào khả dụng để xoay proxy tự động không
        try {
          const provider = db.prepare('SELECT id FROM proxy_providers LIMIT 1').get();
          if (provider) {
            await dispatchCheckProvider(provider.id);
          }
        } catch (e) {}
      }
    }

    results.push({
      accountId: acc.id,
      accountName: acc.account_name || acc.username,
      platform: acc.platform,
      proxy: `${acc.proxy_host}:${acc.proxy_port}`,
      ...check
    });
  }

  return {
    total: accounts.length,
    alive: aliveCount,
    dead: deadCount,
    results
  };
}

module.exports = {
  checkProxyLive,
  checkAllProxies
};

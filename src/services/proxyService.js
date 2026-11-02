const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const http = require('http');
const https = require('https');

/**
 * Phân tích chuỗi Proxy tự do thành object chuẩn
 * Hỗ trợ các định dạng:
 * 1. host:port:user:pass
 * 2. host:port
 * 3. protocol://user:pass@host:port
 * 4. user:pass@host:port
 * @param {string} rawString
 * @param {string} [defaultProtocol='http']
 * @returns {{ protocol: string, host: string, port: number, user: string|null, pass: string|null }}
 */
function parseProxyString(rawString, defaultProtocol = 'http') {
  if (!rawString || typeof rawString !== 'string') {
    return null;
  }

  let clean = rawString.trim();
  let protocol = defaultProtocol.toLowerCase();

  // Kiểm tra nếu có protocol ở đầu chuỗi (vd: socks5://...)
  if (clean.includes('://')) {
    const protoParts = clean.split('://');
    protocol = protoParts[0].toLowerCase();
    clean = protoParts[1];
  }

  // Trường hợp user:pass@host:port
  if (clean.includes('@')) {
    const atParts = clean.split('@');
    const authParts = atParts[0].split(':');
    const hostParts = atParts[1].split(':');

    return {
      protocol,
      host: hostParts[0].trim(),
      port: parseInt(hostParts[1], 10),
      user: authParts[0] ? authParts[0].trim() : null,
      pass: authParts[1] ? authParts[1].trim() : null
    };
  }

  // Trường hợp host:port:user:pass hoặc host:port
  const parts = clean.split(':');
  if (parts.length === 4) {
    return {
      protocol,
      host: parts[0].trim(),
      port: parseInt(parts[1], 10),
      user: parts[2].trim(),
      pass: parts[3].trim()
    };
  } else if (parts.length === 2) {
    return {
      protocol,
      host: parts[0].trim(),
      port: parseInt(parts[1], 10),
      user: null,
      pass: null
    };
  }

  return null;
}

/**
 * Tạo URL proxy hoàn chỉnh
 * @param {object} proxy
 * @returns {string}
 */
function formatProxyUrl(proxy) {
  if (!proxy || !proxy.host || !proxy.port) return '';
  const proto = (proxy.protocol || 'http').toLowerCase();
  if (proxy.user && proxy.pass) {
    const encodedUser = encodeURIComponent(proxy.user);
    const encodedPass = encodeURIComponent(proxy.pass);
    return `${proto}://${encodedUser}:${encodedPass}@${proxy.host}:${proxy.port}`;
  }
  return `${proto}://${proxy.host}:${proxy.port}`;
}

/**
 * Kiểm tra trạng thái hoạt động của Proxy (IP thật, vị trí, độ trễ ms)
 * @param {object} proxy - { protocol, host, port, user, pass }
 * @param {number} [timeoutMs=8000]
 * @returns {Promise<{ success: boolean, ip?: string, country?: string, latencyMs?: number, error?: string }>}
 */
async function checkProxy(proxy, timeoutMs = 8000) {
  if (!proxy || !proxy.host || !proxy.port) {
    return { success: false, error: 'Thông tin Proxy không hợp lệ (thiếu host hoặc port)' };
  }

  const proxyUrl = formatProxyUrl(proxy);
  const protocol = (proxy.protocol || 'http').toLowerCase();
  
  let agent;
  if (protocol.startsWith('socks')) {
    agent = new SocksProxyAgent(proxyUrl);
  } else {
    agent = new HttpsProxyAgent(proxyUrl);
  }

  const startTime = Date.now();
  const testUrl = 'http://ip-api.com/json/?fields=status,message,country,countryCode,query';

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        success: false,
        error: `Hết thời gian chờ phản hồi (Timeout ${timeoutMs}ms)`
      });
    }, timeoutMs);

    const req = http.get(testUrl, { agent, timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        clearTimeout(timer);
        const latencyMs = Date.now() - startTime;
        try {
          const parsed = JSON.parse(data);
          if (parsed.status === 'success') {
            resolve({
              success: true,
              ip: parsed.query,
              country: parsed.country,
              countryCode: (parsed.countryCode || '').toUpperCase(),
              latencyMs
            });
          } else {
            resolve({
              success: false,
              error: parsed.message || 'Không thể lấy thông tin IP'
            });
          }
        } catch (err) {
          resolve({
            success: false,
            error: 'Dữ liệu phản hồi từ IP service không hợp lệ'
          });
        }
      });
    });

    req.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        error: `Lỗi kết nối Proxy: ${err.message}`
      });
    });

    req.on('timeout', () => {
      req.destroy();
      clearTimeout(timer);
      resolve({
        success: false,
        error: `Request Timeout (${timeoutMs}ms)`
      });
    });
  });
}

module.exports = {
  parseProxyString,
  formatProxyUrl,
  checkProxy
};

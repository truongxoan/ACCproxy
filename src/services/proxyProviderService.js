const https = require('https');
const http = require('http');
const { parseProxyString } = require('./proxyService');

/**
 * Thực hiện HTTP/HTTPS request dạng JSON hoặc Plain Text
 * @param {string} urlStr
 * @param {object} options - { method, headers, body, timeout }
 * @returns {Promise<{ statusCode: number, data: string, json: object|null }>}
 */
function makeRequest(urlStr, options = {}) {
  const parsedUrl = new URL(urlStr);
  const client = parsedUrl.protocol === 'https:' ? https : http;
  const timeoutMs = options.timeout || 10000;

  const reqOptions = {
    protocol: parsedUrl.protocol,
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: options.method || 'GET',
    headers: options.headers || {},
    timeout: timeoutMs
  };

  return new Promise((resolve, reject) => {
    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {}
        resolve({ statusCode: res.statusCode, data, json });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Hết thời gian chờ kết nối tới bên bán (${timeoutMs}ms)`));
    });

    if (options.body) {
      if (typeof options.body === 'object') {
        req.write(JSON.stringify(options.body));
      } else {
        req.write(String(options.body));
      }
    }

    req.end();
  });
}

/**
 * Kiểm tra trạng thái Key & Lấy thông tin Proxy từ TMProxy (tmproxy.com)
 * @param {string} apiKey
 * @returns {Promise<object>}
 */
async function checkTMProxy(apiKey) {
  try {
    const res = await makeRequest('https://tmproxy.com/api/proxy/get-current-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { api_key: apiKey.trim() }
    });

    if (res.json) {
      const code = res.json.code;
      if (code === 0 && res.json.data) {
        const d = res.json.data;
        const proxyStr = d.https || d.socks5 || '';
        return {
          success: true,
          status: 'active',
          proxy: proxyStr,
          parsedProxy: parseProxyString(proxyStr),
          countryCode: 'VN', // TMProxy chủ yếu IP Việt Nam
          location: d.location_name || 'Vietnam',
          timeoutSeconds: d.timeout || 0,
          nextRequestSeconds: d.next_request || 0,
          expiresAt: d.expired_at || null,
          canRotate: true,
          message: res.json.message || 'Key TMProxy hoạt động bình thường'
        };
      } else if (code === 5) {
        // Chưa có proxy hoặc cần get new
        return {
          success: true,
          status: 'active_need_rotate',
          proxy: null,
          canRotate: true,
          message: 'Key hợp lệ nhưng chưa lấy IP. Bấm [Đổi IP] để nhận proxy mới!'
        };
      } else {
        return {
          success: false,
          status: 'error',
          error: res.json.message || `Lỗi TMProxy (Code: ${code})`
        };
      }
    }

    return { success: false, status: 'error', error: 'Không nhận được dữ liệu JSON từ TMProxy' };
  } catch (err) {
    return { success: false, status: 'error', error: err.message };
  }
}

/**
 * Kiểm tra Key & Lấy Proxy từ TinProxy (tinproxy.com)
 * @param {string} apiKey
 * @returns {Promise<object>}
 */
async function checkTinProxy(apiKey) {
  try {
    const url = `https://api.tinproxy.com/user/get-proxy?api_key=${encodeURIComponent(apiKey.trim())}`;
    const res = await makeRequest(url);

    if (res.json) {
      if (res.json.status === 'success' || res.json.code === 0) {
        const d = res.json.data || res.json;
        const proxyStr = d.http_ipv4 || d.http || d.socks5 || '';
        return {
          success: true,
          status: 'active',
          proxy: proxyStr,
          parsedProxy: parseProxyString(proxyStr),
          countryCode: d.country || 'VN',
          timeoutSeconds: d.next_change || d.timeout || 0,
          canRotate: true,
          message: 'Key TinProxy hoạt động mượt mà'
        };
      } else {
        return {
          success: false,
          status: 'error',
          error: res.json.message || 'Key TinProxy không hợp lệ hoặc đã hết hạn'
        };
      }
    }

    return { success: false, status: 'error', error: 'Không nhận được phản hồi từ TinProxy' };
  } catch (err) {
    return { success: false, status: 'error', error: err.message };
  }
}

/**
 * Kiểm tra Key & Lấy danh sách Proxy từ Webshare.io (Quốc tế / US / EU)
 * @param {string} apiKey
 * @returns {Promise<object>}
 */
async function checkWebshare(apiKey) {
  try {
    const url = 'https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=10';
    const res = await makeRequest(url, {
      headers: {
        'Authorization': `Token ${apiKey.trim()}`
      }
    });

    if (res.statusCode === 200 && res.json && Array.isArray(res.json.results)) {
      const results = res.json.results;
      if (results.length === 0) {
        return {
          success: true,
          status: 'active_empty',
          proxy: null,
          totalProxies: 0,
          message: 'Key Webshare hợp lệ nhưng chưa có proxy nào trong gói'
        };
      }

      const first = results[0];
      const proxyStr = `http://${first.username}:${first.password}@${first.proxy_address}:${first.port}`;
      return {
        success: true,
        status: 'active',
        proxy: proxyStr,
        parsedProxy: {
          protocol: 'http',
          host: first.proxy_address,
          port: first.port,
          user: first.username,
          pass: first.password
        },
        countryCode: (first.country_code || 'US').toUpperCase(),
        totalProxies: res.json.count || results.length,
        proxiesList: results.map(p => `http://${p.username}:${p.password}@${p.proxy_address}:${p.port}`),
        message: `Key Webshare ACTIVE! Gói có ${res.json.count || results.length} Proxy Quốc Tế`
      };
    } else if (res.statusCode === 401 || res.statusCode === 403) {
      return { success: false, status: 'expired', error: 'API Key Webshare không hợp lệ hoặc bị từ chối' };
    }

    return { success: false, status: 'error', error: res.json?.detail || `HTTP ${res.statusCode}` };
  } catch (err) {
    return { success: false, status: 'error', error: err.message };
  }
}

/**
 * Kiểm tra Key từ ProxyNo1 (proxyno1.com)
 * @param {string} apiKey
 * @returns {Promise<object>}
 */
async function checkProxyNo1(apiKey) {
  try {
    const url = `http://api.proxyno1.com/get-proxy?key=${encodeURIComponent(apiKey.trim())}`;
    const res = await makeRequest(url);

    if (res.json) {
      if (res.json.status === 'success' || res.json.code === 0) {
        const proxyStr = res.json.data || res.json.proxy || '';
        return {
          success: true,
          status: 'active',
          proxy: proxyStr,
          parsedProxy: parseProxyString(proxyStr),
          countryCode: 'VN',
          canRotate: true,
          message: 'Key ProxyNo1 hợp lệ'
        };
      }
      return { success: false, status: 'error', error: res.json.message || 'Lỗi ProxyNo1' };
    }

    // Nếu trả về plain text
    const text = res.data.trim();
    if (text.includes(':')) {
      return {
        success: true,
        status: 'active',
        proxy: text,
        parsedProxy: parseProxyString(text),
        countryCode: 'VN',
        message: 'Lấy proxy từ ProxyNo1 thành công'
      };
    }

    return { success: false, status: 'error', error: text || 'Phản hồi không xác định' };
  } catch (err) {
    return { success: false, status: 'error', error: err.message };
  }
}

/**
 * Kiểm tra Key từ ProxyV6 (proxyv6.net - Key xoay IPv6/IPv4)
 * Endpoint chính thức: https://api.proxyv6.net/key/get-new-ip?api_key_rotating={API_KEY}
 * @param {string} apiKey
 * @returns {Promise<object>}
 */
async function checkProxyV6(apiKey) {
  const cleanKey = apiKey.trim();
  try {
    const url = `https://api.proxyv6.net/key/get-new-ip?api_key_rotating=${encodeURIComponent(cleanKey)}`;
    const res = await makeRequest(url);

    if (res.json) {
      if (res.json.error === false || res.json.status === 'success' || res.json.code === 0 || (!res.json.error && res.json.data)) {
        const d = res.json.data || res.json;
        let proxyStr = '';
        if (typeof d === 'string') {
          proxyStr = d;
        } else if (d.host && d.port) {
          proxyStr = (d.user && d.pass) 
            ? `http://${d.user}:${d.pass}@${d.host}:${d.port}`
            : `http://${d.host}:${d.port}`;
        } else if (d.ip && d.port) {
          proxyStr = (d.user && d.pass)
            ? `http://${d.user}:${d.pass}@${d.ip}:${d.port}`
            : `http://${d.ip}:${d.port}`;
        } else if (d.http || d.proxy) {
          proxyStr = d.http || d.proxy;
        }

        return {
          success: true,
          status: 'active',
          proxy: proxyStr,
          parsedProxy: parseProxyString(proxyStr),
          countryCode: d.country || d.country_code || 'VN',
          location: d.location || 'Vietnam',
          timeoutSeconds: d.timeout || d.next_request || 0,
          canRotate: true,
          message: 'Key ProxyV6 hoạt động mượt mà!'
        };
      }

      // Xử lý các mã lỗi cụ thể từ máy chủ ProxyV6
      const msg = res.json.message || 'Lỗi không xác định từ ProxyV6';
      if (msg === 'KEY_NOT_EXISTS') {
        return {
          success: false,
          status: 'not_found',
          error: 'Mã lỗi [KEY_NOT_EXISTS]: API Key này không tồn tại trên hệ thống ProxyV6 (có thể key đã hết hạn, đã bị xóa, hoặc đây là Proxy Tĩnh chứ không phải Key Xoay).'
        };
      }
      return {
        success: false,
        status: 'error',
        error: `Máy chủ ProxyV6 phản hồi: ${msg}`
      };
    }

    // Nếu trả về plain text ip:port
    const text = (res.data || '').trim();
    if (text.includes(':')) {
      return {
        success: true,
        status: 'active',
        proxy: text,
        parsedProxy: parseProxyString(text),
        countryCode: 'VN',
        message: 'Lấy proxy từ ProxyV6 thành công!'
      };
    }

    return {
      success: false,
      status: 'error',
      error: res.data || `Lỗi kết nối tới ProxyV6 (HTTP ${res.statusCode})`
    };
  } catch (err) {
    return { success: false, status: 'error', error: `Lỗi kết nối tới máy chủ ProxyV6: ${err.message}` };
  }
}

/**
 * Kiểm tra Nhà Bán Tùy Biến (Custom / Generic Web Seller API)
 * @param {string} apiKey
 * @param {string} apiUrl - Ví dụ: https://myprovider.com/api/get-proxy?key={API_KEY}
 * @returns {Promise<object>}
 */
async function checkCustomProvider(apiKey, apiUrl) {
  if (!apiUrl || !apiUrl.trim()) {
    return { success: false, status: 'error', error: 'Vui lòng nhập API Endpoint của bên bán proxy' };
  }

  // Tự động nhận diện nếu người dùng dán URL của ProxyV6 vào ô Custom
  if (apiUrl.includes('proxyv6.net')) {
    return await checkProxyV6(apiKey);
  }

  let finalUrl = apiUrl.replace(/{API_KEY}/g, encodeURIComponent(apiKey.trim()));
  if (!finalUrl.includes('?') && !apiUrl.includes('{API_KEY}')) {
    finalUrl += `?key=${encodeURIComponent(apiKey.trim())}`;
  }

  try {
    const res = await makeRequest(finalUrl);

    // 1. Nếu là JSON
    if (res.json) {
      const d = res.json.data || res.json.proxy || res.json.result || res.json;
      let candidateProxy = typeof d === 'string' ? d : (d.http || d.proxy || d.ip_port || '');

      if (candidateProxy && candidateProxy.includes(':')) {
        return {
          success: true,
          status: 'active',
          proxy: candidateProxy,
          parsedProxy: parseProxyString(candidateProxy),
          countryCode: res.json.country || 'US',
          message: 'Kết nối và lấy proxy từ API bên bán thành công!'
        };
      }

      return {
        success: true,
        status: 'active',
        details: res.json,
        message: 'API trả về phản hồi hợp lệ'
      };
    }

    // 2. Nếu trả về text chứa ip:port
    const cleanText = res.data.trim();
    if (cleanText.includes(':')) {
      return {
        success: true,
        status: 'active',
        proxy: cleanText,
        parsedProxy: parseProxyString(cleanText),
        countryCode: 'US',
        message: 'Lấy Proxy thành công từ phản hồi dạng text'
      };
    }

    return { success: false, status: 'error', error: `Phản hồi từ bên bán: ${cleanText.substring(0, 100)}` };
  } catch (err) {
    return { success: false, status: 'error', error: err.message };
  }
}

/**
 * Điều phối kiểm tra trạng thái API Key theo từng bên bán
 * @param {string} providerType - 'tmproxy', 'tinproxy', 'proxyv6', 'webshare', 'proxyno1', 'custom'
 * @param {string} apiKey
 * @param {string} [apiUrl=null]
 * @returns {Promise<object>}
 */
async function dispatchCheckProvider(providerType, apiKey, apiUrl = null) {
  if (!apiKey || !apiKey.trim()) {
    return { success: false, error: 'Chưa nhập API Key của bên bán proxy!' };
  }

  const type = (providerType || 'custom').toLowerCase();

  switch (type) {
    case 'proxyv6':
      return await checkProxyV6(apiKey);
    case 'tmproxy':
      return await checkTMProxy(apiKey);
    case 'tinproxy':
      return await checkTinProxy(apiKey);
    case 'webshare':
      return await checkWebshare(apiKey);
    case 'proxyno1':
      return await checkProxyNo1(apiKey);
    case 'custom':
    default:
      return await checkCustomProvider(apiKey, apiUrl);
  }
}

module.exports = {
  dispatchCheckProvider,
  checkProxyV6,
  checkTMProxy,
  checkTinProxy,
  checkWebshare,
  checkProxyNo1,
  checkCustomProvider
};

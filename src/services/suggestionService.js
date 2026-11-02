const db = require('../config/db');
const { decrypt } = require('./cryptoService');

/**
 * Đánh giá độ mạnh mật khẩu (0 đến 100 điểm)
 * @param {string} password
 * @returns {{ score: number, label: 'Yếu'|'Trung bình'|'Mạnh'|'Rất mạnh', suggestions: string[] }}
 */
function evaluatePasswordStrength(password) {
  if (!password) {
    return { score: 0, label: 'Yếu', suggestions: ['Chưa thiết lập mật khẩu'] };
  }

  let score = 0;
  const suggestions = [];

  if (password.length >= 8) score += 20;
  else suggestions.push('Mật khẩu nên có ít nhất 8 ký tự');

  if (password.length >= 12) score += 15;
  if (/[A-Z]/.test(password)) score += 20;
  else suggestions.push('Cần bổ sung chữ in hoa (A-Z)');

  if (/[a-z]/.test(password)) score += 15;
  else suggestions.push('Cần bổ sung chữ thường (a-z)');

  if (/[0-9]/.test(password)) score += 15;
  else suggestions.push('Cần bổ sung chữ số (0-9)');

  if (/[^A-Za-z0-9]/.test(password)) score += 15;
  else suggestions.push('Cần bổ sung ký tự đặc biệt (!@#$%^&*)');

  let label = 'Yếu';
  if (score >= 80) label = 'Rất mạnh';
  else if (score >= 60) label = 'Mạnh';
  else if (score >= 40) label = 'Trung bình';

  return { score, label, suggestions };
}

/**
 * Phân tích và đưa ra toàn bộ gợi ý bảo mật cho hệ thống
 * @param {string} [userId=null] - Nếu truyền vào, chỉ phân tích tài khoản của User đó
 * @returns {object}
 */
function analyzeSecuritySuggestions(userId = null) {
  let query = 'SELECT * FROM accounts';
  const params = [];

  if (userId) {
    query = `
      SELECT a.* FROM accounts a
      JOIN user_account_permissions p ON a.id = p.account_id
      WHERE p.user_id = ?
    `;
    params.push(userId);
  }

  const accounts = db.prepare(query).all(...params);

  const collisions = [];
  const missing2FA = [];
  const weakPasswords = [];
  const reusedPasswordsMap = new Map(); // password -> array of accounts
  const deadOrSlowProxies = [];

  // Phân tích trùng lặp Proxy IP theo Platform (Tránh checkpoint liên đới)
  const proxyPlatformMap = new Map(); // key: `${platform}:${proxy_host_or_ip}` -> [acc1, acc2]

  for (const acc of accounts) {
    // 1. Kiểm tra 2FA
    if (!acc.totp_secret_encrypted || acc.totp_secret_encrypted.trim() === '') {
      missing2FA.push({
        accountId: acc.id,
        accountName: acc.account_name || acc.username,
        platform: acc.platform,
        level: 'warning',
        message: `Tài khoản ${acc.platform.toUpperCase()} (${acc.account_name || acc.username}) chưa kích hoạt 2FA (TOTP)`
      });
    }

    // 2. Kiểm tra Proxy Collision
    const effectiveProxy = acc.last_ip || (acc.proxy_host ? `${acc.proxy_host}:${acc.proxy_port}` : null);
    if (effectiveProxy) {
      const groupKey = `${acc.platform.toLowerCase()}@${effectiveProxy}`;
      if (!proxyPlatformMap.has(groupKey)) {
        proxyPlatformMap.set(groupKey, []);
      }
      proxyPlatformMap.get(groupKey).push({
        id: acc.id,
        name: acc.account_name || acc.username,
        platform: acc.platform
      });
    }

    // 3. Kiểm tra Độ mạnh mật khẩu & Mật khẩu tái sử dụng
    if (acc.password_encrypted) {
      const plainPass = decrypt(acc.password_encrypted);
      if (plainPass) {
        const passEval = evaluatePasswordStrength(plainPass);
        if (passEval.score < 50) {
          weakPasswords.push({
            accountId: acc.id,
            accountName: acc.account_name || acc.username,
            platform: acc.platform,
            score: passEval.score,
            level: 'danger',
            message: `Mật khẩu yếu (${passEval.score}/100): ${passEval.suggestions.join(', ')}`
          });
        }

        if (!reusedPasswordsMap.has(plainPass)) {
          reusedPasswordsMap.set(plainPass, []);
        }
        reusedPasswordsMap.get(plainPass).push({
          id: acc.id,
          name: acc.account_name || acc.username,
          platform: acc.platform
        });
      }
    }

    // 4. Kiểm tra Proxy chậm hoặc chết
    if (acc.proxy_latency && acc.proxy_latency > 2500) {
      deadOrSlowProxies.push({
        accountId: acc.id,
        accountName: acc.account_name || acc.username,
        latency: acc.proxy_latency,
        level: 'warning',
        message: `Proxy của ${acc.account_name || acc.username} có độ trễ rất cao (${acc.proxy_latency}ms)`
      });
    }
  }

  // Tổng hợp các vụ va chạm Proxy (Proxy Collisions)
  for (const [key, matchedAccounts] of proxyPlatformMap.entries()) {
    if (matchedAccounts.length > 1) {
      const [platform, proxyAddr] = key.split('@');
      collisions.push({
        platform: platform.toUpperCase(),
        proxy: proxyAddr,
        count: matchedAccounts.length,
        accounts: matchedAccounts,
        level: 'critical',
        message: `Phát hiện ${matchedAccounts.length} tài khoản ${platform.toUpperCase()} đang dùng chung Proxy (${proxyAddr}). Nguy cơ bị khóa checkpoint hàng loạt!`
      });
    }
  }

  // Tổng hợp mật khẩu tái sử dụng
  const reusedList = [];
  for (const [, matchedAccs] of reusedPasswordsMap.entries()) {
    if (matchedAccs.length > 1) {
      reusedList.push({
        count: matchedAccs.length,
        accounts: matchedAccs,
        level: 'danger',
        message: `Phát hiện ${matchedAccs.length} tài khoản đang dùng chung mật khẩu (${matchedAccs.map(a => a.name).join(', ')})`
      });
    }
  }

  // Tính điểm tổng thể an ninh hệ thống (Health Score 0-100)
  let healthScore = 100;
  healthScore -= collisions.length * 15;
  healthScore -= missing2FA.length * 8;
  healthScore -= weakPasswords.length * 5;
  healthScore -= reusedList.length * 10;
  healthScore -= deadOrSlowProxies.length * 3;
  if (healthScore < 0) healthScore = 0;

  return {
    healthScore,
    totalAccounts: accounts.length,
    summary: {
      collisionsCount: collisions.length,
      missing2FACount: missing2FA.length,
      weakPasswordsCount: weakPasswords.length,
      reusedPasswordsCount: reusedList.length,
      slowProxiesCount: deadOrSlowProxies.length
    },
    alerts: [
      ...collisions,
      ...reusedList,
      ...weakPasswords,
      ...missing2FA,
      ...deadOrSlowProxies
    ]
  };
}

module.exports = {
  evaluatePasswordStrength,
  analyzeSecuritySuggestions
};

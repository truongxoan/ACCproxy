const OTPAuth = require('otpauth');

/**
 * Chuẩn hóa Base32 Secret: Bỏ khoảng trắng, dấu gạch nối và chuyển thành chữ in hoa
 * @param {string} rawSecret
 * @returns {string}
 */
function cleanSecret(rawSecret) {
  if (!rawSecret || typeof rawSecret !== 'string') return '';
  return rawSecret.replace(/[\s\-]/g, '').toUpperCase();
}

/**
 * Sinh mã 2FA 6 số và số giây còn lại trong chu kỳ 30s
 * @param {string} secretKey - Khóa bí mật Base32
 * @returns {{ code: string, remainingSeconds: number, valid: boolean }}
 */
function generateToken(secretKey) {
  const normalized = cleanSecret(secretKey);
  const epoch = Math.floor(Date.now() / 1000);
  const remainingSeconds = 30 - (epoch % 30);

  if (!normalized) {
    return {
      code: '------',
      remainingSeconds,
      valid: false
    };
  }

  try {
    const totp = new OTPAuth.TOTP({
      issuer: 'AccountManager',
      label: 'User',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(normalized)
    });

    const token = totp.generate();
    return {
      code: token,
      remainingSeconds,
      valid: true
    };
  } catch (error) {
    return {
      code: 'ERR-2FA',
      remainingSeconds,
      valid: false,
      error: error.message
    };
  }
}

/**
 * Sinh mã 2FA hàng loạt cho một danh sách tài khoản
 * @param {Array<{ id: string, totpSecret: string }>} accounts
 * @returns {Object.<string, { code: string, remainingSeconds: number, valid: boolean }>}
 */
function batchGenerate(accounts) {
  const result = {};
  for (const acc of accounts) {
    result[acc.id] = generateToken(acc.totpSecret);
  }
  return result;
}

module.exports = {
  cleanSecret,
  generateToken,
  batchGenerate
};

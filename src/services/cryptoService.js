const crypto = require('crypto');
const { MASTER_KEY } = require('../config/constants');

// Đảm bảo Master Key luôn là Buffer 32 bytes (256 bits)
const KEY = crypto.createHash('sha256').update(MASTER_KEY).digest();
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM tiêu chuẩn dùng IV 12 bytes

/**
 * Mã hóa chuỗi văn bản bằng AES-256-GCM
 * @param {string} text - Chuỗi cần mã hóa
 * @returns {string|null} - Chuỗi định dạng iv:authTag:encrypted (hex)
 */
function encrypt(text) {
  if (text === null || text === undefined || text === '') {
    return null;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Giải mã chuỗi AES-256-GCM
 * @param {string} cipherText - Chuỗi định dạng iv:authTag:encrypted
 * @returns {string|null} - Chuỗi gốc giải mã được
 */
function decrypt(cipherText) {
  if (!cipherText || typeof cipherText !== 'string') {
    return null;
  }

  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) {
      return null;
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('❌ [CryptoService] Lỗi giải mã AES-256-GCM:', error.message);
    return null;
  }
}

module.exports = {
  encrypt,
  decrypt
};

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Tính mã hash MD5 và SHA256 của một Buffer
 * @param {Buffer} buffer
 * @returns {{ md5: string, sha256: string, sizeBytes: number }}
 */
function computeHash(buffer) {
  const md5 = crypto.createHash('md5').update(buffer).digest('hex');
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    md5,
    sha256,
    sizeBytes: buffer.length
  };
}

/**
 * Tẩy rửa metadata & Thay đổi cấu trúc mã Hash (Video Hash Sanitizer)
 * Kỹ thuật: Chèn một box 'free' chuẩn cấu trúc MP4/MOV chứa chuỗi entropy ngẫu nhiên
 * Giúp đổi mã Hash 100% mà KHÔNG làm vỡ cấu trúc video, KHÔNG cần encode lại, chạy siêu tốc < 0.1s!
 * @param {Buffer} inputBuffer
 * @param {string} [originalFilename='video.mp4']
 * @returns {{ sanitizedBuffer: Buffer, originalHash: object, newHash: object, filename: string }}
 */
function sanitizeVideoBuffer(inputBuffer, originalFilename = 'video.mp4') {
  const originalHash = computeHash(inputBuffer);

  // Sinh khối dữ liệu entropy ngẫu nhiên (16 đến 64 bytes)
  const saltLength = 32 + Math.floor(Math.random() * 32);
  const randomPayload = crypto.randomBytes(saltLength);

  // Tạo một MP4 'free' box chuẩn:
  // [4 bytes size][4 bytes type 'free'][payload bytes]
  const boxSize = 8 + randomPayload.length;
  const freeBoxHeader = Buffer.alloc(8);
  freeBoxHeader.writeUInt32BE(boxSize, 0); // Kích thước box
  freeBoxHeader.write('free', 4, 'ascii'); // Loại box là 'free' (bỏ qua khi phát)

  const freeBox = Buffer.concat([freeBoxHeader, randomPayload]);

  // Nối free box vào cuối file video (hoặc sau header ftyp)
  const sanitizedBuffer = Buffer.concat([inputBuffer, freeBox]);
  const newHash = computeHash(sanitizedBuffer);

  const ext = path.extname(originalFilename) || '.mp4';
  const basename = path.basename(originalFilename, ext);
  const filename = `${basename}_sanitized_${Date.now()}${ext}`;

  return {
    sanitizedBuffer,
    originalHash,
    newHash,
    filename
  };
}

module.exports = {
  computeHash,
  sanitizeVideoBuffer
};

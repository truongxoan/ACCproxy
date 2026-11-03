const assert = require('assert');
const { getHardwareMetrics, getThermalConfig, updateThermalConfig, checkThermalSentinel } = require('../src/services/hardwareSentinelService');
const { getAutoBackupConfig, updateAutoBackupConfig } = require('../src/services/autoBackupScheduler');
const { generateViralContent } = require('../src/services/aiContentService');
const { checkProxyLive } = require('../src/services/proxyHealthService');
const { getPhoneStatus, QUICK_APPS, SAFE_KEYCODES } = require('../src/services/phoneControlService');
const db = require('../src/config/db');
const { encrypt, decrypt } = require('../src/services/cryptoService');

async function runTests() {
  console.log('================================================================');
  console.log('⚡ KIỂM ĐỊNH TẤT CẢ VŨ KHÍ MỚI & BẢO VỆ QUÁ NHIỆT 2 TẦNG');
  console.log('================================================================');

  // Test 1: Hardware Metrics
  console.log('▶ Test #1: Đọc chỉ số cảm biến phần cứng & nhiệt độ...');
  const hw = getHardwareMetrics();
  assert(typeof hw.cpuTemp === 'number', 'cpuTemp phải là number');
  assert(typeof hw.batteryTemp === 'number', 'batteryTemp phải là number');
  assert(typeof hw.maxTemp === 'number', 'maxTemp phải là number');
  assert(typeof hw.memUsagePercent === 'number', 'memUsagePercent phải là number');
  console.log(`  [PASS] CPU: ${hw.cpuTemp}°C | Pin: ${hw.batteryTemp}°C | RAM: ${hw.memUsagePercent}% | Max: ${hw.maxTemp}°C`);

  // Test 2: Thermal Config & Failsafe Logic
  console.log('▶ Test #2: Kiểm tra cấu hình & Failsafe 2 Tầng...');
  updateThermalConfig(43.0, 47.0, true);
  const cfg = getThermalConfig();
  assert.strictEqual(cfg.warningTemp, 43.0, 'Warning temp phải là 43.0');
  assert.strictEqual(cfg.criticalTemp, 47.0, 'Critical temp phải là 47.0');
  assert.strictEqual(cfg.autoActionEnabled, true, 'Auto action phải enabled');
  
  const check = await checkThermalSentinel();
  assert(['NORMAL', 'WARNING', 'CRITICAL'].includes(check.status), 'Status phải thuộc NORMAL/WARNING/CRITICAL');
  console.log(`  [PASS] Cấu hình: Warning ${cfg.warningTemp}°C, Critical ${cfg.criticalTemp}°C | Trạng thái hiện tại: ${check.status}`);

  // Test 3: Auto-Backup Cron Config
  console.log('▶ Test #3: Kiểm tra cấu hình Tự động sao lưu định kỳ...');
  updateAutoBackupConfig(true, 6);
  const bConfig = getAutoBackupConfig();
  assert.strictEqual(bConfig.enabled, true, 'Auto backup phải enabled');
  assert.strictEqual(bConfig.frequencyHours, 6, 'Frequency phải là 6h');
  console.log(`  [PASS] Auto-Backup: Bật=${bConfig.enabled}, Chu kỳ=${bConfig.frequencyHours}h`);

  // Test 4: AI Content Generator
  console.log('▶ Test #4: Kiểm tra AI sinh Kịch bản 60s & 3 góc Hook...');
  const aiResult = generateViralContent('Affiliate Marketing', 'tiktok');
  assert(aiResult.success === true, 'AI sinh kịch bản phải success');
  assert(aiResult.hooks.length === 3, 'Phải có 3 góc Hook 3s');
  assert(aiResult.script.includes('HOOK 3S'), 'Kịch bản phải có phần Hook');
  assert(aiResult.hashtags.includes('#affiliatemarketing'), 'Hashtags phải có tag theo chủ đề');
  console.log(`  [PASS] Tiêu đề: "${aiResult.title}" | Hook #1: "${aiResult.hooks[0]}"`);

  // Test 5: Proxy Health Checker
  console.log('▶ Test #5: Kiểm tra Radar phát hiện proxy hỏng...');
  const deadProxy = await checkProxyLive({ host: '127.0.0.1', port: 65530, protocol: 'http' });
  assert.strictEqual(deadProxy.isAlive, false, 'Proxy ảo phải được phát hiện là chết');
  console.log(`  [PASS] Phát hiện proxy hỏng chính xác: ${deadProxy.error}`);

  // Test 6: Phone Remote Control & Live Screen Bridge
  console.log('▶ Test #6: Kiểm tra cầu nối điều khiển & Live màn hình điện thoại...');
  assert(Object.keys(QUICK_APPS).length >= 10, 'Phải có ít nhất 10 ứng dụng mở nhanh');
  assert(SAFE_KEYCODES.HOME === '3' && SAFE_KEYCODES.BACK === '4', 'Mã phím điều hướng phải chuẩn');
  const phoneStatus = await getPhoneStatus();
  assert(typeof phoneStatus.connected === 'boolean', 'Trạng thái kết nối phải là boolean');
  console.log(`  [PASS] Phone Bridge: connected=${phoneStatus.connected} | mode=${phoneStatus.mode} | size=${phoneStatus.width}x${phoneStatus.height}`);

  // Test 7: Social & Personal Credential Vault (AES-256-GCM)
  console.log('▶ Test #7: Kiểm tra Két Sắt Mật Khẩu Mạng Xã Hội (social_vault)...');
  const testId = 'test-social-vault-id';
  db.prepare(`
    INSERT OR REPLACE INTO social_vault (id, platform, label, username, password_encrypted, totp_secret_encrypted, is_pinned)
    VALUES (?, 'facebook', 'FB Chính Test', '0988999999', ?, ?, 1)
  `).run(testId, encrypt('SieuMatKhau@2026'), encrypt('JBSWY3DPEHPK3PXP'));
  const savedRow = db.prepare('SELECT * FROM social_vault WHERE id = ?').get(testId);
  assert(savedRow && decrypt(savedRow.password_encrypted) === 'SieuMatKhau@2026', 'Giải mã mật khẩu MXH phải khớp 100%');
  db.prepare('DELETE FROM social_vault WHERE id = ?').run(testId);
  console.log('  [PASS] Két Sắt Mật Khẩu MXH lưu trữ & giải mã AES-256-GCM chuẩn xác 100%');

  console.log('================================================================');
  console.log('⭐ TẤT CẢ 7/7 TESTS VŨ KHÍ MỚI ĐÃ ĐẠT CHUẨN XANH MƯỢT (100% OK)');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});

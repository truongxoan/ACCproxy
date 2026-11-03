const fs = require('fs');
const os = require('os');
const { execSync, exec } = require('child_process');
const db = require('../config/db');
const { sendTelegramMessage } = require('./telegramService');

/**
 * Đọc chỉ số phần cứng và nhiệt độ thực tế từ sysfs / dumpsys
 * @returns {{ cpuTemp: number, batteryTemp: number, batteryLevel: number, maxTemp: number, memUsagePercent: number, freeMemMb: number, totalMemMb: number, uptimeHours: string, platform: string, arch: string }}
 */
function getHardwareMetrics() {
  let cpuTemp = null;
  let batteryTemp = null;
  let batteryLevel = null;

  // 1. Quét nhiệt độ thermal zones (Linux / Android sysfs)
  const thermalZonePaths = [
    '/sys/class/thermal/thermal_zone0/temp',
    '/sys/class/thermal/thermal_zone1/temp',
    '/sys/class/thermal/thermal_zone2/temp',
    '/sys/class/power_supply/battery/temp'
  ];

  for (const p of thermalZonePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = parseInt(fs.readFileSync(p, 'utf8').trim(), 10);
        if (!isNaN(raw) && raw > 0) {
          let t = raw;
          if (t > 1000) t = t / 1000;
          else if (t > 100) t = t / 10;

          if (p.includes('battery')) {
            batteryTemp = Math.round(t * 10) / 10;
          } else if (cpuTemp === null || t > cpuTemp) {
            cpuTemp = Math.round(t * 10) / 10;
          }
        }
      }
    } catch (e) {}
  }

  // 2. Dự phòng qua dumpsys battery trên Android
  if (batteryTemp === null || batteryLevel === null) {
    try {
      const dump = execSync('dumpsys battery 2>/dev/null', { timeout: 1500 }).toString();
      const tempMatch = dump.match(/temperature:\s*(\d+)/i);
      const levelMatch = dump.match(/level:\s*(\d+)/i);
      if (tempMatch) batteryTemp = Math.round((parseInt(tempMatch[1], 10) / 10) * 10) / 10;
      if (levelMatch) batteryLevel = parseInt(levelMatch[1], 10);
    } catch (e) {}
  }

  // 3. Fallback cho môi trường Windows development nếu chưa có cảm biến
  if (cpuTemp === null && process.platform === 'win32') {
    cpuTemp = 38.2;
    batteryTemp = 32.5;
    batteryLevel = 100;
  }

  const finalCpu = cpuTemp || 38.0;
  const finalBattery = batteryTemp || 32.0;
  // maxTemp phản ánh trực tiếp nhiệt độ Pin (linh kiện nhạy cảm nhất về an toàn phần cứng / sạc trên điện thoại)
  const maxTemp = finalBattery;

  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const memUsagePercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

  return {
    cpuTemp: finalCpu,
    batteryTemp: finalBattery,
    batteryLevel: batteryLevel !== null ? batteryLevel : 100,
    maxTemp,
    memUsagePercent,
    freeMemMb: Math.round(freeMem / (1024 * 1024)),
    totalMemMb: Math.round(totalMem / (1024 * 1024)),
    uptimeHours: (os.uptime() / 3600).toFixed(1),
    platform: os.platform(),
    arch: os.arch()
  };
}

/**
 * Lấy cấu hình ngưỡng nhiệt độ từ system_settings
 */
function getThermalConfig() {
  const warnRow = db.prepare("SELECT value FROM system_settings WHERE key = 'thermal_warning_temp'").get();
  const critRow = db.prepare("SELECT value FROM system_settings WHERE key = 'thermal_critical_temp'").get();
  const countRow = db.prepare("SELECT value FROM system_settings WHERE key = 'thermal_overheat_count'").get();
  const lastRebootRow = db.prepare("SELECT value FROM system_settings WHERE key = 'thermal_last_reboot_at'").get();
  const autoActionRow = db.prepare("SELECT value FROM system_settings WHERE key = 'thermal_auto_action'").get();

  return {
    warningTemp: warnRow ? parseFloat(warnRow.value) : 44.0,
    criticalTemp: critRow ? parseFloat(critRow.value) : 48.0,
    overheatCount: countRow ? parseInt(countRow.value, 10) : 0,
    lastRebootAt: lastRebootRow ? parseInt(lastRebootRow.value, 10) : 0,
    autoActionEnabled: autoActionRow ? autoActionRow.value === '1' : true
  };
}

/**
 * Lưu trạng thái giám sát nhiệt độ
 */
function saveThermalState(overheatCount, lastRebootAt = null) {
  const stmt = db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run('thermal_overheat_count', String(overheatCount));
  if (lastRebootAt !== null) {
    stmt.run('thermal_last_reboot_at', String(lastRebootAt));
  }
}

/**
 * Cập nhật cấu hình ngưỡng nhiệt độ do người dùng thiết lập
 */
function updateThermalConfig(warningTemp, criticalTemp, autoActionEnabled = true) {
  const stmt = db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);

  if (warningTemp) stmt.run('thermal_warning_temp', String(warningTemp));
  if (criticalTemp) stmt.run('thermal_critical_temp', String(criticalTemp));
  stmt.run('thermal_auto_action', autoActionEnabled ? '1' : '0');
}

let isActionExecuting = false;

/**
 * Giao thức Kiểm tra nhiệt độ và kích hoạt Failsafe 2 Tầng:
 * - Tầng 1: Vượt ngưỡng critical lần 1 -> Khởi động lại Server (PM2 restart / process recycle)
 * - Tầng 2: Vẫn quá nhiệt sau lần 1 -> TẮT HẲN SERVER (Emergency Shutdown)
 * @returns {Promise<{ metrics: object, status: string, actionTaken: string | null }>}
 */
async function checkThermalSentinel() {
  const metrics = getHardwareMetrics();
  const config = getThermalConfig();
  const now = Date.now();

  let status = 'NORMAL';
  let actionTaken = null;

  // Đánh giá ngưỡng theo đặc tính phần cứng (Pin nguy hiểm khi >= 48°C; Snapdragon CPU chịu nhiệt đến 85°C)
  const isCritical = (metrics.batteryTemp >= config.criticalTemp) || (metrics.cpuTemp >= 82.0);
  const isWarning = (metrics.batteryTemp >= config.warningTemp) || (metrics.cpuTemp >= 70.0);

  // Nếu nhiệt độ đã hạ về mức an toàn (Pin < 42°C và CPU < 65°C), reset biến đếm quá nhiệt
  if (metrics.batteryTemp < 42.0 && metrics.cpuTemp < 65.0 && config.overheatCount > 0) {
    saveThermalState(0);
    const safeMsg = `
✅ <b>[HẠ NHIỆT AN TOÀN] MÁY CHỦ ĐIỆN THOẠI ĐÃ MÁT TRỞ LẠI!</b> ❄️
---------------------------------------------
🌡️ <b>Nhiệt độ hiện tại:</b> Pin: ${metrics.batteryTemp}°C | CPU: ${metrics.cpuTemp}°C
🔋 <b>Mức Pin:</b> ${metrics.batteryLevel}%
💾 <b>RAM sử dụng:</b> ${metrics.memUsagePercent}% (${metrics.freeMemMb} MB trống)
🛡️ <b>Trạng thái:</b> Đã reset bộ đếm cảnh báo quá nhiệt về 0. Hệ thống hoạt động bình thường!
`.trim();
    await sendTelegramMessage(safeMsg);
    return { metrics, status: 'NORMAL', actionTaken: 'RESET_OVERHEAT_COUNT' };
  }

  // Ngưỡng 1: Cảnh báo nóng máy
  if (isWarning && !isCritical) {
    status = 'WARNING';
    return { metrics, status, actionTaken: null };
  }

  // Ngưỡng 2: Quá nhiệt nghiêm trọng
  if (isCritical && config.autoActionEnabled && !isActionExecuting) {
    status = 'CRITICAL';
    const cooldownWindow = 15 * 60 * 1000; // 15 phút
    const timeSinceLastReboot = now - config.lastRebootAt;

    if (config.overheatCount === 0 || timeSinceLastReboot > cooldownWindow) {
      // ===== LẦN 1: KHỞI ĐỘNG LẠI SERVER ĐỂ HẠ TẢI =====
      isActionExecuting = true;
      actionTaken = 'RESTART_SERVER';
      saveThermalState(1, now);

      const alertMsg = `
🚨 <b>[BÁO ĐỘNG ĐỎ - QUÁ NHIỆT LẦN 1] MÁY CHỦ ĐIỆN THOẠI QUÁ NÓNG!</b> 🔥
---------------------------------------------
🌡️ <b>Nhiệt độ chạm ngưỡng:</b> Pin: <code>${metrics.batteryTemp}°C</code> (Ngưỡng ${config.criticalTemp}°C) | CPU: <code>${metrics.cpuTemp}°C</code>
📱 <b>Thiết bị:</b> Xiaomi Redmi K50G (Snapdragon 8 Gen 1)
🔋 <b>Pin:</b> ${metrics.batteryLevel}% | <b>RAM:</b> ${metrics.memUsagePercent}%
---------------------------------------------
⚡ <b>HÀNH ĐỘNG TỰ HÀNH:</b>
Đang tự động <b>KHỞI ĐỘNG LẠI SERVER (Soft Restart)</b> để giải phóng CPU và xả sạch bộ nhớ RAM ngay lập tức!
Nếu sau khi khởi động lại mà nhiệt độ vẫn không hạ, hệ thống sẽ tự động kích hoạt chế độ <b>TẮT HẲN SERVER</b> để bảo vệ máy của Đại Ca!
`.trim();

      await sendTelegramMessage(alertMsg);

      // Trì hoãn 2 giây để điện tín Telegram bắn đi trước khi reboot
      setTimeout(() => {
        executeServerRestart();
      }, 2000);

    } else if (config.overheatCount >= 1 && timeSinceLastReboot <= cooldownWindow) {
      // ===== LẦN 2: KHỞI ĐỘNG LẠI MÀ VẪN QUÁ NHIỆT -> TẮT HẲN SERVER =====
      isActionExecuting = true;
      actionTaken = 'SHUTDOWN_SERVER';
      saveThermalState(2, now);

      const emergencyMsg = `
💀 <b>[BÁO ĐỘNG TỐI CAO - KHẨN CẤP] KHỞI ĐỘNG LẦN 1 VẪN QUÁ NHIỆT!</b> 🆘
---------------------------------------------
🌡️ <b>Nhiệt độ đo được:</b> Pin: <code>${metrics.batteryTemp}°C</code> | CPU: <code>${metrics.cpuTemp}°C</code>
⏰ <b>Thời gian từ lần khởi động lại trước:</b> ${Math.round(timeSinceLastReboot / 1000)} giây.
---------------------------------------------
🛡️ <b>KÍCH HOẠT QUY CHUẨN TẮT HẲN SERVER (EMERGENCY SHUTDOWN):</b>
Đệ đã tắt hẳn toàn bộ tiến trình Web Server trên điện thoại để tránh nguy cơ nổ pin hoặc chập mạch chip Snapdragon!
👉 <i>Đại Ca hãy kiểm tra điện thoại, bật quạt tản nhiệt hoặc rút dây sạc ra nhé! Khi máy nguội, Đại Ca chỉ cần bật lại Termux hoặc gõ lệnh 'pm2 start all' là lên lại ngay!</i>
`.trim();

      await sendTelegramMessage(emergencyMsg);

      // Trì hoãn 2.5 giây rồi tắt hẳn tiến trình
      setTimeout(() => {
        executeServerShutdown();
      }, 2500);
    }
  }

  return { metrics, status, actionTaken };
}

/**
 * Thực hiện khởi động lại máy chủ
 */
function executeServerRestart() {
  console.log('🔄 [THERMAL SENTINEL] Thực hiện khởi động lại Server theo chỉ thị quá nhiệt lần 1...');
  // Trên Termux có PM2, process.exit(0) sẽ khiến PM2 tự động restart lại tiến trình một cách mượt mà
  try {
    exec('pm2 restart accproxy 2>/dev/null', (err) => {
      if (err) {
        process.exit(0);
      }
    });
  } catch (e) {
    process.exit(0);
  }
}

/**
 * Thực hiện tắt hẳn máy chủ
 */
function executeServerShutdown() {
  console.log('🛑 [THERMAL SENTINEL] THỰC HIỆN TẮT HẲN MÁY CHỦ BẢO VỆ PHẦN CỨNG...');
  try {
    exec('pm2 stop accproxy 2>/dev/null', () => {
      process.exit(1);
    });
  } catch (e) {
    process.exit(1);
  }
}

let sentinelInterval = null;

/**
 * Khởi chạy radar giám sát nhiệt độ nền tự động (mỗi 30 giây kiểm tra 1 lần)
 */
function startThermalSentinelLoop() {
  if (sentinelInterval) clearInterval(sentinelInterval);
  sentinelInterval = setInterval(async () => {
    try {
      await checkThermalSentinel();
    } catch (e) {
      console.error('Lỗi thermal sentinel loop:', e.message);
    }
  }, 30000);
}

module.exports = {
  getHardwareMetrics,
  getThermalConfig,
  updateThermalConfig,
  saveThermalState,
  checkThermalSentinel,
  startThermalSentinelLoop,
  executeServerRestart,
  executeServerShutdown
};

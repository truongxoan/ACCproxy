const { spawn } = require('child_process');
const fs = require('fs');

const TERMUX_ADB_PATH = '/data/data/com.termux/files/usr/bin/adb';
const WIN_ADB_PATH = 'C:\\Users\\Tx\\Desktop\\platform-tools\\adb.exe';

const SAFE_KEYCODES = {
  HOME: '3',
  BACK: '4',
  CALL: '5',
  ENDCALL: '6',
  DPAD_UP: '19',
  DPAD_DOWN: '20',
  DPAD_LEFT: '21',
  DPAD_RIGHT: '22',
  DPAD_CENTER: '23',
  VOLUME_UP: '24',
  VOLUME_DOWN: '25',
  POWER: '26',
  CAMERA: '27',
  CLEAR: '28',
  TAB: '61',
  SPACE: '62',
  ENTER: '66',
  DEL: '67',
  MENU: '82',
  MEDIA_PLAY_PAUSE: '85',
  MUTE: '164',
  APP_SWITCH: '187',
  BRIGHTNESS_DOWN: '220',
  BRIGHTNESS_UP: '221',
  SLEEP: '223',
  WAKEUP: '224'
};

const QUICK_APPS = {
  dev_options: { name: 'Tùy Chọn Nhà Phát Triển (Bật Cảm Ứng ADB)', intentAction: 'android.settings.APPLICATION_DEVELOPMENT_SETTINGS', packages: ['com.android.settings'] },
  settings: { name: 'Cài Đặt Hệ Thống', intentAction: 'android.settings.SETTINGS', packages: ['com.android.settings'] },
  termux: { name: 'Termux Server', packages: ['com.termux'] },
  chrome: { name: 'Google Chrome', packages: ['com.android.chrome', 'com.mi.globalbrowser', 'com.android.browser'] },
  tiktok: { name: 'TikTok', packages: ['com.ss.android.ugc.trill', 'com.zhiliaoapp.musically', 'com.ss.android.ugc.aweme'] },
  facebook: { name: 'Facebook', packages: ['com.facebook.katana', 'com.facebook.lite'] },
  youtube: { name: 'YouTube', packages: ['com.google.android.youtube'] },
  telegram: { name: 'Telegram', packages: ['org.telegram.messenger', 'org.telegram.messenger.web'] },
  zalo: { name: 'Zalo', packages: ['com.zing.zalo'] },
  camera: { name: 'Máy Ảnh', packages: ['com.android.camera'] },
  gallery: { name: 'Thư Viện Ảnh', packages: ['com.miui.gallery', 'com.google.android.apps.photos'] }
};

let inFlightCapturePromise = null;
let lastFrameCache = {
  buffer: null,
  width: 1080,
  height: 2400,
  timestamp: 0
};
let adbConnectedVerifiedAt = 0;

/**
 * Xác định đường dẫn thực thi ADB và biến môi trường phù hợp cho Termux Android hoặc Windows PC
 */
function resolveAdbEnvironment() {
  const isTermux = fs.existsSync(TERMUX_ADB_PATH);
  if (isTermux) {
    return {
      isTermux: true,
      adbBin: TERMUX_ADB_PATH,
      targetSerial: process.env.ADB_TARGET_SERIAL || '127.0.0.1:5555',
      env: {
        ...process.env,
        HOME: '/data/data/com.termux/files/home',
        TMPDIR: '/data/data/com.termux/files/usr/tmp',
        PATH: '/data/data/com.termux/files/usr/bin:/system/bin'
      }
    };
  }

  const hasWinAdb = fs.existsSync(WIN_ADB_PATH);
  return {
    isTermux: false,
    adbBin: hasWinAdb ? WIN_ADB_PATH : 'adb',
    targetSerial: process.env.ADB_TARGET_SERIAL || '50a0abab',
    env: process.env
  };
}

/**
 * Thực thi lệnh ADB trả về stdout dạng chuỗi hoặc Buffer
 */
function runAdbCommand(args, options = {}) {
  const { adbBin, targetSerial, env, isTermux } = resolveAdbEnvironment();
  const useSerial = options.skipSerial ? [] : ['-s', targetSerial];
  const finalArgs = [...useSerial, ...args];
  const timeoutMs = Math.max(12000, options.timeout || 12000);

  return new Promise((resolve, reject) => {
    let settled = false;
    const stdoutChunks = [];
    const stderrChunks = [];

    const child = spawn(adbBin, finalArgs, {
      env,
      windowsHide: true
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          child.kill();
        } catch (e) {}
        reject(new Error('Quá thời gian chờ phản hồi từ ADB'));
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('exit', (code) => {
      // Đợi 15ms để thu gom nốt buffer cuối cùng từ pipe rồi đóng ngay không chờ daemon ngầm
      setTimeout(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        try {
          child.stdout.destroy();
          child.stderr.destroy();
        } catch (e) {}

        const outBuf = Buffer.concat(stdoutChunks);
        const errStr = Buffer.concat(stderrChunks).toString('utf8').trim();
        const outStr = options.binary ? '' : outBuf.toString('utf8').trim();

        if (code !== 0 || (!options.binary && (outStr.includes('SecurityException') || errStr.includes('SecurityException')))) {
          const combinedErr = errStr || outStr || `ADB exited with code ${code}`;
          if (isTermux && (combinedErr.includes('not found') || combinedErr.includes('offline'))) {
            adbConnectedVerifiedAt = 0;
          }
          return reject(new Error(combinedErr));
        }

        resolve(options.binary ? outBuf : outStr);
      }, 15);
    });
  });
}

/**
 * Chuẩn hóa thông báo lỗi INJECT_EVENTS của Xiaomi HyperOS / MIUI và tự động mở màn hình Tùy chọn nhà phát triển
 */
async function handleXiaomiInjectError(err) {
  const msg = String(err?.message || err || '');
  if (msg.includes('INJECT_EVENTS') || msg.includes('SecurityException')) {
    try {
      await runAdbCommand([
        'shell',
        'am',
        'start',
        '-a',
        'android.settings.APPLICATION_DEVELOPMENT_SETTINGS'
      ], { timeout: 5000 });
    } catch (e) {}
    throw new Error(
      'Xiaomi HyperOS chặn mô phỏng chạm cảm ứng! Đệ đã tự mở sẵn mục [Tùy chọn nhà phát triển] trên điện thoại — Đại Ca kéo xuống bật nút "Gỡ lỗi USB (Cài đặt bảo mật)" / "USB debugging (Security settings)" 1 lần là chạm/vuốt thoải mái!'
    );
  }
  throw err;
}

/**
 * Đảm bảo kết nối ADB Loopback (127.0.0.1:5555) trên Termux luôn sẵn sàng
 */
async function ensureAdbConnection() {
  const { isTermux, targetSerial } = resolveAdbEnvironment();
  const now = Date.now();
  if (now - adbConnectedVerifiedAt < 30000) {
    return true;
  }

  if (isTermux) {
    try {
      await runAdbCommand(['connect', targetSerial], { skipSerial: true, timeout: 10000 });
      adbConnectedVerifiedAt = now;
      return true;
    } catch (e) {
      return false;
    }
  }

  adbConnectedVerifiedAt = now;
  return true;
}

/**
 * Đọc kích thước chiều rộng và chiều cao trực tiếp từ PNG IHDR Header (Bytes 16..24)
 */
function parsePngDimensions(pngBuffer) {
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length < 24) {
    return null;
  }
  if (
    pngBuffer[0] !== 0x89 ||
    pngBuffer[1] !== 0x50 ||
    pngBuffer[2] !== 0x4e ||
    pngBuffer[3] !== 0x47
  ) {
    return null;
  }
  const width = pngBuffer.readUInt32BE(16);
  const height = pngBuffer.readUInt32BE(20);
  if (width > 0 && width <= 8000 && height > 0 && height <= 8000) {
    return { width, height };
  }
  return null;
}

/**
 * Chụp màn hình trực tiếp từ điện thoại qua `adb exec-out screencap -p`
 */
async function capturePhoneScreen(forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && lastFrameCache.buffer && now - lastFrameCache.timestamp < 160) {
    return {
      success: true,
      buffer: lastFrameCache.buffer,
      width: lastFrameCache.width,
      height: lastFrameCache.height,
      timestamp: lastFrameCache.timestamp,
      cached: true
    };
  }

  if (inFlightCapturePromise) {
    return inFlightCapturePromise;
  }

  inFlightCapturePromise = (async () => {
    try {
      await ensureAdbConnection();
      const rawBuffer = await runAdbCommand(['exec-out', 'screencap', '-p'], {
        binary: true,
        timeout: 12000
      });

      const dims = parsePngDimensions(rawBuffer);
      if (!dims) {
        throw new Error('Dữ liệu khung hình PNG từ ADB không hợp lệ hoặc màn hình đang khóa bảo mật.');
      }

      lastFrameCache = {
        buffer: rawBuffer,
        width: dims.width,
        height: dims.height,
        timestamp: Date.now()
      };

      return {
        success: true,
        buffer: rawBuffer,
        width: dims.width,
        height: dims.height,
        timestamp: lastFrameCache.timestamp,
        cached: false
      };
    } finally {
      inFlightCapturePromise = null;
    }
  })();

  return inFlightCapturePromise;
}

/**
 * Lấy thông tin trạng thái điện thoại (Model, Độ phân giải, Pin, Top App đang mở)
 */
async function getPhoneStatus() {
  try {
    await ensureAdbConnection();
    const out = await runAdbCommand([
      'shell',
      'echo "MODEL:$(getprop ro.product.model)"; wm size; dumpsys deviceidle get screen'
    ], { timeout: 12000 });

    const lines = String(out || '').split(/\r?\n/);
    let model = 'Xiaomi Redmi K50G';
    let width = lastFrameCache.width || 1080;
    let height = lastFrameCache.height || 2400;
    let screenOn = true;

    for (const line of lines) {
      if (line.startsWith('MODEL:')) {
        const m = line.replace('MODEL:', '').trim();
        if (m) model = m;
      } else if (line.includes('Physical size:')) {
        const match = line.match(/(\d+)x(\d+)/);
        if (match) {
          width = parseInt(match[1], 10);
          height = parseInt(match[2], 10);
        }
      } else if (line.trim() === 'false') {
        screenOn = false;
      } else if (line.trim() === 'true') {
        screenOn = true;
      }
    }

    const { isTermux, targetSerial } = resolveAdbEnvironment();
    return {
      success: true,
      connected: true,
      mode: isTermux ? 'TERMUX_LOOPBACK_ADB' : 'USB_ADB_BRIDGE',
      serial: targetSerial,
      model,
      width,
      height,
      screenOn,
      quickApps: Object.entries(QUICK_APPS).map(([id, info]) => ({
        id,
        name: info.name
      }))
    };
  } catch (error) {
    const { isTermux, targetSerial } = resolveAdbEnvironment();
    return {
      success: false,
      connected: false,
      mode: isTermux ? 'TERMUX_LOOPBACK_ADB' : 'USB_ADB_BRIDGE',
      serial: targetSerial,
      width: lastFrameCache.width || 1080,
      height: lastFrameCache.height || 2400,
      message: error.message
    };
  }
}

/**
 * Chạm (Tap) vào tọa độ (x, y) trên màn hình điện thoại
 */
async function sendTap(x, y) {
  const safeX = Math.max(0, Math.min(8000, Math.round(Number(x) || 0)));
  const safeY = Math.max(0, Math.min(8000, Math.round(Number(y) || 0)));
  await ensureAdbConnection();
  try {
    await runAdbCommand(['shell', 'input', 'tap', String(safeX), String(safeY)], { timeout: 5000 });
    return { success: true, action: 'tap', x: safeX, y: safeY };
  } catch (err) {
    await handleXiaomiInjectError(err);
  }
}

/**
 * Vuốt (Swipe / Drag / Long-Press) từ (x1, y1) tới (x2, y2) trong khoảng thời gian durationMs
 */
async function sendSwipe(x1, y1, x2, y2, durationMs = 300) {
  const sx1 = Math.max(0, Math.min(8000, Math.round(Number(x1) || 0)));
  const sy1 = Math.max(0, Math.min(8000, Math.round(Number(y1) || 0)));
  const sx2 = Math.max(0, Math.min(8000, Math.round(Number(x2) || 0)));
  const sy2 = Math.max(0, Math.min(8000, Math.round(Number(y2) || 0)));
  const dur = Math.max(50, Math.min(5000, Math.round(Number(durationMs) || 300)));

  await ensureAdbConnection();
  try {
    await runAdbCommand(
      ['shell', 'input', 'swipe', String(sx1), String(sy1), String(sx2), String(sy2), String(dur)],
      { timeout: 6000 }
    );
    return { success: true, action: 'swipe', x1: sx1, y1: sy1, x2: sx2, y2: sy2, durationMs: dur };
  } catch (err) {
    await handleXiaomiInjectError(err);
  }
}

/**
 * Gửi phím cứng / phím điều hướng hệ thống
 * Ưu tiên thực thi qua System Service (ActivityManager / AudioService / StatusBarManager) để vượt rào INJECT_EVENTS của Xiaomi HyperOS!
 */
async function sendKeyEvent(key) {
  await ensureAdbConnection();
  const normalized = String(key || '').trim().toUpperCase();

  // 1. Nhóm lệnh StatusBar (Không cần quyền INJECT_EVENTS)
  if (normalized === 'NOTIFICATION_SHADE') {
    await runAdbCommand(['shell', 'cmd', 'statusbar', 'expand-notifications'], { timeout: 5000 });
    return { success: true, action: 'statusbar', target: 'expand-notifications' };
  }
  if (normalized === 'QUICK_SETTINGS') {
    await runAdbCommand(['shell', 'cmd', 'statusbar', 'expand-settings'], { timeout: 5000 });
    return { success: true, action: 'statusbar', target: 'expand-settings' };
  }
  if (normalized === 'COLLAPSE_SHADE') {
    await runAdbCommand(['shell', 'cmd', 'statusbar', 'collapse'], { timeout: 5000 });
    return { success: true, action: 'statusbar', target: 'collapse' };
  }

  // 2. Nút HOME: Chạy qua ActivityManager Intent (Hoạt động 100% trên mọi máy Xiaomi không cần INJECT_EVENTS)
  if (normalized === 'HOME' || normalized === '3') {
    await runAdbCommand([
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.MAIN',
      '-c',
      'android.intent.category.HOME'
    ], { timeout: 5000 });
    return { success: true, action: 'intent_home', key: 'HOME' };
  }

  // 3. Nhóm lệnh Âm lượng (AudioService cmd media_session — Không cần INJECT_EVENTS)
  if (normalized === 'VOLUME_UP' || normalized === '24') {
    await runAdbCommand(['shell', 'cmd', 'media_session', 'volume', '--adj', 'raise', '--show'], { timeout: 5000 });
    return { success: true, action: 'volume_up', key: 'VOLUME_UP' };
  }
  if (normalized === 'VOLUME_DOWN' || normalized === '25') {
    await runAdbCommand(['shell', 'cmd', 'media_session', 'volume', '--adj', 'lower', '--show'], { timeout: 5000 });
    return { success: true, action: 'volume_down', key: 'VOLUME_DOWN' };
  }
  if (normalized === 'MUTE' || normalized === '164') {
    await runAdbCommand(['shell', 'cmd', 'media_session', 'volume', '--adj', 'mute', '--show'], { timeout: 5000 });
    return { success: true, action: 'volume_mute', key: 'MUTE' };
  }

  // 4. Mở trực tiếp trang Tùy Chọn Nhà Phát Triển để bật Gỡ lỗi USB (Cài đặt bảo mật)
  if (normalized === 'DEVELOPER_OPTIONS') {
    await runAdbCommand([
      'shell',
      'am',
      'start',
      '-a',
      'android.settings.APPLICATION_DEVELOPMENT_SETTINGS'
    ], { timeout: 5000 });
    return { success: true, action: 'open_developer_options' };
  }

  const code = SAFE_KEYCODES[normalized] || (/^\d+$/.test(normalized) ? normalized : null);
  if (!code) {
    throw new Error(`Mã phím không hợp lệ: ${key}`);
  }

  try {
    await runAdbCommand(['shell', 'input', 'keyevent', code], { timeout: 5000 });
    return { success: true, action: 'keyevent', key: normalized, code };
  } catch (err) {
    // Nếu WAKEUP bị chặn INJECT_EVENTS thì đánh thức bằng cách gọi Intent HOME + đóng thanh trạng thái
    if (normalized === 'WAKEUP' || code === '224') {
      await runAdbCommand([
        'shell',
        'am start -a android.intent.action.MAIN -c android.intent.category.HOME; cmd statusbar collapse'
      ], { timeout: 5000 });
      return { success: true, action: 'wakeup_fallback', key: 'WAKEUP' };
    }
    await handleXiaomiInjectError(err);
  }
}

/**
 * Nhập văn bản vào ô đang focus trên điện thoại
 */
async function sendTextInput(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Nội dung văn bản trống');
  }
  await ensureAdbConnection();

  const formatted = text
    .replace(/ /g, '%s')
    .replace(/(["'`$\\;&|<>()*?!])/g, '\\$1');

  try {
    await runAdbCommand(['shell', `input text "${formatted}"`], { timeout: 5000 });
    return { success: true, action: 'text', length: text.length };
  } catch (err) {
    await handleXiaomiInjectError(err);
  }
}

/**
 * Mở nhanh ứng dụng trên điện thoại bằng ActivityManager (`cmd package resolve-activity` + `am start`)
 * Vượt hoàn toàn rào cản INJECT_EVENTS của `monkey` trên Xiaomi HyperOS!
 */
async function launchPhoneApp(appKeyOrPackage) {
  await ensureAdbConnection();
  const key = String(appKeyOrPackage || '').trim().toLowerCase();
  const preset = QUICK_APPS[key];

  if (preset && preset.intentAction) {
    await runAdbCommand(['shell', 'am', 'start', '-a', preset.intentAction], { timeout: 6000 });
    return {
      success: true,
      app: preset.name,
      packageName: preset.packages[0] || key
    };
  }

  const candidatePackages = preset ? preset.packages : [appKeyOrPackage.trim()];

  let lastError = null;
  for (const pkg of candidatePackages) {
    if (!/^[a-zA-Z0-9._]+$/.test(pkg)) {
      continue;
    }
    try {
      // Giải pháp 1: Tìm main activity qua package manager rồi gọi am start -n (Không cần INJECT_EVENTS)
      const resolvedOut = await runAdbCommand([
        'shell',
        `cmd package resolve-activity --brief -c android.intent.category.LAUNCHER ${pkg}`
      ], { timeout: 5000 });

      const lines = String(resolvedOut || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const component = lines.find((l) => l.includes('/') && !l.startsWith('priority='));

      if (component) {
        await runAdbCommand(['shell', 'am', 'start', '-n', component], { timeout: 5000 });
        return {
          success: true,
          app: preset ? preset.name : pkg,
          packageName: pkg,
          component
        };
      }

      // Giải pháp 2: Dự phòng monkey nếu không tìm thấy LAUNCHER activity
      await runAdbCommand(
        ['shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'],
        { timeout: 5000 }
      );
      return {
        success: true,
        app: preset ? preset.name : pkg,
        packageName: pkg
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError ? lastError.message : `Không thể mở ứng dụng: ${appKeyOrPackage}`);
}

/**
 * Mở trực tiếp một đường link URL trên trình duyệt / ứng dụng của điện thoại
 */
async function openPhoneUrl(url) {
  const cleanUrl = String(url || '').trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    throw new Error('Đường dẫn phải bắt đầu bằng http:// hoặc https://');
  }
  await ensureAdbConnection();
  await runAdbCommand(
    ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', cleanUrl],
    { timeout: 6000 }
  );
  return { success: true, url: cleanUrl };
}

module.exports = {
  capturePhoneScreen,
  getPhoneStatus,
  sendTap,
  sendSwipe,
  sendKeyEvent,
  sendTextInput,
  launchPhoneApp,
  openPhoneUrl,
  QUICK_APPS,
  SAFE_KEYCODES
};

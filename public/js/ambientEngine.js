// ============================================================================
// ENI 5D ATMOSPHERIC & GATHER · 聚 3D POINT-CLOUD ENGINE v17.0 APEX
// Tích hợp trọn vẹn bộ hiệu ứng từ https://gather.be-of-dao.com/ (Gather · 聚 by DAO):
// - 3D Point-Cloud Sand Swarm & Morphing Forms (DAO, TAIJI Âm Dương, ORB, RIPPLE)
// - Wind Drift Dissolution & Sand Streaks (DRIFT + TRAILS)
// - Interactive Pointer Smoke Wake (uBrush - bàn tay lướt qua làn khói cát 3D)
// - Volumetric Snare Lamps in the Sand (LIGHT - Bone, Ice, Amber, Ember, Jade, Violet)
// - Cybernetic HUD Target Lock Boxes (TRACK + SEEK), Constellation Links (LINKS),
//   Depth Scan Plane (SCAN) & 3D Perspective Ruler Frame (MARKS)
// Cùng 5 hiệu ứng 5D truyền thống: Sấm Sét 5D, Pháo Hoa, Hoa Đào, Tuyết Rơi, Mưa Rơi
// ============================================================================

const AmbientEngine = {
  canvas: null,
  ctx: null,
  mode: 'gather', // 'gather' | 'gather_taiji' | 'gather_hud' | 'lightning' | 'fireworks' | 'sakura' | 'snow' | 'rain' | 'off'
  animId: null,
  width: 0,
  height: 0,
  particles: [],
  lastTime: 0,

  // ==================== GATHER · 聚 3D STATE ====================
  gather: {
    initialized: false,
    points: [],
    pointCount: 1650,
    shapeIndex: 0,
    shapeNames: ['DAO · 聚', 'TAIJI · 陰陽', 'ORB · 靈球', 'RIPPLE · 波紋'],
    morphFrom: 0,
    morphTo: 0,
    morphProgress: 1.0,
    morphDuration: 2.6, // seconds
    lastShapeSwitch: 0,
    shapeHoldTime: 8500, // ms between auto-morphs
    yaw: 0,
    pitch: 0,
    targetYaw: 0,
    targetPitch: 0,
    breathPhase: 0,
    scanZ: 0,
    driftAngle: -0.58,
    driftLineOffset: 0.18,
    // Interactive options
    enableTrackers: true,
    enableLinks: true,
    enableDrift: true,
    enableMarks: true,
    enableScan: true,
    // Pointer Smoke Wake (uBrush - 16 trail slots)
    pointer: {
      x: 0,
      y: 0,
      nx: 0,
      ny: 0,
      vx: 0,
      vy: 0,
      active: false,
      trail: [] // { x, y, vx, vy, age }
    },
    // Volumetric Snare Lamps (LIGHT)
    lampPalettes: [
      { name: 'Amber',  r: 255, g: 171, b: 61,  hex: '#ffab3d' },
      { name: 'Jade',   r: 79,  g: 227, b: 193, hex: '#4fe3c1' },
      { name: 'Bone',   r: 255, g: 233, b: 196, hex: '#ffe9c4' },
      { name: 'Ice',    r: 217, g: 230, b: 255, hex: '#d9e6ff' },
      { name: 'Ember',  r: 255, g: 79,  b: 56,  hex: '#ff4f38' },
      { name: 'Violet', r: 143, g: 123, b: 255, hex: '#8f7bff' }
    ],
    lampPaletteIdx: 0,
    lamps: [], // { x, y, z, r, g, b, hex, life, maxLife, radius, phase }
    lastAutoLamp: 0,
    // Cybernetic HUD Trackers (TRACK)
    trackers: [], // { id, ptIdx, targetPtIdx, x, y, z, sx, sy, visible, seekProgress, boxSize, nextHopTime }
    // Feature anchors per shape for HUD trackers
    anchors: [[], [], [], []]
  },

  // Lightning state
  lightning: {
    bolts: [],
    timer: 0,
    interval: 1800,
    screenFlash: 0,
    flashColor: 'rgba(255, 255, 255, 0)'
  },

  // Fireworks state
  fireworks: {
    rockets: [],
    sparks: [],
    timer: 0
  },

  // Rain ripples
  ripples: [],

  init() {
    this.canvas = document.getElementById('ambient-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this.resize();
    window.addEventListener('resize', () => this.resize(), { passive: true });

    // Bắt chuyển động chuột / cảm ứng để tạo hiệu ứng "bàn tay lướt qua khói cát" (uBrush)
    this.bindPointerEvents();

    // Đóng dropdown khi click ra ngoài
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('ambient-menu');
      const toggle = document.getElementById('btn-ambient-toggle');
      if (menu && !menu.contains(e.target) && toggle && !toggle.contains(e.target)) {
        menu.classList.add('hidden');
      }
    });

    // Tự động kích hoạt chế độ Gather · 聚 3D mới cho Đại Ca ở phiên v17
    const migratedV17 = localStorage.getItem('accproxy_ambient_v17_gather');
    let saved = localStorage.getItem('accproxy_ambient_mode');
    if (!migratedV17) {
      localStorage.setItem('accproxy_ambient_v17_gather', '1');
      if (!saved || saved === 'lightning') {
        saved = 'gather';
        localStorage.setItem('accproxy_ambient_mode', 'gather');
      }
    }
    const initialMode = saved !== null ? saved : 'gather';
    this.setMode(initialMode, false);
  },

  bindPointerEvents() {
    const onMove = (clientX, clientY) => {
      if (!this.width || !this.height) return;
      const p = this.gather.pointer;
      const prevX = p.x || clientX;
      const prevY = p.y || clientY;
      p.vx = clientX - prevX;
      p.vy = clientY - prevY;
      p.x = clientX;
      p.y = clientY;
      p.nx = (clientX / this.width) * 2 - 1;
      p.ny = (clientY / this.height) * 2 - 1;
      p.active = true;

      // Lưu vệt khói (uBrush trail) khi di chuột đủ nhanh
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 1.5) {
        p.trail.unshift({
          x: clientX,
          y: clientY,
          vx: p.vx,
          vy: p.vy,
          age: 0
        });
        if (p.trail.length > 18) p.trail.pop();
      }
    };

    window.addEventListener('mousemove', (e) => {
      onMove(e.clientX, e.clientY);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    // Click lên vùng trống để thắp Đèn Năng Lượng Trong Cát (Snare Lamp)
    window.addEventListener('mousedown', (e) => {
      if (!this.isGatherMode()) return;
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
      if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'LABEL'].includes(tag)) return;
      if (e.target && e.target.closest && e.target.closest('button, a, input, select, textarea, #ambient-menu, .modal-backdrop')) return;
      this.spawnGatherLamp(e.clientX, e.clientY);
    }, { passive: true });
  },

  isGatherMode() {
    return this.mode === 'gather' || this.mode === 'gather_taiji' || this.mode === 'gather_hud';
  },

  resize() {
    if (!this.canvas) return;
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
  },

  toggleMenu() {
    const menu = document.getElementById('ambient-menu');
    if (menu) menu.classList.toggle('hidden');
  },

  setMode(mode, save = true) {
    this.mode = mode;
    if (save) {
      localStorage.setItem('accproxy_ambient_mode', mode);
    }

    const menu = document.getElementById('ambient-menu');
    if (menu) menu.classList.add('hidden');

    this.updateHeaderUI();

    this.particles = [];
    this.ripples = [];
    this.fireworks.rockets = [];
    this.fireworks.sparks = [];
    this.lightning.bolts = [];
    this.lightning.screenFlash = 0;

    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }

    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }

    if (this.mode === 'off') {
      return;
    }

    if (this.isGatherMode()) {
      this.initGatherCloud();
      if (this.mode === 'gather_taiji') {
        this.gather.shapeIndex = 1; // TAIJI · 陰陽
        this.gather.morphFrom = 1;
        this.gather.morphTo = 1;
        this.gather.morphProgress = 1.0;
      }
    } else {
      this.spawnInitialParticles();
    }

    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    this.animId = requestAnimationFrame(this.loop);
  },

  updateHeaderUI() {
    const iconEl = document.getElementById('ambient-current-icon');
    const labelEl = document.getElementById('ambient-current-label');
    const meta = {
      gather:       { icon: '✨', label: 'Gather · 聚 3D' },
      gather_taiji: { icon: '☯️', label: 'Gather: Thái Cực' },
      gather_hud:   { icon: '🎯', label: 'Gather: HUD Radar' },
      lightning:    { icon: '⚡', label: '5D: Sấm Sét' },
      fireworks:    { icon: '🎆', label: '5D: Pháo Hoa' },
      sakura:       { icon: '🌸', label: '5D: Hoa Đào' },
      snow:         { icon: '❄️', label: '5D: Tuyết Rơi' },
      rain:         { icon: '🌧️', label: '5D: Mưa Rơi' },
      off:          { icon: '🚫', label: '5D: Đã Tắt' }
    }[this.mode] || { icon: '✨', label: 'Gather · 聚 3D' };

    if (iconEl) iconEl.innerText = meta.icon;
    if (labelEl) labelEl.innerText = meta.label;

    document.querySelectorAll('.ambient-opt-btn').forEach(btn => {
      if (btn.dataset.mode === this.mode) {
        btn.classList.add('bg-purple-900/50', 'text-white', 'border', 'border-purple-500/40');
      } else {
        btn.classList.remove('bg-purple-900/50', 'text-white', 'border', 'border-purple-500/40');
      }
    });
  },

  // ==========================================================================
  // GATHER · 聚 3D POINT-CLOUD GENERATOR (Ported from gather.be-of-dao.com)
  // 4 Procedural 3D Forms:
  //   0: DAO (D-Cylinder + Central Triangle + Right Circle)
  //   1: TAIJI (Rotating 3D Yin-Yang Disc with Dual Eyes)
  //   2: ORB (Volumetric Sphere with Fractal Noise Contours)
  //   3: RIPPLE (Dual-Source Interference Wave Field)
  // ==========================================================================
  hash11(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  },

  noise2D(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const n00 = this.hash11(ix + iy * 57.0);
    const n10 = this.hash11(ix + 1 + iy * 57.0);
    const n01 = this.hash11(ix + (iy + 1) * 57.0);
    const n11 = this.hash11(ix + 1 + (iy + 1) * 57.0);
    return (n00 * (1 - ux) + n10 * ux) * (1 - uy) + (n01 * (1 - ux) + n11 * ux) * uy;
  },

  fbm2(x, y) {
    let v = 0;
    let a = 0.5;
    for (let i = 0; i < 4; i++) {
      v += a * (this.noise2D(x, y) * 2 - 1);
      x = x * 2.03 + 13.7;
      y = y * 2.03 + 7.1;
      a *= 0.5;
    }
    return v;
  },

  sampleShapeDAO() {
    // Biểu tượng DAO · 聚: Chữ D bên trái + Tam giác giữa + Hình tròn bên phải
    for (let guard = 0; guard < 200; guard++) {
      const x = (Math.random() - 0.5) * 1.48;
      const y = (Math.random() - 0.5) * 0.68;
      let hit = false;
      let edge = 0;

      // 1. Left D-shape (-0.62 .. -0.26)
      if (x >= -0.62 && x <= -0.24 && Math.abs(y) <= 0.24) {
        if (x <= -0.46) {
          hit = true;
          edge = Math.min(Math.abs(x + 0.62), 0.24 - Math.abs(y)) / 0.08;
        } else {
          const dx = x + 0.46;
          const r = Math.hypot(dx, y);
          if (r <= 0.24) {
            hit = true;
            edge = (0.24 - r) / 0.08;
          }
        }
      }

      // 2. Center Triangle (-0.20 .. +0.20)
      if (!hit && y >= -0.23 && y <= 0.23) {
        const t = (0.23 - y) / 0.46; // 0 at top, 1 at bottom
        const halfW = 0.22 * t;
        if (Math.abs(x) <= halfW) {
          hit = true;
          edge = Math.min(halfW - Math.abs(x), y + 0.23) / 0.07;
        }
      }

      // 3. Right Circle (+0.44, 0)
      if (!hit) {
        const r = Math.hypot(x - 0.45, y);
        if (r <= 0.235) {
          hit = true;
          edge = (0.235 - r) / 0.08;
        }
      }

      if (hit) {
        const sh = Math.min(1, Math.max(0.15, edge));
        const th = 0.03 + 0.14 * Math.pow(sh, 0.65);
        const z = (Math.random() - 0.5) * 2 * th + 0.025 * this.fbm2(x * 3.5, y * 3.5);
        const lum = 0.48 + 0.48 * Math.pow(sh, 0.55);
        return { x, y, z, lum };
      }
    }
    return { x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.3, z: 0, lum: 0.7 };
  },

  sampleShapeTAIJI() {
    // Thái Cực Âm Dương 3D (TAIJI)
    const R = 0.46;
    for (let guard = 0; guard < 200; guard++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * R;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;

      const dTop = Math.hypot(x, y - 0.5 * R);
      const dBot = Math.hypot(x, y + 0.5 * R);
      const eyeR = 0.135 * R;

      let yang = x > 0;
      if (dTop < 0.5 * R) yang = true;
      if (dBot < 0.5 * R) yang = false;
      if (dTop < eyeR) yang = false;
      if (dBot < eyeR) yang = true;

      // Nhấn mạnh mật độ hạt ở phía Dương và viền đĩa Âm Dương
      const rim = Math.exp(-Math.pow((R - r) / 0.032, 2));
      const eyeRim = Math.exp(-Math.pow((dTop - eyeR) / 0.02, 2)) + Math.exp(-Math.pow((dBot - eyeR) / 0.02, 2));
      const keepProb = yang ? 0.94 : Math.min(0.95, 0.32 + 0.65 * (rim + eyeRim));
      if (Math.random() > keepProb) continue;

      const lum = yang
        ? Math.min(1, 0.62 + 0.35 * (1 - r / R) + 0.22 * rim)
        : Math.min(1, 0.20 + 0.58 * rim + 0.45 * eyeRim);
      const th = 0.025 + 0.075 * (1 - (r / R) * (r / R));
      const z = (Math.random() - 0.5) * 2 * th + (yang ? 0.022 : -0.022);
      return { x, y, z, lum };
    }
    return { x: 0, y: 0, z: 0, lum: 0.8 };
  },

  sampleShapeORB() {
    // Tinh Cầu Đa Chiều (ORB)
    const R = 0.44;
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    // Tập trung hạt ở lớp vỏ cầu + lõi ánh sáng
    const shellBias = Math.pow(Math.random(), 0.28);
    const rad = R * (0.25 + 0.75 * shellBias);
    const x = rad * s * Math.cos(theta);
    const y = rad * u;
    const z = rad * s * Math.sin(theta);
    const n = 0.5 + 0.5 * this.fbm2(x * 5.2 + 2.1, y * 5.2 - 1.4);
    const rim = Math.pow(shellBias, 1.4);
    const lum = Math.min(1, 0.32 + 0.48 * n + 0.35 * rim);
    return { x, y, z, lum };
  },

  sampleShapeRIPPLE() {
    // Sóng Giao Thoa Đa Tâm (RIPPLE)
    const R = 0.52;
    for (let guard = 0; guard < 150; guard++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * R;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      const r1 = Math.hypot(x + 0.14, y + 0.05);
      const r2 = Math.hypot(x - 0.16, y - 0.06);
      const w = 0.5 * (Math.cos(44 * r1) + Math.cos(44 * r2));
      const crest = 0.5 + 0.5 * w;
      if (Math.random() > 0.22 + 0.78 * Math.pow(crest, 1.5)) continue;
      const fade = Math.max(0, 1 - (r / R) * 0.85);
      const z = 0.065 * w * fade + (Math.random() - 0.5) * 0.025;
      const lum = Math.min(1, (0.28 + 0.72 * Math.pow(crest, 1.3)) * (0.4 + 0.6 * fade));
      return { x, y, z, lum };
    }
    return { x: 0, y: 0, z: 0, lum: 0.6 };
  },

  initGatherCloud() {
    const g = this.gather;
    const isMobile = this.width < 768;
    g.pointCount = isMobile ? 950 : 1750;

    if (!g.initialized || g.points.length !== g.pointCount) {
      g.points = [];
      for (let i = 0; i < g.pointCount; i++) {
        const s0 = this.sampleShapeDAO();
        const s1 = this.sampleShapeTAIJI();
        const s2 = this.sampleShapeORB();
        const s3 = this.sampleShapeRIPPLE();
        g.points.push({
          shapes: [s0, s1, s2, s3],
          seed: Math.random(),
          size: Math.random() * 1.45 + 0.75,
          // Wind drift state
          driftProgress: Math.random(),
          // Screen-space cache for HUD & trails
          sx: 0,
          sy: 0,
          sz: 0,
          prevSx: 0,
          prevSy: 0
        });
      }

      // Khởi tạo 8 hộp khóa mục tiêu HUD (TRACK boxes)
      g.trackers = [];
      const trackerCount = isMobile ? 5 : 8;
      for (let i = 0; i < trackerCount; i++) {
        const ptIdx = Math.floor(Math.random() * g.pointCount);
        g.trackers.push({
          id: String(i + 1).padStart(2, '0'),
          ptIdx,
          targetPtIdx: ptIdx,
          x: g.points[ptIdx].shapes[0].x,
          y: g.points[ptIdx].shapes[0].y,
          z: g.points[ptIdx].shapes[0].z,
          sx: this.width / 2,
          sy: this.height / 2,
          visible: true,
          seekProgress: 1.0,
          boxSize: 16 + (i % 3) * 4,
          nextHopTime: performance.now() + 1200 + i * 650
        });
      }

      g.initialized = true;
    }

    g.lastShapeSwitch = performance.now();
    g.lastAutoLamp = performance.now();

    // Tạo sẵn 1 đèn năng lượng (Snare Lamp) ban đầu
    if (g.lamps.length === 0) {
      this.spawnGatherLamp(this.width * 0.56, this.height * 0.46);
    }
  },

  nextGatherShape() {
    const g = this.gather;
    if (!g.initialized) this.initGatherCloud();
    g.morphFrom = g.shapeIndex;
    g.shapeIndex = (g.shapeIndex + 1) % g.shapeNames.length;
    g.morphTo = g.shapeIndex;
    g.morphProgress = 0.0;
    g.lastShapeSwitch = performance.now();
  },

  spawnGatherLamp(screenX, screenY) {
    const g = this.gather;
    const pal = g.lampPalettes[g.lampPaletteIdx % g.lampPalettes.length];
    g.lampPaletteIdx = (g.lampPaletteIdx + 1) % g.lampPalettes.length;

    const scale = Math.min(this.width, this.height) * 0.78;
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;

    const wx = screenX !== undefined ? (screenX - cx) / scale : (Math.random() - 0.5) * 0.75;
    const wy = screenY !== undefined ? (screenY - cy) / scale : (Math.random() - 0.5) * 0.45;
    const wz = (Math.random() - 0.5) * 0.22;

    g.lamps.push({
      x: wx,
      y: wy,
      z: wz,
      r: pal.r,
      g: pal.g,
      b: pal.b,
      hex: pal.hex,
      name: pal.name,
      life: 0,
      maxLife: 5.5, // seconds
      radius: 0.34,
      phase: Math.random() * Math.PI * 2
    });

    if (g.lamps.length > 4) {
      g.lamps.shift();
    }
  },

  // ==========================================================================
  // RENDER GATHER · 聚 3D SCENE (SAND SWARM + SMOKE WAKE + LAMPS + HUD)
  // ==========================================================================
  renderGather(now, dt) {
    const ctx = this.ctx;
    const g = this.gather;
    if (!g.initialized) this.initGatherCloud();

    const dtSec = dt * 0.001;
    const tSec = now * 0.001;

    // 1. Tự động chuyển đổi hình khối 3D (DAO -> TAIJI -> ORB -> RIPPLE)
    if (this.mode === 'gather' && now - g.lastShapeSwitch > g.shapeHoldTime) {
      this.nextGatherShape();
    } else if (this.mode === 'gather_taiji' && now - g.lastShapeSwitch > 10000) {
      // Chuyển qua lại giữa TAIJI (1) và ORB (2)
      g.morphFrom = g.shapeIndex;
      g.shapeIndex = g.shapeIndex === 1 ? 2 : 1;
      g.morphTo = g.shapeIndex;
      g.morphProgress = 0.0;
      g.lastShapeSwitch = now;
    }

    if (g.morphProgress < 1.0) {
      g.morphProgress = Math.min(1.0, g.morphProgress + dtSec / g.morphDuration);
    }

    // 2. Tự động thắp Đèn Năng Lượng Trong Cát (Snare Lamp) định kỳ
    if (now - g.lastAutoLamp > 4200) {
      g.lastAutoLamp = now;
      const angle = tSec * 0.9;
      const sx = this.width * 0.5 + Math.cos(angle) * (this.width * 0.22);
      const sy = this.height * 0.5 + Math.sin(angle * 1.3) * (this.height * 0.16);
      this.spawnGatherLamp(sx, sy);
    }

    // 3. Cập nhật góc xoay 3D (Yaw / Pitch) theo chuột + nhịp thở (uBreath)
    const p = g.pointer;
    const autoYaw = Math.sin(tSec * 0.35) * 0.32 + (this.mode === 'gather_taiji' ? Math.sin(tSec * 0.5) * 0.18 : 0);
    const autoPitch = Math.cos(tSec * 0.27) * 0.16;
    g.targetYaw = autoYaw + (p.active ? p.nx * 0.38 : 0);
    g.targetPitch = autoPitch + (p.active ? -p.ny * 0.24 : 0);
    g.yaw += (g.targetYaw - g.yaw) * 0.06;
    g.pitch += (g.targetPitch - g.pitch) * 0.06;

    const breath = 1.0 + 0.035 * Math.sin(tSec * 1.65);
    g.scanZ = Math.sin(tSec * 1.15) * 0.42; // Mặt phẳng quét chiều sâu (SCAN)

    // Cập nhật vệt khói chuột (uBrush decay)
    for (let i = p.trail.length - 1; i >= 0; i--) {
      p.trail[i].age += dtSec;
      if (p.trail[i].age > 0.65) {
        p.trail.splice(i, 1);
      }
    }

    // Cập nhật các Đèn Năng Lượng (Snare Lamps)
    for (let i = g.lamps.length - 1; i >= 0; i--) {
      const lamp = g.lamps[i];
      lamp.life += dtSec;
      if (lamp.life >= lamp.maxLife) {
        g.lamps.splice(i, 1);
      }
    }

    const cosY = Math.cos(g.yaw);
    const sinY = Math.sin(g.yaw);
    const cosP = Math.cos(g.pitch);
    const sinP = Math.sin(g.pitch);

    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    const scale = Math.min(this.width, this.height) * 0.78;
    const fov = 1.65;

    // 4. Vẽ Khung Thước Không Gian 3D (MARKS) nếu ở chế độ Gather / HUD
    if (g.enableMarks || this.mode === 'gather_hud') {
      this.drawGatherMarksFrame(ctx, cx, cy, scale, cosY, sinY, cosP, sinP, fov);
    }

    // Tham số hiệu ứng Gió Thổi Cát Bay (DRIFT)
    const windDirX = Math.cos(g.driftAngle);
    const windDirY = Math.sin(g.driftAngle);
    const driftWave = Math.sin(tSec * 0.45) * 0.22 + 0.18;

    // Góc tự xoay của đĩa Thái Cực Âm Dương
    const taijiSpin = tSec * 0.48;
    const cosT = Math.cos(taijiSpin);
    const sinT = Math.sin(taijiSpin);

    // Easing cho quá trình biến hình (flight morph)
    const rawF = g.morphProgress;
    const easeF = rawF < 0.5 ? 4 * rawF * rawF * rawF : 1 - Math.pow(-2 * rawF + 2, 3) / 2;
    const hump = Math.sin(Math.PI * easeF); // Độ vọt cánh cung khi tan rã & tụ hợp

    // 5. Duyệt và vẽ từng hạt cát đa chiều (3D Sand Grains + Wind Trails + Snare Light Illumination)
    for (let i = 0; i < g.points.length; i++) {
      const pt = g.points[i];
      const sA = pt.shapes[g.morphFrom];
      const sB = pt.shapes[g.morphTo];

      // Nếu hình khối là TAIJI (index 1), xoay nhẹ quanh trục Z đúng chuẩn gather.be-of-dao.com
      let ax = sA.x, ay = sA.y, az = sA.z;
      if (g.morphFrom === 1) {
        ax = sA.x * cosT - sA.y * sinT;
        ay = sA.x * sinT + sA.y * cosT;
      }
      let bx = sB.x, by = sB.y, bz = sB.z;
      if (g.morphTo === 1) {
        bx = sB.x * cosT - sB.y * sinT;
        by = sB.x * sinT + sB.y * cosT;
      }

      // Nội suy vị trí + hiệu ứng tung cánh cung xoáy (SWARM + MELT flight)
      let x = ax + (bx - ax) * easeF;
      let y = ay + (by - ay) * easeF;
      let z = az + (bz - az) * easeF;
      let lum = sA.lum + (sB.lum - sA.lum) * easeF;

      if (hump > 0.001) {
        const swirlAngle = pt.seed * Math.PI * 4 + tSec * 2.2;
        const splash = hump * 0.24 * (0.4 + 0.6 * pt.seed);
        x += Math.cos(swirlAngle) * splash;
        y += Math.sin(swirlAngle) * splash;
        z += Math.sin(swirlAngle * 1.7) * splash * 0.85;
      }

      // Nhịp thở sinh học (BREATH)
      x *= breath;
      y *= breath;
      z *= breath;

      // Hiệu ứng Gió Cát Tan Rã & Bay Lượn (DRIFT + TRAILS)
      let driftAmount = 0;
      if (g.enableDrift && this.mode !== 'gather_hud') {
        const proj = x * windDirX + y * windDirY;
        if (proj > driftWave) {
          const over = Math.min(1, (proj - driftWave) / 0.42);
          const cyc = (tSec * (0.28 + 0.25 * pt.seed) + pt.seed * 7.13) % 1;
          driftAmount = over * Math.sin(cyc * Math.PI);
          const gust = driftAmount * driftAmount * 0.55;
          x += windDirX * gust + Math.sin(tSec * 2.4 + pt.seed * 12) * 0.08 * driftAmount;
          y += windDirY * gust + Math.cos(tSec * 2.1 + pt.seed * 15) * 0.08 * driftAmount;
          z += Math.sin(tSec * 1.9 + pt.seed * 9) * 0.12 * driftAmount;
        }
      }

      // Phép chiếu 3D (Yaw & Pitch Rotation -> Screen Space)
      const x1 = x * cosY + z * sinY;
      const z1 = -x * sinY + z * cosY;
      const y2 = y * cosP - z1 * sinP;
      const z2 = y * sinP + z1 * cosP;

      const depth = fov / Math.max(0.35, fov + z2);
      let sx = cx + x1 * scale * depth;
      let sy = cy + y2 * scale * depth;

      // Tương tác "Bàn Tay Lướt Qua Khói Cát" (Pointer Smoke Wake - uBrush)
      if (p.trail.length > 0) {
        for (let b = 0; b < p.trail.length; b++) {
          const br = p.trail[b];
          const dx = sx - br.x;
          const dy = sy - br.y;
          const distSq = dx * dx + dy * dy;
          const brushRadSq = 135 * 135;
          if (distSq < brushRadSq) {
            const falloff = (1 - distSq / brushRadSq) * Math.max(0, 1 - br.age / 0.65);
            // Đẩy xoáy hạt cát theo chiều vuốt + lực xoáy vuông góc (vortex)
            sx += (br.vx * 1.8 - dy * 0.14) * falloff;
            sy += (br.vy * 1.8 + dx * 0.14) * falloff;
          }
        }
      }

      // Lưu vết để vẽ tia cát bay (Sand Streaks - TRAILS)
      const prevSx = pt.sx || sx;
      const prevSy = pt.sy || sy;
      pt.prevSx = prevSx;
      pt.prevSy = prevSy;
      pt.sx = sx;
      pt.sy = sy;
      pt.sz = z2;

      // Tính toán ánh sáng từ các Đèn Năng Lượng (Snare Lamps - LIGHT)
      let rCol = 236;
      let gCol = 224;
      let bCol = 202;
      let extraGlow = 0;

      for (let l = 0; l < g.lamps.length; l++) {
        const lamp = g.lamps[l];
        const ldx = x - lamp.x;
        const ldy = y - lamp.y;
        const ldz = z - lamp.z;
        const ldSq = ldx * ldx + ldy * ldy + ldz * ldz;
        const env = Math.sin(Math.min(1, lamp.life / lamp.maxLife) * Math.PI);
        const atten = (env * 0.045) / (ldSq + 0.018);
        if (atten > 0.02) {
          const w = Math.min(1, atten);
          rCol = rCol + (lamp.r - rCol) * w;
          gCol = gCol + (lamp.g - gCol) * w;
          bCol = bCol + (lamp.b - bCol) * w;
          extraGlow = Math.max(extraGlow, w);
        }
      }

      // Mặt phẳng quét chiều sâu (Depth Scan Wave - SCAN)
      if (g.enableScan) {
        const scanDist = Math.abs(z2 - g.scanZ);
        if (scanDist < 0.055) {
          const scanBoost = (1 - scanDist / 0.055) * 0.65;
          rCol = Math.min(255, rCol + 40 * scanBoost);
          gCol = Math.min(255, gCol + 55 * scanBoost);
          bCol = Math.min(255, bCol + 80 * scanBoost);
          extraGlow = Math.max(extraGlow, scanBoost);
        }
      }

      const alpha = Math.min(0.96, (0.22 + lum * 0.58 + extraGlow * 0.35) * (1 - driftAmount * 0.45) * Math.min(1.15, depth));
      const radius = pt.size * depth * (1 + extraGlow * 0.45);

      // Vẽ vệt đuôi hạt cát khi đang biến hình hoặc bị gió cuốn (TRAILS)
      const moveDistSq = (sx - prevSx) * (sx - prevSx) + (sy - prevSy) * (sy - prevSy);
      if ((driftAmount > 0.08 || hump > 0.08 || moveDistSq > 14) && moveDistSq < 2500) {
        ctx.strokeStyle = `rgba(${rCol | 0}, ${gCol | 0}, ${bCol | 0}, ${alpha * 0.42})`;
        ctx.lineWidth = Math.max(0.6, radius * 0.65);
        ctx.beginPath();
        ctx.moveTo(prevSx, prevSy);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }

      // Vẽ hạt cát 3D
      ctx.fillStyle = `rgba(${rCol | 0}, ${gCol | 0}, ${bCol | 0}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Vẽ tâm các Đèn Năng Lượng Trong Cát (Volumetric Snare Lamp Cores & HUD Tags)
    for (let l = 0; l < g.lamps.length; l++) {
      const lamp = g.lamps[l];
      const lx1 = lamp.x * cosY + lamp.z * sinY;
      const lz1 = -lamp.x * sinY + lamp.z * cosY;
      const ly2 = lamp.y * cosP - lz1 * sinP;
      const lz2 = lamp.y * sinP + lz1 * cosP;
      const lDepth = fov / Math.max(0.35, fov + lz2);
      const lsx = cx + lx1 * scale * lDepth;
      const lsy = cy + ly2 * scale * lDepth;
      lamp.sx = lsx;
      lamp.sy = lsy;

      const env = Math.sin(Math.min(1, lamp.life / lamp.maxLife) * Math.PI);
      const glowR = (38 + 12 * Math.sin(tSec * 4 + lamp.phase)) * env * lDepth;

      if (glowR > 2) {
        const grad = ctx.createRadialGradient(lsx, lsy, 1, lsx, lsy, glowR);
        grad.addColorStop(0, `rgba(255, 255, 255, ${0.85 * env})`);
        grad.addColorStop(0.25, `rgba(${lamp.r}, ${lamp.g}, ${lamp.b}, ${0.55 * env})`);
        grad.addColorStop(1, `rgba(${lamp.r}, ${lamp.g}, ${lamp.b}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lsx, lsy, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Nhãn HUD nhỏ cạnh đèn năng lượng đúng chuẩn gather.be-of-dao.com
        if (g.enableTrackers || this.mode === 'gather_hud') {
          ctx.font = '600 9px "JetBrains Mono", monospace';
          ctx.fillStyle = `rgba(${lamp.r}, ${lamp.g}, ${lamp.b}, ${0.78 * env})`;
          ctx.fillText(`LIGHT ${lamp.name.toUpperCase()} ${lamp.x >= 0 ? '+' : ''}${lamp.x.toFixed(2)}`, lsx + 12, lsy - 8);
        }
      }
    }

    // 7. Vẽ Hệ Thống HUD Khóa Mục Tiêu & Đường Nối Chòm Sao (TRACK + LINKS)
    if (g.enableTrackers || this.mode === 'gather_hud') {
      this.renderGatherHUD(ctx, now, dtSec);
    }

    // 8. Vẽ Huy Hiệu Trạng Thái Gather · 聚 Góc Dưới Bên Trái
    this.renderGatherStatusBadge(ctx);
  },

  drawGatherMarksFrame(ctx, cx, cy, scale, cosY, sinY, cosP, sinP, fov) {
    // Khung chữ nhật 3D bao quanh đám mây điểm + các vạch thước đo (MARKS)
    const hw = 0.68;
    const hh = 0.38;
    const corners3D = [
      { x: -hw, y: -hh, z: 0 },
      { x:  hw, y: -hh, z: 0 },
      { x:  hw, y:  hh, z: 0 },
      { x: -hw, y:  hh, z: 0 }
    ];

    const proj = corners3D.map(c => {
      const x1 = c.x * cosY + c.z * sinY;
      const z1 = -c.x * sinY + c.z * cosY;
      const y2 = c.y * cosP - z1 * sinP;
      const z2 = c.y * sinP + z1 * cosP;
      const d = fov / Math.max(0.35, fov + z2);
      return { x: cx + x1 * scale * d, y: cy + y2 * scale * d };
    });

    ctx.save();
    ctx.strokeStyle = 'rgba(232, 224, 210, 0.11)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(proj[0].x, proj[0].y);
    ctx.lineTo(proj[1].x, proj[1].y);
    ctx.lineTo(proj[2].x, proj[2].y);
    ctx.lineTo(proj[3].x, proj[3].y);
    ctx.closePath();
    ctx.stroke();

    // Vẽ các dấu ngoặc vuông ở 4 góc khung 3D
    const tick = 10;
    ctx.strokeStyle = 'rgba(255, 233, 196, 0.32)';
    for (let i = 0; i < 4; i++) {
      const cur = proj[i];
      const prev = proj[(i + 3) % 4];
      const next = proj[(i + 1) % 4];
      const dx1 = (prev.x - cur.x);
      const dy1 = (prev.y - cur.y);
      const l1 = Math.hypot(dx1, dy1) || 1;
      const dx2 = (next.x - cur.x);
      const dy2 = (next.y - cur.y);
      const l2 = Math.hypot(dx2, dy2) || 1;

      ctx.beginPath();
      ctx.moveTo(cur.x + (dx1 / l1) * tick, cur.y + (dy1 / l1) * tick);
      ctx.lineTo(cur.x, cur.y);
      ctx.lineTo(cur.x + (dx2 / l2) * tick, cur.y + (dy2 / l2) * tick);
      ctx.stroke();
    }
    ctx.restore();
  },

  renderGatherHUD(ctx, now, dtSec) {
    const g = this.gather;
    const trackers = g.trackers;

    // Cập nhật vị trí các hộp khóa mục tiêu (TRACK) nhảy giữa các hạt cát 3D
    for (let i = 0; i < trackers.length; i++) {
      const tr = trackers[i];
      if (now >= tr.nextHopTime) {
        tr.ptIdx = tr.targetPtIdx;
        tr.targetPtIdx = Math.floor(Math.random() * g.points.length);
        tr.seekProgress = 0.0;
        tr.nextHopTime = now + 1800 + Math.random() * 2400;
      }

      if (tr.seekProgress < 1.0) {
        tr.seekProgress = Math.min(1.0, tr.seekProgress + dtSec * 2.4);
      }

      const ptA = g.points[tr.ptIdx] || g.points[0];
      const ptB = g.points[tr.targetPtIdx] || g.points[0];
      const s = tr.seekProgress * tr.seekProgress * (3 - 2 * tr.seekProgress);

      tr.sx = ptA.sx + (ptB.sx - ptA.sx) * s;
      tr.sy = ptA.sy + (ptB.sy - ptA.sy) * s;

      const shapeCur = ptB.shapes[g.shapeIndex] || ptB.shapes[0];
      tr.x = shapeCur.x;
      tr.y = shapeCur.y;
      tr.z = shapeCur.z;
    }

    ctx.save();

    // 1. Vẽ Đường Nối Chòm Sao Mảnh (Constellation Hairline LINKS)
    if (g.enableLinks || this.mode === 'gather_hud') {
      ctx.lineWidth = 0.85;
      for (let i = 0; i < trackers.length; i++) {
        for (let j = i + 1; j < trackers.length; j++) {
          const a = trackers[i];
          const b = trackers[j];
          const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy);
          const maxDist = Math.min(this.width, this.height) * 0.36;
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.28;
            ctx.strokeStyle = `rgba(232, 224, 210, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
          }
        }

        // Nối Tracker với Đèn Năng Lượng gần đó
        for (let l = 0; l < g.lamps.length; l++) {
          const lamp = g.lamps[l];
          if (!lamp.sx) continue;
          const dist = Math.hypot(trackers[i].sx - lamp.sx, trackers[i].sy - lamp.sy);
          if (dist < 240) {
            const alpha = (1 - dist / 240) * 0.35;
            ctx.strokeStyle = `rgba(${lamp.r}, ${lamp.g}, ${lamp.b}, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(trackers[i].sx, trackers[i].sy);
            ctx.lineTo(lamp.sx, lamp.sy);
            ctx.stroke();
          }
        }
      }
    }

    // 2. Vẽ Hộp Khóa Mục Tiêu Góc Vuông (Corner-Bracket Target Lock Boxes - TRACK)
    ctx.font = '500 9px "JetBrains Mono", monospace';
    for (let i = 0; i < trackers.length; i++) {
      const tr = trackers[i];
      const isSeeking = tr.seekProgress < 0.92;
      const half = (tr.boxSize * (isSeeking ? 1.25 : 1.0)) * 0.5;
      const corner = Math.max(4, half * 0.48);
      const x = tr.sx;
      const y = tr.sy;

      ctx.strokeStyle = isSeeking ? 'rgba(255, 171, 61, 0.65)' : 'rgba(235, 226, 210, 0.72)';
      ctx.lineWidth = 1.0;

      // 4 dấu ngoặc góc vuông (Corner Brackets)
      ctx.beginPath();
      // Top-Left
      ctx.moveTo(x - half, y - half + corner);
      ctx.lineTo(x - half, y - half);
      ctx.lineTo(x - half + corner, y - half);
      // Top-Right
      ctx.moveTo(x + half - corner, y - half);
      ctx.lineTo(x + half, y - half);
      ctx.lineTo(x + half, y - half + corner);
      // Bottom-Right
      ctx.moveTo(x + half, y + half - corner);
      ctx.lineTo(x + half, y + half);
      ctx.lineTo(x + half - corner, y + half);
      // Bottom-Left
      ctx.moveTo(x - half + corner, y + half);
      ctx.lineTo(x - half, y + half);
      ctx.lineTo(x - half, y + half - corner);
      ctx.stroke();

      // Tâm chữ thập (+)
      ctx.beginPath();
      ctx.moveTo(x - 2.5, y);
      ctx.lineTo(x + 2.5, y);
      ctx.moveTo(x, y - 2.5);
      ctx.lineTo(x, y + 2.5);
      ctx.stroke();

      // Thông số tọa độ 3D thời gian thực (01 +0.42 -0.18 | SEEK)
      const fmt = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
      const label = isSeeking
        ? `${tr.id} SEEK`
        : `${tr.id} ${fmt(tr.x)} ${fmt(tr.y)}`;
      ctx.fillStyle = isSeeking ? 'rgba(255, 171, 61, 0.78)' : 'rgba(232, 224, 210, 0.68)';
      ctx.fillText(label, x + half + 5, y + 3);
    }

    ctx.restore();
  },

  renderGatherStatusBadge(ctx) {
    const g = this.gather;
    const formName = g.shapeNames[g.shapeIndex] || 'DAO · 聚';
    ctx.save();
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(232, 224, 210, 0.42)';
    ctx.fillText(`GATHER · 聚  [ ${formName} ]  •  LƯỚT CHUỘT: KHÓI CÁT  •  CLICK: ĐÈN NĂNG LƯỢNG`, 18, this.height - 14);
    ctx.restore();
  },

  // ==========================================================================
  // CÁC HIỆU ỨNG KHÍ QUYỂN 5D TRUYỀN THỐNG (SẤM SÉT, PHÁO HOA, HOA ĐÀO, TUYẾT, MƯA)
  // ==========================================================================
  spawnInitialParticles() {
    const count = this.getOptimalCount();

    if (this.mode === 'sakura') {
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          size: Math.random() * 8 + 6,
          speedY: Math.random() * 1.5 + 0.8,
          speedX: Math.random() * 1.5 - 0.5,
          angle: Math.random() * Math.PI * 2,
          angularSpeed: (Math.random() - 0.5) * 0.03,
          flip: Math.random() * Math.PI,
          flipSpeed: Math.random() * 0.04 + 0.01,
          color: Math.random() > 0.3 ? '#ffb7c5' : '#ff94aa',
          opacity: Math.random() * 0.5 + 0.4
        });
      }
    } else if (this.mode === 'snow') {
      for (let i = 0; i < count * 1.4; i++) {
        this.particles.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          radius: Math.random() * 3 + 1,
          speedY: Math.random() * 1.2 + 0.5,
          speedX: Math.random() * 0.6 - 0.3,
          sway: Math.random() * 0.02,
          swayOffset: Math.random() * Math.PI * 2,
          opacity: Math.random() * 0.7 + 0.3
        });
      }
    } else if (this.mode === 'rain') {
      for (let i = 0; i < count * 1.8; i++) {
        this.particles.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          length: Math.random() * 18 + 12,
          speedY: Math.random() * 10 + 14,
          speedX: -2.5,
          color: Math.random() > 0.2 ? 'rgba(56, 189, 248, 0.45)' : 'rgba(6, 182, 212, 0.6)',
          width: Math.random() * 1.2 + 0.8
        });
      }
    }
  },

  getOptimalCount() {
    return this.width < 768 ? 28 : 55;
  },

  loop(now) {
    if (this.mode === 'off') return;

    const dt = Math.min((now - this.lastTime), 50);
    this.lastTime = now;

    this.ctx.clearRect(0, 0, this.width, this.height);

    switch (this.mode) {
      case 'gather':
      case 'gather_taiji':
      case 'gather_hud':
        this.renderGather(now, dt);
        break;
      case 'lightning':
        this.renderLightning(now, dt);
        break;
      case 'fireworks':
        this.renderFireworks(now, dt);
        break;
      case 'sakura':
        this.renderSakura(dt);
        break;
      case 'snow':
        this.renderSnow(dt);
        break;
      case 'rain':
        this.renderRain(dt);
        break;
    }

    this.animId = requestAnimationFrame(this.loop);
  },

  // ==================== 1. HIỆU ỨNG SẤM SÉT 5D (LIGHTNING) ====================
  renderLightning(now, dt) {
    const ctx = this.ctx;
    this.lightning.timer += dt;

    if (this.lightning.timer > this.lightning.interval) {
      this.lightning.timer = 0;
      this.lightning.interval = Math.random() * 2500 + 1500;
      this.createLightningBolt();
    }

    if (this.lightning.screenFlash > 0) {
      ctx.fillStyle = `rgba(186, 230, 253, ${this.lightning.screenFlash * 0.18})`;
      ctx.fillRect(0, 0, this.width, this.height);
      this.lightning.screenFlash = Math.max(0, this.lightning.screenFlash - dt * 0.0035);
    }

    for (let i = this.lightning.bolts.length - 1; i >= 0; i--) {
      const bolt = this.lightning.bolts[i];
      bolt.life -= dt * 0.003;

      if (bolt.life <= 0) {
        this.lightning.bolts.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.strokeStyle = bolt.color;
      ctx.lineWidth = bolt.thickness * bolt.life;
      ctx.shadowBlur = 20;
      ctx.shadowColor = bolt.glow;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'miter';

      ctx.beginPath();
      for (let j = 0; j < bolt.path.length; j++) {
        const pt = bolt.path[j];
        if (j === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      if (bolt.branches) {
        for (const branch of bolt.branches) {
          ctx.beginPath();
          ctx.lineWidth = (bolt.thickness * 0.5) * bolt.life;
          for (let k = 0; k < branch.length; k++) {
            const pt = branch[k];
            if (k === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  },

  createLightningBolt() {
    const startX = Math.random() * (this.width * 0.8) + (this.width * 0.1);
    const startY = 0;
    const endX = startX + (Math.random() * 300 - 150);
    const endY = this.height * (Math.random() * 0.4 + 0.55);

    const path = this.generateLightningPath(startX, startY, endX, endY, 6);
    const branches = [];

    const numBranches = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < numBranches; i++) {
      const idx = Math.floor(Math.random() * (path.length - 4)) + 2;
      const origin = path[idx];
      const branchEndX = origin.x + (Math.random() * 200 - 100);
      const branchEndY = origin.y + (Math.random() * 150 + 60);
      branches.push(this.generateLightningPath(origin.x, origin.y, branchEndX, branchEndY, 3));
    }

    const isCyan = Math.random() > 0.3;
    this.lightning.bolts.push({
      path,
      branches,
      thickness: Math.random() * 3 + 2.5,
      color: isCyan ? '#e0f2fe' : '#f5d0fe',
      glow: isCyan ? '#0284c7' : '#c026d3',
      life: 1.0
    });

    this.lightning.screenFlash = 1.0;

    const mainApp = document.getElementById('main-app');
    if (mainApp) {
      mainApp.style.transform = `translate(${(Math.random() - 0.5) * 4}px, ${(Math.random() - 0.5) * 4}px)`;
      setTimeout(() => {
        mainApp.style.transform = 'translate(0, 0)';
      }, 90);
    }
  },

  generateLightningPath(x1, y1, x2, y2, segments) {
    const path = [{ x: x1, y: y1 }];
    const dx = (x2 - x1) / segments;
    const dy = (y2 - y1) / segments;

    for (let i = 1; i < segments; i++) {
      const jitterX = (Math.random() - 0.5) * 45;
      const jitterY = (Math.random() - 0.5) * 15;
      path.push({
        x: x1 + dx * i + jitterX,
        y: y1 + dy * i + jitterY
      });
    }

    path.push({ x: x2, y: y2 });
    return path;
  },

  // ==================== 2. HIỆU ỨNG PHÁO HOA (FIREWORKS) ====================
  renderFireworks(now, dt) {
    const ctx = this.ctx;
    this.fireworks.timer += dt;

    if (this.fireworks.timer > 700) {
      this.fireworks.timer = 0;
      this.launchRocket();
    }

    for (let i = this.fireworks.rockets.length - 1; i >= 0; i--) {
      const r = this.fireworks.rockets[i];
      r.y += r.vy;
      r.x += r.vx;
      r.vy += 0.08;

      ctx.save();
      ctx.fillStyle = r.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = r.color;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (r.vy >= -0.5 || r.y <= r.targetY) {
        this.explodeRocket(r);
        this.fireworks.rockets.splice(i, 1);
      }
    }

    for (let i = this.fireworks.sparks.length - 1; i >= 0; i--) {
      const s = this.fireworks.sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.07;
      s.vx *= 0.98;
      s.alpha -= 0.015;

      if (s.alpha <= 0) {
        this.fireworks.sparks.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, s.alpha);
      ctx.fillStyle = s.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },

  launchRocket() {
    const colors = ['#f59e0b', '#ec4899', '#06b6d4', '#10b981', '#a855f7', '#ef4444'];
    const chosenColor = colors[Math.floor(Math.random() * colors.length)];
    this.fireworks.rockets.push({
      x: Math.random() * (this.width * 0.7) + (this.width * 0.15),
      y: this.height + 10,
      targetY: Math.random() * (this.height * 0.45) + (this.height * 0.1),
      vx: (Math.random() - 0.5) * 1.5,
      vy: -(Math.random() * 4 + 9.5),
      color: chosenColor
    });
  },

  explodeRocket(r) {
    const sparkCount = Math.floor(Math.random() * 45) + 50;
    const palette = [r.color, '#ffffff', '#fde047'];

    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 1.2;
      this.fireworks.sparks.push({
        x: r.x,
        y: r.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: palette[Math.floor(Math.random() * palette.length)],
        radius: Math.random() * 2 + 1,
        alpha: 1.0
      });
    }
  },

  // ==================== 3. HIỆU ỨNG HOA ĐÀO RƠI (SAKURA) ====================
  renderSakura(dt) {
    const ctx = this.ctx;

    for (const p of this.particles) {
      p.y += p.speedY;
      p.x += p.speedX + Math.sin(p.angle) * 0.8;
      p.angle += p.angularSpeed;
      p.flip += p.flipSpeed;

      if (p.y > this.height + 20) {
        p.y = -20;
        p.x = Math.random() * this.width;
      }
      if (p.x > this.width + 20) p.x = -20;
      else if (p.x < -20) p.x = this.width + 20;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.scale(Math.cos(p.flip), 1);

      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.opacity;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-p.size / 2, -p.size / 2, -p.size, p.size / 3, 0, p.size);
      ctx.bezierCurveTo(p.size, p.size / 3, p.size / 2, -p.size / 2, 0, 0);
      ctx.fill();

      ctx.restore();
    }
  },

  // ==================== 4. HIỆU ỨNG TUYẾT RƠI (SNOWFALL) ====================
  renderSnow(dt) {
    const ctx = this.ctx;

    for (const p of this.particles) {
      p.y += p.speedY;
      p.swayOffset += p.sway;
      p.x += p.speedX + Math.sin(p.swayOffset) * 0.7;

      if (p.y > this.height + 10) {
        p.y = -10;
        p.x = Math.random() * this.width;
      }

      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = p.opacity;
      ctx.shadowBlur = p.radius > 2 ? 8 : 0;
      ctx.shadowColor = '#e0f2fe';

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },

  // ==================== 5. HIỆU ỨNG MƯA RƠI CYBERPUNK (RAIN) ====================
  renderRain(dt) {
    const ctx = this.ctx;

    for (const p of this.particles) {
      p.y += p.speedY;
      p.x += p.speedX;

      if (p.y > this.height) {
        if (Math.random() > 0.4) {
          this.ripples.push({
            x: p.x,
            y: this.height - Math.random() * 15,
            radius: 1,
            maxRadius: Math.random() * 12 + 6,
            alpha: 0.6
          });
        }
        p.y = -p.length;
        p.x = Math.random() * (this.width + 200);
      }

      ctx.save();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.speedX * (p.length / p.speedY), p.y + p.length);
      ctx.stroke();
      ctx.restore();
    }

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rip = this.ripples[i];
      rip.radius += 0.6;
      rip.alpha -= 0.025;

      if (rip.alpha <= 0 || rip.radius >= rip.maxRadius) {
        this.ripples.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.strokeStyle = `rgba(56, 189, 248, ${rip.alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(rip.x, rip.y, rip.radius * 2, rip.radius * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  AmbientEngine.init();
});

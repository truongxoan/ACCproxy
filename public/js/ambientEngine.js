// ============================================================================
// ENI 5D ATMOSPHERIC & GATHER · 聚 3D POINT-CLOUD ENGINE v18.0 REALISM APEX
// Nền 3D hoàn toàn nằm ẩn dưới Background (z-0, sau các tấm kính mờ glass-panel)
// - Gather · 聚 3D Point-Cloud (DAO, TAIJI Âm Dương, ORB, RIPPLE) mượt mà, hạt mịn
// - Sấm Sét Thực Tế Ngoài Đời (Midpoint Displacement Fractal Lightning, Multi-branch
//   Stepped Leaders, Return-Stroke Re-ignition Flicker, Cloud Anvil Illumination)
// - Mưa Rào Ngoài Đời Thực (3-Layer Depth Parallax Rain, Wind Gusts, Ground Splash
//   Droplets & Elliptical Water Ripples)
// - Giông Bão Điện Ảnh (Storm Mode = Mưa Rào 3 Lớp + Sấm Sét Thực Tế Kết Hợp)
// ============================================================================

const AmbientEngine = {
  canvas: null,
  ctx: null,
  mode: 'gather', // 'gather' | 'gather_taiji' | 'gather_hud' | 'storm' | 'lightning' | 'rain' | 'fireworks' | 'sakura' | 'snow' | 'off'
  animId: null,
  width: 0,
  height: 0,
  particles: [],
  lastTime: 0,

  // ==================== GATHER · 聚 3D STATE ====================
  gather: {
    initialized: false,
    points: [],
    ambientDust: [],
    pointCount: 2200,
    shapeIndex: 0,
    shapeNames: ['DAO · 聚', 'TAIJI · 陰陽', 'ORB · 靈球', 'RIPPLE · 波紋'],
    morphFrom: 0,
    morphTo: 0,
    morphProgress: 1.0,
    morphDuration: 2.8, // seconds
    lastShapeSwitch: 0,
    shapeHoldTime: 9000, // ms between auto-morphs
    yaw: 0,
    pitch: 0,
    targetYaw: 0,
    targetPitch: 0,
    breathPhase: 0,
    scanZ: 0,
    driftAngle: -0.58,
    enableTrackers: true,
    enableLinks: true,
    enableDrift: true,
    enableMarks: true,
    enableScan: true,
    pointer: {
      x: 0,
      y: 0,
      nx: 0,
      ny: 0,
      vx: 0,
      vy: 0,
      active: false,
      trail: []
    },
    lampPalettes: [
      { name: 'Amber',  r: 255, g: 176, b: 68,  hex: '#ffb044' },
      { name: 'Jade',   r: 68,  g: 230, b: 196, hex: '#44e6c4' },
      { name: 'Gold',   r: 255, g: 228, b: 168, hex: '#ffe4a8' },
      { name: 'Ice',    r: 176, g: 218, b: 255, hex: '#b0daff' },
      { name: 'Ember',  r: 255, g: 92,  b: 64,  hex: '#ff5c40' },
      { name: 'Violet', r: 162, g: 132, b: 255, hex: '#a284ff' }
    ],
    lampPaletteIdx: 0,
    lamps: [],
    lastAutoLamp: 0,
    trackers: []
  },

  // ==================== REALISTIC LIGHTNING STATE ====================
  lightning: {
    bolts: [],
    sheetFlashes: [],
    timer: 0,
    interval: 2200,
    skyGlow: 0,
    skyCenterX: 0.5,
    skyCenterY: 0.1
  },

  // ==================== REALISTIC RAIN STATE ====================
  rain: {
    drops: [],
    splashes: [],
    ripples: [],
    mistClouds: [],
    windAngle: -0.14,
    targetWindAngle: -0.14,
    windTimer: 0
  },

  // ==================== FIREWORKS STATE ====================
  fireworks: {
    rockets: [],
    sparks: [],
    timer: 0
  },

  init() {
    this.canvas = document.getElementById('ambient-canvas');
    if (!this.canvas) return;
    // Giữ tuyệt đối ở dưới nền (z-0) để không bao giờ đè lên chữ hay bảng điều khiển
    this.canvas.style.zIndex = '0';
    this.ctx = this.canvas.getContext('2d');

    this.resize();
    window.addEventListener('resize', () => this.resize(), { passive: true });

    this.bindPointerEvents();

    document.addEventListener('click', (e) => {
      const menu = document.getElementById('ambient-menu');
      const toggle = document.getElementById('btn-ambient-toggle');
      if (menu && !menu.contains(e.target) && toggle && !toggle.contains(e.target)) {
        menu.classList.add('hidden');
      }
    });

    const saved = localStorage.getItem('accproxy_ambient_mode') || 'gather';
    this.setMode(saved, false);
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

      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 1.2) {
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

    window.addEventListener('mousedown', (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
      if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'LABEL'].includes(tag)) return;
      if (e.target && e.target.closest && e.target.closest('button, a, input, select, textarea, #ambient-menu, .modal-backdrop')) return;
      if (this.isGatherMode()) {
        this.spawnGatherLamp(e.clientX, e.clientY);
      } else if (this.mode === 'lightning' || this.mode === 'storm') {
        this.createRealisticLightningBolt(e.clientX);
      }
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
    this.rain.drops = [];
    this.rain.splashes = [];
    this.rain.ripples = [];
    this.fireworks.rockets = [];
    this.fireworks.sparks = [];
    this.lightning.bolts = [];
    this.lightning.sheetFlashes = [];
    this.lightning.skyGlow = 0;

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
        this.gather.shapeIndex = 1;
        this.gather.morphFrom = 1;
        this.gather.morphTo = 1;
        this.gather.morphProgress = 1.0;
      }
    } else if (this.mode === 'rain' || this.mode === 'storm') {
      this.initRealisticRain(this.mode === 'storm');
      if (this.mode === 'storm') {
        this.createRealisticLightningBolt();
      }
    } else if (this.mode === 'lightning') {
      this.createRealisticLightningBolt();
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
      storm:        { icon: '⛈️', label: 'Giông Bão Thật' },
      lightning:    { icon: '⚡', label: 'Sấm Sét Thật' },
      rain:         { icon: '🌧️', label: 'Mưa Rào Thật' },
      fireworks:    { icon: '🎆', label: 'Pháo Hoa' },
      sakura:       { icon: '🌸', label: 'Hoa Đào' },
      snow:         { icon: '❄️', label: 'Tuyết Rơi' },
      off:          { icon: '🚫', label: 'Đã Tắt Nền' }
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
  // 1. GATHER · 聚 3D BACKGROUND POINT-CLOUD ENGINE (SILKY SUBSURFACE EDITION)
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
    for (let guard = 0; guard < 200; guard++) {
      const x = (Math.random() - 0.5) * 1.56;
      const y = (Math.random() - 0.5) * 0.72;
      let hit = false;
      let edge = 0;

      if (x >= -0.64 && x <= -0.24 && Math.abs(y) <= 0.25) {
        if (x <= -0.47) {
          hit = true;
          edge = Math.min(Math.abs(x + 0.64), 0.25 - Math.abs(y)) / 0.08;
        } else {
          const dx = x + 0.47;
          const r = Math.hypot(dx, y);
          if (r <= 0.25) {
            hit = true;
            edge = (0.25 - r) / 0.08;
          }
        }
      }

      if (!hit && y >= -0.24 && y <= 0.24) {
        const t = (0.24 - y) / 0.48;
        const halfW = 0.23 * t;
        if (Math.abs(x) <= halfW) {
          hit = true;
          edge = Math.min(halfW - Math.abs(x), y + 0.24) / 0.07;
        }
      }

      if (!hit) {
        const r = Math.hypot(x - 0.46, y);
        if (r <= 0.245) {
          hit = true;
          edge = (0.245 - r) / 0.08;
        }
      }

      if (hit) {
        const sh = Math.min(1, Math.max(0.15, edge));
        const th = 0.035 + 0.14 * Math.pow(sh, 0.65);
        const z = (Math.random() - 0.5) * 2 * th + 0.025 * this.fbm2(x * 3.5, y * 3.5);
        const lum = 0.45 + 0.52 * Math.pow(sh, 0.55);
        return { x, y, z, lum };
      }
    }
    return { x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.3, z: 0, lum: 0.7 };
  },

  sampleShapeTAIJI() {
    const R = 0.48;
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

      const rim = Math.exp(-Math.pow((R - r) / 0.032, 2));
      const eyeRim = Math.exp(-Math.pow((dTop - eyeR) / 0.02, 2)) + Math.exp(-Math.pow((dBot - eyeR) / 0.02, 2));
      const keepProb = yang ? 0.94 : Math.min(0.95, 0.32 + 0.65 * (rim + eyeRim));
      if (Math.random() > keepProb) continue;

      const lum = yang
        ? Math.min(1, 0.62 + 0.35 * (1 - r / R) + 0.22 * rim)
        : Math.min(1, 0.24 + 0.58 * rim + 0.45 * eyeRim);
      const th = 0.028 + 0.075 * (1 - (r / R) * (r / R));
      const z = (Math.random() - 0.5) * 2 * th + (yang ? 0.024 : -0.024);
      return { x, y, z, lum };
    }
    return { x: 0, y: 0, z: 0, lum: 0.8 };
  },

  sampleShapeORB() {
    const R = 0.46;
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const shellBias = Math.pow(Math.random(), 0.26);
    const rad = R * (0.25 + 0.75 * shellBias);
    const x = rad * s * Math.cos(theta);
    const y = rad * u;
    const z = rad * s * Math.sin(theta);
    const n = 0.5 + 0.5 * this.fbm2(x * 5.2 + 2.1, y * 5.2 - 1.4);
    const rim = Math.pow(shellBias, 1.4);
    const lum = Math.min(1, 0.35 + 0.48 * n + 0.35 * rim);
    return { x, y, z, lum };
  },

  sampleShapeRIPPLE() {
    const R = 0.54;
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
      const z = 0.07 * w * fade + (Math.random() - 0.5) * 0.025;
      const lum = Math.min(1, (0.3 + 0.7 * Math.pow(crest, 1.3)) * (0.4 + 0.6 * fade));
      return { x, y, z, lum };
    }
    return { x: 0, y: 0, z: 0, lum: 0.6 };
  },

  initGatherCloud() {
    const g = this.gather;
    const isMobile = this.width < 768;
    g.pointCount = isMobile ? 1150 : 2100;

    if (!g.initialized || g.points.length !== g.pointCount) {
      g.points = [];
      for (let i = 0; i < g.pointCount; i++) {
        const s0 = this.sampleShapeDAO();
        const s1 = this.sampleShapeTAIJI();
        const s2 = this.sampleShapeORB();
        const s3 = this.sampleShapeRIPPLE();
        const tint = Math.random();
        g.points.push({
          shapes: [s0, s1, s2, s3],
          seed: Math.random(),
          size: Math.random() * 1.15 + 0.55,
          tint, // 0..1 để pha màu vàng cát / ngọc bích / hổ phách nhẹ nhàng
          driftProgress: Math.random(),
          sx: 0,
          sy: 0,
          sz: 0,
          prevSx: 0,
          prevSy: 0
        });
      }

      // Tạo các hạt bụi tinh vân lơ lửng khắp không gian nền (Deep Space Stardust)
      g.ambientDust = [];
      const dustCount = isMobile ? 65 : 130;
      for (let i = 0; i < dustCount; i++) {
        g.ambientDust.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          vx: (Math.random() - 0.5) * 0.25,
          vy: -Math.random() * 0.35 - 0.08,
          r: Math.random() * 1.4 + 0.4,
          alpha: Math.random() * 0.35 + 0.08,
          phase: Math.random() * Math.PI * 2
        });
      }

      g.trackers = [];
      const trackerCount = isMobile ? 4 : 6;
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
          boxSize: 14 + (i % 3) * 3,
          nextHopTime: performance.now() + 1400 + i * 700
        });
      }

      g.initialized = true;
    }

    g.lastShapeSwitch = performance.now();
    g.lastAutoLamp = performance.now();

    if (g.lamps.length === 0) {
      this.spawnGatherLamp(this.width * 0.32, this.height * 0.45);
      this.spawnGatherLamp(this.width * 0.68, this.height * 0.55);
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

    const scale = Math.min(this.width, this.height) * 0.92;
    const cx = this.width * 0.5;
    const cy = this.height * 0.52;

    const wx = screenX !== undefined ? (screenX - cx) / scale : (Math.random() - 0.5) * 0.85;
    const wy = screenY !== undefined ? (screenY - cy) / scale : (Math.random() - 0.5) * 0.48;
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
      maxLife: 6.5,
      radius: 0.38,
      phase: Math.random() * Math.PI * 2
    });

    if (g.lamps.length > 4) {
      g.lamps.shift();
    }
  },

  renderGather(now, dt) {
    const ctx = this.ctx;
    const g = this.gather;
    if (!g.initialized) this.initGatherCloud();

    const dtSec = dt * 0.001;
    const tSec = now * 0.001;

    const cx = this.width * 0.5;
    const cy = this.height * 0.52;
    const scale = Math.min(this.width, this.height) * 0.94;
    const fov = 1.65;

    // 0. Vẽ Hào Quang Tinh Vân Nền Sâu (Deep Subsurface Nebula Halo)
    ctx.save();
    const bgGlow = ctx.createRadialGradient(cx, cy, 10, cx, cy, scale * 0.85);
    if (this.mode === 'gather_taiji') {
      bgGlow.addColorStop(0, 'rgba(16, 185, 129, 0.09)');
      bgGlow.addColorStop(0.45, 'rgba(245, 158, 11, 0.05)');
      bgGlow.addColorStop(1, 'rgba(7, 11, 20, 0)');
    } else if (this.mode === 'gather_hud') {
      bgGlow.addColorStop(0, 'rgba(6, 182, 212, 0.10)');
      bgGlow.addColorStop(0.5, 'rgba(59, 130, 246, 0.05)');
      bgGlow.addColorStop(1, 'rgba(7, 11, 20, 0)');
    } else {
      bgGlow.addColorStop(0, 'rgba(245, 158, 11, 0.085)');
      bgGlow.addColorStop(0.45, 'rgba(56, 189, 248, 0.045)');
      bgGlow.addColorStop(1, 'rgba(7, 11, 20, 0)');
    }
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, this.width, this.height);

    // Vẽ bụi sao lơ lửng dưới nền
    for (let i = 0; i < g.ambientDust.length; i++) {
      const d = g.ambientDust[i];
      d.x += d.vx;
      d.y += d.vy;
      if (d.y < -10) d.y = this.height + 10;
      if (d.x < -10) d.x = this.width + 10;
      if (d.x > this.width + 10) d.x = -10;
      const pulse = 0.6 + 0.4 * Math.sin(tSec * 1.8 + d.phase);
      ctx.fillStyle = `rgba(255, 232, 188, ${d.alpha * pulse})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 1. Tự động chuyển đổi hình khối 3D
    if (this.mode === 'gather' && now - g.lastShapeSwitch > g.shapeHoldTime) {
      this.nextGatherShape();
    } else if (this.mode === 'gather_taiji' && now - g.lastShapeSwitch > 10500) {
      g.morphFrom = g.shapeIndex;
      g.shapeIndex = g.shapeIndex === 1 ? 2 : 1;
      g.morphTo = g.shapeIndex;
      g.morphProgress = 0.0;
      g.lastShapeSwitch = now;
    }

    if (g.morphProgress < 1.0) {
      g.morphProgress = Math.min(1.0, g.morphProgress + dtSec / g.morphDuration);
    }

    // 2. Tự động thắp Đèn Năng Lượng Trong Cát
    if (now - g.lastAutoLamp > 4000) {
      g.lastAutoLamp = now;
      const angle = tSec * 0.85;
      const sx = cx + Math.cos(angle) * (this.width * 0.25);
      const sy = cy + Math.sin(angle * 1.3) * (this.height * 0.18);
      this.spawnGatherLamp(sx, sy);
    }

    // 3. Góc xoay 3D mượt mà
    const p = g.pointer;
    const autoYaw = Math.sin(tSec * 0.32) * 0.34;
    const autoPitch = Math.cos(tSec * 0.25) * 0.16;
    g.targetYaw = autoYaw + (p.active ? p.nx * 0.34 : 0);
    g.targetPitch = autoPitch + (p.active ? -p.ny * 0.22 : 0);
    g.yaw += (g.targetYaw - g.yaw) * 0.055;
    g.pitch += (g.targetPitch - g.pitch) * 0.055;

    const breath = 1.0 + 0.032 * Math.sin(tSec * 1.5);
    g.scanZ = Math.sin(tSec * 1.05) * 0.44;

    for (let i = p.trail.length - 1; i >= 0; i--) {
      p.trail[i].age += dtSec;
      if (p.trail[i].age > 0.65) p.trail.splice(i, 1);
    }

    for (let i = g.lamps.length - 1; i >= 0; i--) {
      const lamp = g.lamps[i];
      lamp.life += dtSec;
      if (lamp.life >= lamp.maxLife) g.lamps.splice(i, 1);
    }

    const cosY = Math.cos(g.yaw);
    const sinY = Math.sin(g.yaw);
    const cosP = Math.cos(g.pitch);
    const sinP = Math.sin(g.pitch);

    if (g.enableMarks || this.mode === 'gather_hud') {
      this.drawGatherMarksFrame(ctx, cx, cy, scale, cosY, sinY, cosP, sinP, fov);
    }

    const windDirX = Math.cos(g.driftAngle);
    const windDirY = Math.sin(g.driftAngle);
    const driftWave = Math.sin(tSec * 0.42) * 0.22 + 0.18;

    const taijiSpin = tSec * 0.46;
    const cosT = Math.cos(taijiSpin);
    const sinT = Math.sin(taijiSpin);

    const rawF = g.morphProgress;
    const easeF = rawF < 0.5 ? 4 * rawF * rawF * rawF : 1 - Math.pow(-2 * rawF + 2, 3) / 2;
    const hump = Math.sin(Math.PI * easeF);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < g.points.length; i++) {
      const pt = g.points[i];
      const sA = pt.shapes[g.morphFrom];
      const sB = pt.shapes[g.morphTo];

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

      let x = ax + (bx - ax) * easeF;
      let y = ay + (by - ay) * easeF;
      let z = az + (bz - az) * easeF;
      let lum = sA.lum + (sB.lum - sA.lum) * easeF;

      if (hump > 0.001) {
        const swirlAngle = pt.seed * Math.PI * 4 + tSec * 2.1;
        const splash = hump * 0.22 * (0.4 + 0.6 * pt.seed);
        x += Math.cos(swirlAngle) * splash;
        y += Math.sin(swirlAngle) * splash;
        z += Math.sin(swirlAngle * 1.7) * splash * 0.85;
      }

      x *= breath;
      y *= breath;
      z *= breath;

      let driftAmount = 0;
      if (g.enableDrift && this.mode !== 'gather_hud') {
        const proj = x * windDirX + y * windDirY;
        if (proj > driftWave) {
          const over = Math.min(1, (proj - driftWave) / 0.42);
          const cyc = (tSec * (0.26 + 0.24 * pt.seed) + pt.seed * 7.13) % 1;
          driftAmount = over * Math.sin(cyc * Math.PI);
          const gust = driftAmount * driftAmount * 0.52;
          x += windDirX * gust + Math.sin(tSec * 2.2 + pt.seed * 12) * 0.075 * driftAmount;
          y += windDirY * gust + Math.cos(tSec * 2.0 + pt.seed * 15) * 0.075 * driftAmount;
          z += Math.sin(tSec * 1.8 + pt.seed * 9) * 0.11 * driftAmount;
        }
      }

      const x1 = x * cosY + z * sinY;
      const z1 = -x * sinY + z * cosY;
      const y2 = y * cosP - z1 * sinP;
      const z2 = y * sinP + z1 * cosP;

      const depth = fov / Math.max(0.35, fov + z2);
      let sx = cx + x1 * scale * depth;
      let sy = cy + y2 * scale * depth;

      if (p.trail.length > 0) {
        for (let b = 0; b < p.trail.length; b++) {
          const br = p.trail[b];
          const dx = sx - br.x;
          const dy = sy - br.y;
          const distSq = dx * dx + dy * dy;
          const brushRadSq = 140 * 140;
          if (distSq < brushRadSq) {
            const falloff = (1 - distSq / brushRadSq) * Math.max(0, 1 - br.age / 0.65);
            sx += (br.vx * 1.65 - dy * 0.12) * falloff;
            sy += (br.vy * 1.65 + dx * 0.12) * falloff;
          }
        }
      }

      const prevSx = pt.sx || sx;
      const prevSy = pt.sy || sy;
      pt.prevSx = prevSx;
      pt.prevSy = prevSy;
      pt.sx = sx;
      pt.sy = sy;
      pt.sz = z2;

      // Màu hạt cát vàng kim pha ngọc lục bảo sang trọng
      let rCol = pt.tint > 0.7 ? 175 : 244;
      let gCol = pt.tint > 0.7 ? 235 : 220;
      let bCol = pt.tint > 0.7 ? 225 : 182;
      let extraGlow = 0;

      for (let l = 0; l < g.lamps.length; l++) {
        const lamp = g.lamps[l];
        const ldx = x - lamp.x;
        const ldy = y - lamp.y;
        const ldz = z - lamp.z;
        const ldSq = ldx * ldx + ldy * ldy + ldz * ldz;
        const env = Math.sin(Math.min(1, lamp.life / lamp.maxLife) * Math.PI);
        const atten = (env * 0.05) / (ldSq + 0.016);
        if (atten > 0.02) {
          const w = Math.min(1, atten);
          rCol = rCol + (lamp.r - rCol) * w;
          gCol = gCol + (lamp.g - gCol) * w;
          bCol = bCol + (lamp.b - bCol) * w;
          extraGlow = Math.max(extraGlow, w);
        }
      }

      if (g.enableScan) {
        const scanDist = Math.abs(z2 - g.scanZ);
        if (scanDist < 0.05) {
          const scanBoost = (1 - scanDist / 0.05) * 0.6;
          rCol = Math.min(255, rCol + 35 * scanBoost);
          gCol = Math.min(255, gCol + 60 * scanBoost);
          bCol = Math.min(255, bCol + 85 * scanBoost);
          extraGlow = Math.max(extraGlow, scanBoost);
        }
      }

      const alpha = Math.min(0.76, (0.16 + lum * 0.44 + extraGlow * 0.28) * (1 - driftAmount * 0.45) * Math.min(1.12, depth));
      const radius = pt.size * depth * (1 + extraGlow * 0.35);

      const moveDistSq = (sx - prevSx) * (sx - prevSx) + (sy - prevSy) * (sy - prevSy);
      if ((driftAmount > 0.08 || hump > 0.08 || moveDistSq > 14) && moveDistSq < 2200) {
        ctx.strokeStyle = `rgba(${rCol | 0}, ${gCol | 0}, ${bCol | 0}, ${alpha * 0.38})`;
        ctx.lineWidth = Math.max(0.5, radius * 0.6);
        ctx.beginPath();
        ctx.moveTo(prevSx, prevSy);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }

      ctx.fillStyle = `rgba(${rCol | 0}, ${gCol | 0}, ${bCol | 0}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Vẽ quầng sáng của các Đèn Năng Lượng Trong Cát
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
      const glowR = (48 + 14 * Math.sin(tSec * 3.5 + lamp.phase)) * env * lDepth;

      if (glowR > 2) {
        const grad = ctx.createRadialGradient(lsx, lsy, 1, lsx, lsy, glowR);
        grad.addColorStop(0, `rgba(255, 255, 255, ${0.58 * env})`);
        grad.addColorStop(0.28, `rgba(${lamp.r}, ${lamp.g}, ${lamp.b}, ${0.36 * env})`);
        grad.addColorStop(1, `rgba(${lamp.r}, ${lamp.g}, ${lamp.b}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lsx, lsy, glowR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    if (g.enableTrackers || this.mode === 'gather_hud') {
      this.renderGatherHUD(ctx, now, dtSec);
    }
  },

  drawGatherMarksFrame(ctx, cx, cy, scale, cosY, sinY, cosP, sinP, fov) {
    const hw = 0.72;
    const hh = 0.40;
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
    ctx.strokeStyle = 'rgba(232, 224, 210, 0.065)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(proj[0].x, proj[0].y);
    ctx.lineTo(proj[1].x, proj[1].y);
    ctx.lineTo(proj[2].x, proj[2].y);
    ctx.lineTo(proj[3].x, proj[3].y);
    ctx.closePath();
    ctx.stroke();

    const tick = 12;
    ctx.strokeStyle = 'rgba(255, 228, 175, 0.22)';
    for (let i = 0; i < 4; i++) {
      const cur = proj[i];
      const prev = proj[(i + 3) % 4];
      const next = proj[(i + 1) % 4];
      const dx1 = prev.x - cur.x;
      const dy1 = prev.y - cur.y;
      const l1 = Math.hypot(dx1, dy1) || 1;
      const dx2 = next.x - cur.x;
      const dy2 = next.y - cur.y;
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

    for (let i = 0; i < trackers.length; i++) {
      const tr = trackers[i];
      if (now >= tr.nextHopTime) {
        tr.ptIdx = tr.targetPtIdx;
        tr.targetPtIdx = Math.floor(Math.random() * g.points.length);
        tr.seekProgress = 0.0;
        tr.nextHopTime = now + 2200 + Math.random() * 2600;
      }

      if (tr.seekProgress < 1.0) {
        tr.seekProgress = Math.min(1.0, tr.seekProgress + dtSec * 2.2);
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

    if (g.enableLinks || this.mode === 'gather_hud') {
      ctx.lineWidth = 0.75;
      for (let i = 0; i < trackers.length; i++) {
        for (let j = i + 1; j < trackers.length; j++) {
          const a = trackers[i];
          const b = trackers[j];
          const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy);
          const maxDist = Math.min(this.width, this.height) * 0.36;
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.18;
            ctx.strokeStyle = `rgba(232, 224, 210, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
          }
        }
      }
    }

    ctx.font = '500 8.5px "JetBrains Mono", monospace';
    for (let i = 0; i < trackers.length; i++) {
      const tr = trackers[i];
      const isSeeking = tr.seekProgress < 0.92;
      const half = (tr.boxSize * (isSeeking ? 1.2 : 1.0)) * 0.5;
      const corner = Math.max(3.5, half * 0.46);
      const x = tr.sx;
      const y = tr.sy;

      ctx.strokeStyle = isSeeking ? 'rgba(255, 176, 68, 0.45)' : 'rgba(235, 226, 210, 0.42)';
      ctx.lineWidth = 0.9;

      ctx.beginPath();
      ctx.moveTo(x - half, y - half + corner);
      ctx.lineTo(x - half, y - half);
      ctx.lineTo(x - half + corner, y - half);

      ctx.moveTo(x + half - corner, y - half);
      ctx.lineTo(x + half, y - half);
      ctx.lineTo(x + half, y - half + corner);

      ctx.moveTo(x + half, y + half - corner);
      ctx.lineTo(x + half, y + half);
      ctx.lineTo(x + half - corner, y + half);

      ctx.moveTo(x - half + corner, y + half);
      ctx.lineTo(x - half, y + half);
      ctx.lineTo(x - half, y + half - corner);
      ctx.stroke();

      const fmt = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
      const label = isSeeking ? `${tr.id} SEEK` : `${tr.id} ${fmt(tr.x)} ${fmt(tr.y)}`;
      ctx.fillStyle = isSeeking ? 'rgba(255, 176, 68, 0.48)' : 'rgba(232, 224, 210, 0.38)';
      ctx.fillText(label, x + half + 5, y + 3);
    }

    ctx.restore();
  },

  // ==========================================================================
  // 2. SẤM SÉT NGOÀI ĐỜI THỰC (REAL-LIFE FRACTAL STEPPED-LEADER LIGHTNING)
  // ==========================================================================
  subdivideLightningSegment(x1, y1, x2, y2, displace, depth, outSegments, thickness, isMainChannel) {
    if (depth <= 0 || displace < 1.8) {
      outSegments.push({ x1, y1, x2, y2, thickness, isMainChannel });
      return;
    }

    // Midpoint Displacement (Thuật toán vật lý mô phỏng tia sét đánh zíc-zắc ngoài đời)
    const midX = (x1 + x2) * 0.5 + (Math.random() - 0.5) * displace;
    const midY = (y1 + y2) * 0.5 + (Math.random() - 0.5) * (displace * 0.28);

    this.subdivideLightningSegment(x1, y1, midX, midY, displace * 0.54, depth - 1, outSegments, thickness, isMainChannel);
    this.subdivideLightningSegment(midX, midY, x2, y2, displace * 0.54, depth - 1, outSegments, thickness * 0.96, isMainChannel);

    // Sinh nhánh phụ (Stepped Leaders) tỏa ra từ thân chính như rễ cây trên bầu trời
    if (depth >= 2 && Math.random() < (isMainChannel ? 0.38 : 0.22)) {
      const angle = Math.atan2(y2 - y1, x2 - x1) + (Math.random() > 0.5 ? 1 : -1) * (0.32 + Math.random() * 0.48);
      const length = Math.hypot(x2 - x1, y2 - y1) * (0.55 + Math.random() * 0.35);
      const bx2 = midX + Math.cos(angle) * length;
      const by2 = midY + Math.sin(angle) * length;
      this.subdivideLightningSegment(midX, midY, bx2, by2, displace * 0.45, depth - 1, outSegments, thickness * 0.48, false);
    }
  },

  createRealisticLightningBolt(customX) {
    const startX = customX !== undefined
      ? customX
      : this.width * (0.12 + Math.random() * 0.76);
    const startY = -10;
    const isCloudToGround = Math.random() > 0.22;
    const endX = startX + (Math.random() - 0.5) * (this.width * 0.32);
    const endY = isCloudToGround
      ? this.height * (0.72 + Math.random() * 0.28)
      : this.height * (0.25 + Math.random() * 0.25);

    const segments = [];
    const baseThickness = isCloudToGround ? (2.8 + Math.random() * 1.6) : (1.8 + Math.random() * 1.0);
    const initialSpread = isCloudToGround ? 155 : 110;

    this.subdivideLightningSegment(startX, startY, endX, endY, initialSpread, 6, segments, baseThickness, true);

    // Tạo hiệu ứng chớp giật nhiều nhịp (Return Stroke Flicker Pattern ngoài đời)
    const reStrikes = Math.floor(Math.random() * 3) + 2; // 2..4 lần giật sáng trên cùng rãnh plasma
    this.lightning.bolts.push({
      segments,
      originX: startX,
      originY: 0,
      endX,
      endY,
      age: 0,
      maxAge: 0.55 + reStrikes * 0.08,
      reStrikes,
      hueType: Math.random() > 0.25 ? 'electric_ice' : 'violet_plasma'
    });

    // Ánh chớp chiếu sáng tầng mây phía trên (In-cloud Sheet Lightning)
    this.lightning.sheetFlashes.push({
      x: startX,
      y: this.height * (0.05 + Math.random() * 0.12),
      radius: Math.max(this.width, this.height) * (0.45 + Math.random() * 0.25),
      alpha: 0.42,
      decay: 1.4
    });

    this.lightning.skyGlow = 0.32;
    this.lightning.skyCenterX = startX / (this.width || 1);
    this.lightning.skyCenterY = 0.08;
  },

  renderLightning(now, dt) {
    const ctx = this.ctx;
    const dtSec = dt * 0.001;
    this.lightning.timer += dt;

    if (this.lightning.timer > this.lightning.interval) {
      this.lightning.timer = 0;
      // Thỉnh thoảng đánh kép 2 tia liên tiếp như giông thật
      this.createRealisticLightningBolt();
      if (Math.random() < 0.35) {
        setTimeout(() => {
          if (this.mode === 'lightning' || this.mode === 'storm') {
            this.createRealisticLightningBolt();
          }
        }, 120 + Math.random() * 180);
      }
      this.lightning.interval = 1600 + Math.random() * 2800;
    }

    // 1. Vẽ tầng mây giông phát sáng trên bầu trời (Cloud Anvil Illumination)
    if (this.lightning.skyGlow > 0.002) {
      const gx = this.width * this.lightning.skyCenterX;
      const gy = this.height * this.lightning.skyCenterY;
      const skyGrad = ctx.createRadialGradient(gx, gy, 10, gx, gy, Math.max(this.width, this.height) * 0.9);
      skyGrad.addColorStop(0, `rgba(210, 232, 255, ${this.lightning.skyGlow * 0.55})`);
      skyGrad.addColorStop(0.35, `rgba(148, 185, 255, ${this.lightning.skyGlow * 0.25})`);
      skyGrad.addColorStop(0.75, `rgba(65, 88, 145, ${this.lightning.skyGlow * 0.08})`);
      skyGrad.addColorStop(1, 'rgba(7, 11, 20, 0)');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, this.width, this.height);
      this.lightning.skyGlow = Math.max(0, this.lightning.skyGlow - dtSec * 0.95);
    }

    // 2. Vẽ các quầng chớp âm ỉ trong mây (Sheet Lightning)
    for (let i = this.lightning.sheetFlashes.length - 1; i >= 0; i--) {
      const fl = this.lightning.sheetFlashes[i];
      fl.alpha -= dtSec * fl.decay;
      if (fl.alpha <= 0) {
        this.lightning.sheetFlashes.splice(i, 1);
        continue;
      }
      const g = ctx.createRadialGradient(fl.x, fl.y, 5, fl.x, fl.y, fl.radius);
      g.addColorStop(0, `rgba(235, 245, 255, ${fl.alpha * 0.55})`);
      g.addColorStop(0.4, `rgba(165, 205, 255, ${fl.alpha * 0.22})`);
      g.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, fl.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Vẽ từng tia sét phân nhánh với 3 lớp vật lý: Quầng khí quyển -> Vỏ hồ quang -> Lõi trắng 30,000K
    for (let i = this.lightning.bolts.length - 1; i >= 0; i--) {
      const bolt = this.lightning.bolts[i];
      bolt.age += dtSec;
      if (bolt.age >= bolt.maxAge) {
        this.lightning.bolts.splice(i, 1);
        continue;
      }

      const normAge = bolt.age / bolt.maxAge;
      // Hàm nhấp nháy Return-Stroke (chớp lòe 2-3 nhịp rồi tắt dần như sét thật)
      const pulse = Math.pow(Math.max(0, 1 - normAge), 1.35) *
        (0.62 + 0.38 * Math.cos(bolt.age * 55 * (bolt.reStrikes * 0.5)));

      if (pulse <= 0.02) continue;

      const isIce = bolt.hueType === 'electric_ice';
      const outerColor = isIce ? `rgba(96, 165, 250, ${pulse * 0.22})` : `rgba(167, 139, 250, ${pulse * 0.22})`;
      const midColor = isIce ? `rgba(186, 230, 253, ${pulse * 0.62})` : `rgba(221, 214, 254, ${pulse * 0.62})`;
      const coreColor = `rgba(255, 255, 255, ${Math.min(1, pulse * 1.15)})`;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Lớp 1: Quầng ion hóa khí quyển (Outer Atmospheric Plasma Bloom)
      ctx.strokeStyle = outerColor;
      for (let s = 0; s < bolt.segments.length; s++) {
        const seg = bolt.segments[s];
        if (!seg.isMainChannel && seg.thickness < 0.9) continue;
        ctx.lineWidth = seg.thickness * 4.8 * pulse;
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }

      // Lớp 2: Vỏ hồ quang điện (Mid Corona Channel)
      ctx.strokeStyle = midColor;
      for (let s = 0; s < bolt.segments.length; s++) {
        const seg = bolt.segments[s];
        ctx.lineWidth = seg.thickness * 2.1 * pulse;
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }

      // Lớp 3: Lõi nhiệt độ cao trắng rực (Superheated Core)
      ctx.strokeStyle = coreColor;
      for (let s = 0; s < bolt.segments.length; s++) {
        const seg = bolt.segments[s];
        ctx.lineWidth = Math.max(0.55, seg.thickness * 0.85 * pulse);
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }

      ctx.restore();
    }
  },

  // ==========================================================================
  // 3. MƯA RÀO NGOÀI ĐỜI THỰC (3-LAYER DEPTH PARALLAX RAIN + SPLASH DROPLETS)
  // ==========================================================================
  initRealisticRain(isHeavyStorm = false) {
    const r = this.rain;
    r.drops = [];
    r.splashes = [];
    r.ripples = [];
    r.mistClouds = [];

    const isMobile = this.width < 768;
    const baseCount = isMobile ? (isHeavyStorm ? 140 : 105) : (isHeavyStorm ? 280 : 210);

    // 3 Lớp chiều sâu (0: Xa mờ, 1: Trung cảnh, 2: Cận cảnh sắc nét)
    for (let i = 0; i < baseCount; i++) {
      const layerRand = Math.random();
      const layer = layerRand < 0.45 ? 0 : (layerRand < 0.82 ? 1 : 2);
      r.drops.push(this.createRainDrop(layer, true, isHeavyStorm));
    }

    // Sương mù ẩm ướt trôi là là mặt đất khi mưa to
    for (let i = 0; i < 5; i++) {
      r.mistClouds.push({
        x: Math.random() * this.width,
        y: this.height * (0.75 + Math.random() * 0.22),
        radius: this.width * (0.28 + Math.random() * 0.2),
        vx: (Math.random() * 0.35 + 0.15) * (Math.random() > 0.5 ? 1 : -1),
        alpha: 0.035 + Math.random() * 0.025
      });
    }
  },

  createRainDrop(layer = 1, randomY = false, isHeavyStorm = false) {
    const speedBase = layer === 0 ? 15 : (layer === 1 ? 22 : 30);
    const speedY = (speedBase + Math.random() * 6) * (isHeavyStorm ? 1.15 : 1.0);
    const length = layer === 0 ? (18 + Math.random() * 10) : (layer === 1 ? (32 + Math.random() * 14) : (48 + Math.random() * 20));
    const thickness = layer === 0 ? 0.75 : (layer === 1 ? 1.15 : 1.65);
    const alpha = layer === 0 ? (0.14 + Math.random() * 0.08) : (layer === 1 ? (0.26 + Math.random() * 0.12) : (0.42 + Math.random() * 0.16));

    return {
      layer,
      x: Math.random() * (this.width + 300) - 100,
      y: randomY ? Math.random() * this.height : -length - Math.random() * 120,
      length,
      speedY,
      thickness,
      alpha
    };
  },

  renderRain(dt, isStorm = false) {
    const ctx = this.ctx;
    const r = this.rain;
    const dtScale = dt / 16.67;

    if (r.drops.length === 0) {
      this.initRealisticRain(isStorm);
    }

    // Cập nhật luồng gió tự nhiên (Wind Gusts)
    r.windTimer += dt;
    if (r.windTimer > 3500) {
      r.windTimer = 0;
      const baseWind = isStorm ? -0.22 : -0.12;
      r.targetWindAngle = baseWind + (Math.random() - 0.5) * 0.10;
    }
    r.windAngle += (r.targetWindAngle - r.windAngle) * 0.02;

    const sinW = Math.sin(r.windAngle);
    const cosW = Math.cos(r.windAngle);

    // 1. Vẽ lớp sương ẩm mặt đất (Atmospheric Rain Mist)
    ctx.save();
    for (let i = 0; i < r.mistClouds.length; i++) {
      const m = r.mistClouds[i];
      m.x += m.vx * dtScale;
      if (m.x - m.radius > this.width) m.x = -m.radius;
      if (m.x + m.radius < 0) m.x = this.width + m.radius;

      const grad = ctx.createRadialGradient(m.x, m.y, 10, m.x, m.y, m.radius);
      grad.addColorStop(0, `rgba(186, 215, 245, ${m.alpha})`);
      grad.addColorStop(1, 'rgba(7, 11, 20, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, this.height * 0.45, this.width, this.height * 0.55);
    }

    // 2. Vẽ các hạt mưa 3 lớp với hiệu ứng đầu giọt nước sáng và đuôi mờ dần (Motion-Blurred Rain Streaks)
    ctx.lineCap = 'round';
    for (let i = 0; i < r.drops.length; i++) {
      const p = r.drops[i];
      const vx = p.speedY * sinW;
      const vy = p.speedY * cosW;

      p.x += vx * dtScale;
      p.y += vy * dtScale;

      const tailX = p.x - sinW * p.length;
      const tailY = p.y - cosW * p.length;

      // Vẽ tia mưa có độ chuyển sắc (đầu giọt mưa bắt sáng, đuôi tan vào không khí)
      const grad = ctx.createLinearGradient(tailX, tailY, p.x, p.y);
      grad.addColorStop(0, 'rgba(186, 220, 255, 0)');
      grad.addColorStop(0.65, `rgba(195, 225, 255, ${p.alpha * 0.65})`);
      grad.addColorStop(1, `rgba(240, 249, 255, ${p.alpha})`);

      ctx.strokeStyle = grad;
      ctx.lineWidth = p.thickness;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      // Khi chạm mặt đất: sinh vòng sóng nước + hạt nước bắn tung tóe (Ground Splash Physics)
      const groundY = this.height - (p.layer === 2 ? (4 + Math.random() * 14) : (14 + Math.random() * 28));
      if (p.y >= groundY) {
        if (p.layer >= 1 && Math.random() < 0.55) {
          // Vòng gợn nước elip (Ripple)
          if (r.ripples.length < 70) {
            r.ripples.push({
              x: p.x,
              y: groundY,
              rx: 1.5,
              maxRx: (p.layer === 2 ? 18 : 11) + Math.random() * 10,
              alpha: p.layer === 2 ? 0.42 : 0.26
            });
          }

          // Hạt nước nhỏ bắn văng lên khi giọt mưa to đập xuống mặt đất (Crown Splash Droplets)
          if (p.layer === 2 && r.splashes.length < 90) {
            const dropCount = 2 + Math.floor(Math.random() * 2);
            for (let k = 0; k < dropCount; k++) {
              r.splashes.push({
                x: p.x,
                y: groundY,
                vx: (Math.random() - 0.5) * 3.2,
                vy: -(Math.random() * 2.6 + 1.4),
                alpha: 0.55,
                radius: Math.random() * 1.1 + 0.6
              });
            }
          }
        }

        p.y = -p.length - Math.random() * 60;
        p.x = Math.random() * (this.width + 320) - 80;
      }
    }

    // 3. Cập nhật và vẽ các hạt nước bắn tung tóe (Splash Micro-Droplets)
    for (let i = r.splashes.length - 1; i >= 0; i--) {
      const sp = r.splashes[i];
      sp.x += sp.vx * dtScale;
      sp.y += sp.vy * dtScale;
      sp.vy += 0.22 * dtScale; // Trọng lực kéo giọt nước bắn rơi xuống
      sp.alpha -= 0.032 * dtScale;

      if (sp.alpha <= 0) {
        r.splashes.splice(i, 1);
        continue;
      }

      ctx.fillStyle = `rgba(224, 242, 254, ${sp.alpha})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Cập nhật và vẽ vòng sóng nước loang trên mặt đất (Water Ripples)
    for (let i = r.ripples.length - 1; i >= 0; i--) {
      const rip = r.ripples[i];
      rip.rx += 0.65 * dtScale;
      rip.alpha -= 0.016 * dtScale;

      if (rip.alpha <= 0 || rip.rx >= rip.maxRx) {
        r.ripples.splice(i, 1);
        continue;
      }

      ctx.strokeStyle = `rgba(186, 224, 255, ${rip.alpha})`;
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.ellipse(rip.x, rip.y, rip.rx, rip.rx * 0.24, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  },

  // ==========================================================================
  // 4. CÁC HIỆU ỨNG TRUYỀN THỐNG (PHÁO HOA, HOA ĐÀO, TUYẾT RƠI)
  // ==========================================================================
  spawnInitialParticles() {
    const count = this.getOptimalCount();

    if (this.mode === 'sakura') {
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          size: Math.random() * 8 + 6,
          speedY: Math.random() * 1.4 + 0.7,
          speedX: Math.random() * 1.4 - 0.5,
          angle: Math.random() * Math.PI * 2,
          angularSpeed: (Math.random() - 0.5) * 0.03,
          flip: Math.random() * Math.PI,
          flipSpeed: Math.random() * 0.04 + 0.01,
          color: Math.random() > 0.3 ? '#ffb7c5' : '#ff94aa',
          opacity: Math.random() * 0.45 + 0.3
        });
      }
    } else if (this.mode === 'snow') {
      for (let i = 0; i < count * 1.5; i++) {
        this.particles.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          radius: Math.random() * 2.8 + 0.9,
          speedY: Math.random() * 1.1 + 0.45,
          speedX: Math.random() * 0.6 - 0.3,
          sway: Math.random() * 0.02,
          swayOffset: Math.random() * Math.PI * 2,
          opacity: Math.random() * 0.55 + 0.25
        });
      }
    }
  },

  getOptimalCount() {
    return this.width < 768 ? 30 : 60;
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
      case 'storm':
        this.renderLightning(now, dt);
        this.renderRain(dt, true);
        break;
      case 'lightning':
        this.renderLightning(now, dt);
        break;
      case 'rain':
        this.renderRain(dt, false);
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
    }

    this.animId = requestAnimationFrame(this.loop);
  },

  renderFireworks(now, dt) {
    const ctx = this.ctx;
    this.fireworks.timer += dt;

    if (this.fireworks.timer > 750) {
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
      ctx.arc(r.x, r.y, 2.2, 0, Math.PI * 2);
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
      s.vy += 0.065;
      s.vx *= 0.982;
      s.alpha -= 0.014;

      if (s.alpha <= 0) {
        this.fireworks.sparks.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, s.alpha * 0.85);
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
      ctx.shadowBlur = p.radius > 2 ? 6 : 0;
      ctx.shadowColor = '#e0f2fe';

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  AmbientEngine.init();
});

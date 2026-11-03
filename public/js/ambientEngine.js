// ============================================================================
// ENI 5D ATMOSPHERIC PARTICLE & WEATHER ENGINE v16.2 APEX
// Sấm Sét 5D, Pháo Hoa, Hoa Đào Rơi, Tuyết Rơi, Mưa Rơi Cyberpunk
// Phục vụ riêng cho Đại Ca Tú - Mượt mà 60 FPS Canvas không tốn CPU
// ============================================================================

const AmbientEngine = {
  canvas: null,
  ctx: null,
  mode: 'lightning', // 'lightning' | 'fireworks' | 'sakura' | 'snow' | 'rain' | 'off'
  animId: null,
  width: 0,
  height: 0,
  particles: [],
  lastTime: 0,

  // Lightning state
  lightning: {
    bolts: [],
    timer: 0,
    interval: 1800, // ms between strikes
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

    // Đóng dropdown khi click ra ngoài
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('ambient-menu');
      const toggle = document.getElementById('btn-ambient-toggle');
      if (menu && !menu.contains(e.target) && toggle && !toggle.contains(e.target)) {
        menu.classList.add('hidden');
      }
    });

    // Nạp cấu hình đã lưu của Đại Ca từ localStorage
    const saved = localStorage.getItem('accproxy_ambient_mode');
    const initialMode = saved !== null ? saved : 'lightning';
    this.setMode(initialMode, false);
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

    // Đóng menu
    const menu = document.getElementById('ambient-menu');
    if (menu) menu.classList.add('hidden');

    // Cập nhật nhãn và icon trên Header
    this.updateHeaderUI();

    // Reset bộ hạt
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

    // Khởi tạo hạt ban đầu tùy theo mode
    this.spawnInitialParticles();

    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    this.animId = requestAnimationFrame(this.loop);
  },

  updateHeaderUI() {
    const iconEl = document.getElementById('ambient-current-icon');
    const labelEl = document.getElementById('ambient-current-label');
    const meta = {
      lightning: { icon: '⚡', label: '5D: Sấm Sét' },
      fireworks: { icon: '🎆', label: '5D: Pháo Hoa' },
      sakura:    { icon: '🌸', label: '5D: Hoa Đào' },
      snow:      { icon: '❄️', label: '5D: Tuyết Rơi' },
      rain:      { icon: '🌧️', label: '5D: Mưa Rơi' },
      off:       { icon: '🚫', label: '5D: Đã Tắt' }
    }[this.mode] || { icon: '✨', label: '5D: Khí Quyển' };

    if (iconEl) iconEl.innerText = meta.icon;
    if (labelEl) labelEl.innerText = meta.label;

    // Highlight button đang chọn trong menu
    document.querySelectorAll('.ambient-opt-btn').forEach(btn => {
      if (btn.dataset.mode === this.mode) {
        btn.classList.add('bg-purple-900/50', 'text-white', 'border', 'border-purple-500/40');
      } else {
        btn.classList.remove('bg-purple-900/50', 'text-white', 'border', 'border-purple-500/40');
      }
    });
  },

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

    // Kích hoạt tia sét mới ngẫu nhiên
    if (this.lightning.timer > this.lightning.interval) {
      this.lightning.timer = 0;
      this.lightning.interval = Math.random() * 2500 + 1500;
      this.createLightningBolt();
    }

    // Hiệu ứng flash chớp sáng toàn màn hình
    if (this.lightning.screenFlash > 0) {
      ctx.fillStyle = `rgba(186, 230, 253, ${this.lightning.screenFlash * 0.18})`;
      ctx.fillRect(0, 0, this.width, this.height);
      this.lightning.screenFlash = Math.max(0, this.lightning.screenFlash - dt * 0.0035);
    }

    // Vẽ các tia sét
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

      // Vẽ các nhánh phụ (branches)
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

    // Tạo 2-4 nhánh cây phụ
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

    // Rung camera nhẹ (5D visual feedback)
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

    // Cập nhật & vẽ tên lửa phóng lên
    for (let i = this.fireworks.rockets.length - 1; i >= 0; i--) {
      const r = this.fireworks.rockets[i];
      r.y += r.vy;
      r.x += r.vx;
      r.vy += 0.08; // trọng lực làm chậm lại

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

    // Cập nhật & vẽ các tia nổ (sparks)
    for (let i = this.fireworks.sparks.length - 1; i >= 0; i--) {
      const s = this.fireworks.sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.07; // gravity
      s.vx *= 0.98; // air resistance
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

      // Hết mép màn hình -> hồi sinh trên đỉnh
      if (p.y > this.height + 20) {
        p.y = -20;
        p.x = Math.random() * this.width;
      }
      if (p.x > this.width + 20) p.x = -20;
      else if (p.x < -20) p.x = this.width + 20;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.scale(Math.cos(p.flip), 1); // 3D tumble flip

      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.opacity;

      // Vẽ hình dạng cánh hoa đào
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
        // Nảy gợn sóng khi chạm đáy
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

    // Vẽ & cập nhật các vòng sóng gợn vỡ (ripples)
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

// Khởi chạy khi DOM đã sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  AmbientEngine.init();
});

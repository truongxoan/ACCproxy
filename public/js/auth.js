// Quản trị Xác thực & Khóa Phiên Tự Động (Auto-Lock Engine)
const Auth = {
  currentUser: null,
  idleTimer: null,
  lockTimeoutMs: 5 * 60 * 1000, // 5 phút không thao tác sẽ khóa màn hình
  isLocked: false,

  googleEnabled: null,

  async init() {
    // Khách chưa đăng nhập vẫn xem được Cửa Hàng: không bật modal chặn nữa.
    try {
      const cfg = await API.get('/auth/config');
      this.googleEnabled = !!(cfg && cfg.google_enabled);
    } catch (e) {}
    try {
      const res = await API.get('/auth/me');
      if (res.success && res.user) {
        this.currentUser = res.user;
        this.renderUserBadge();
        this.setupInactivityTracker();
        return true;
      }
    } catch (err) {
      this.currentUser = null;
    }
    this.renderUserBadge();
    return false;
  },

  showAuthMode(mode) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const title = document.getElementById('auth-modal-title');
    const googleBtn = document.getElementById('btn-google-login');
    if (googleBtn && this.googleEnabled === false) googleBtn.classList.add('hidden');
    if (mode === 'register') {
      loginForm?.classList.add('hidden');
      registerForm?.classList.remove('hidden');
      registerForm?.classList.add('flex');
      if (title) title.innerText = 'Tạo tài khoản mới';
    } else {
      registerForm?.classList.add('hidden');
      registerForm?.classList.remove('flex');
      loginForm?.classList.remove('hidden');
      if (title) title.innerText = 'Đăng nhập';
    }
  },

  async register(username, email, password) {
    try {
      const res = await API.post('/auth/register', { username, email, password });
      if (res.success) {
        this.currentUser = res.user;
        this.hideLoginModal();
        this.renderUserBadge();
        this.setupInactivityTracker();
        Toast.success('Tạo tài khoản thành công! Chào mừng bạn đến Cửa Hàng.');
        window.dispatchEvent(new CustomEvent('auth:success'));
        return true;
      }
    } catch (err) {
      Toast.error(err.message || 'Tạo tài khoản thất bại');
      return false;
    }
  },

  loginWithGoogle() {
    if (this.googleEnabled === false) {
      Toast.error('Đăng nhập Google chưa được cấu hình trên server này. Admin cần thêm GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.');
      return;
    }
    window.location.href = '/api/auth/google';
  },

  async login(username, password) {
    try {
      const res = await API.post('/auth/login', { username, password });
      if (res.success) {
        this.currentUser = res.user;
        this.hideLoginModal();
        this.renderUserBadge();
        this.setupInactivityTracker();
        Toast.success(`Chào mừng [${res.user.username}]!`);
        window.dispatchEvent(new CustomEvent('auth:success'));
        return true;
      }
    } catch (err) {
      Toast.error(err.message || 'Đăng nhập thất bại');
      return false;
    }
  },

  async logout() {
    try {
      await API.post('/auth/logout');
    } catch (e) {}
    this.currentUser = null;
    this.clearInactivityTracker();
    Toast.info('Đã đăng xuất an toàn');
    this.renderUserBadge();
    if (window.App && typeof window.App.activateTabById === 'function') {
      window.App.activateTabById('tab-shop');
    }
  },

  showLoginModal(mode = 'login') {
    this.showAuthMode(mode);
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.remove('hidden');
  },

  hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.add('hidden');
  },

  isTabAllowed(tabId) {
    if (tabId === 'tab-shop') return true; // Cửa Hàng công khai
    if (!this.currentUser) return false;
    if (this.currentUser.role === 'admin') return true;
    if (tabId === 'tab-admin') return false;
    const allowed = Array.isArray(this.currentUser.allowed_tabs) && this.currentUser.allowed_tabs.length > 0
      ? this.currentUser.allowed_tabs
      : ['tab-accounts'];
    return allowed.includes(tabId);
  },

  renderUserBadge() {
    const container = document.getElementById('user-profile-badge');
    if (!container) return;
    if (!this.currentUser) {
      container.innerHTML = `
        <button onclick="Auth.showLoginModal('login')" class="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold">Đăng nhập</button>
        <button onclick="Auth.showLoginModal('register')" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">Đăng ký</button>
      `;
      this.applyRoleAndTabPermissions();
      return;
    }

    const isAdmin = this.currentUser.role === 'admin';
    container.innerHTML = `
      <div class="flex items-center gap-2">
        <div class="text-right">
          <div class="text-xs font-bold text-slate-200 leading-tight">${this.currentUser.username}</div>
          <span class="inline-block text-[9px] px-1.5 py-0.2 rounded font-mono uppercase ${isAdmin ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'}">
            ${isAdmin ? '👑 Admin' : '👤 User'}
          </span>
        </div>
        <button id="btn-logout" title="Đăng xuất an toàn" class="p-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-950/70 text-slate-300 hover:text-rose-300 transition-colors">
          🚪
        </button>
      </div>
    `;

    document.getElementById('btn-logout')?.addEventListener('click', () => this.logout());

    this.applyRoleAndTabPermissions();
  },

  applyRoleAndTabPermissions() {
    const isAdmin = !!this.currentUser && this.currentUser.role === 'admin';
    if (!this.currentUser) {
      document.querySelectorAll('.admin-only').forEach((el) => el.classList.add('hidden'));
      document.querySelectorAll('.nav-tab-btn[data-tab]').forEach((btn) => {
        if (btn.dataset.tab === 'tab-shop') { btn.classList.remove('hidden'); btn.classList.add('flex'); }
        else { btn.classList.add('hidden'); btn.classList.remove('flex'); }
      });
      document.querySelectorAll('[data-require-tab]').forEach((el) => {
        if (el.getAttribute('data-require-tab') === 'tab-shop') el.classList.remove('hidden');
        else el.classList.add('hidden');
      });
      return;
    }

    // 1. Ẩn/hiện các phần tử chỉ dành cho Admin
    document.querySelectorAll('.admin-only').forEach((el) => {
      if (isAdmin) el.classList.remove('hidden');
      else el.classList.add('hidden');
    });

    // 2. Ẩn/hiện các Tab chính trên thanh điều hướng theo allowed_tabs
    const secondaryTabs = ['tab-assets', 'tab-phone', 'tab-piik', 'tab-knowledge'];
    const navExpanded = window.App && window.App.navExpandedMode;

    document.querySelectorAll('.nav-tab-btn[data-tab]').forEach((btn) => {
      const tabId = btn.dataset.tab;
      const allowed = this.isTabAllowed(tabId);
      const isSecondaryInline = btn.classList.contains('nav-secondary-inline');

      if (!allowed) {
        btn.classList.add('hidden');
        btn.classList.remove('flex');
      } else if (isSecondaryInline && !navExpanded) {
        btn.classList.add('hidden');
        btn.classList.remove('flex');
      } else {
        btn.classList.remove('hidden');
        btn.classList.add('flex');
      }
    });

    // 3. Ẩn/hiện các mục trong menu gộp "Tiện Ích Mở Rộng"
    let allowedSecondaryCount = 0;
    document.querySelectorAll('.nav-more-item[data-more-tab]').forEach((item) => {
      const tabId = item.dataset.moreTab;
      if (this.isTabAllowed(tabId)) {
        item.classList.remove('hidden');
        allowedSecondaryCount++;
      } else {
        item.classList.add('hidden');
      }
    });

    const moreWrapper = document.getElementById('nav-more-wrapper');
    const moreCountEl = document.getElementById('nav-more-count');
    const toggleExpandBtn = document.getElementById('btn-toggle-nav-expand');
    if (moreCountEl) moreCountEl.innerText = allowedSecondaryCount;

    if (moreWrapper) {
      if (allowedSecondaryCount === 0 || navExpanded) {
        moreWrapper.classList.add('hidden');
      } else {
        moreWrapper.classList.remove('hidden');
      }
    }
    if (toggleExpandBtn) {
      if (allowedSecondaryCount === 0) toggleExpandBtn.classList.add('hidden');
      else toggleExpandBtn.classList.remove('hidden');
    }

    // 4. Ẩn/hiện các ô Bento KPI hoặc khu vực yêu cầu quyền Tab cụ thể
    document.querySelectorAll('[data-require-tab]').forEach((el) => {
      const reqTab = el.getAttribute('data-require-tab');
      if (this.isTabAllowed(reqTab)) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });

    // 5. Ẩn nút Backup & Thermal HUD nếu User không có quyền Trạm Vũ Khí
    const backupBtn = document.getElementById('btn-backup-telegram');
    const hwHud = document.getElementById('header-hardware-hud');
    if (backupBtn) {
      if (isAdmin) backupBtn.classList.remove('hidden');
      else backupBtn.classList.add('hidden');
    }
    if (hwHud) {
      if (isAdmin || this.isTabAllowed('tab-tools')) hwHud.classList.remove('hidden');
      else hwHud.classList.add('hidden');
    }

    // 6. Nếu Tab đang mở không nằm trong danh sách được phép, tự chuyển về Tab đầu tiên được phép
    const activePane = document.querySelector('.tab-pane:not(.hidden)');
    if (activePane && !this.isTabAllowed(activePane.id)) {
      const allowedList = isAdmin
        ? ['tab-accounts']
        : (this.currentUser?.allowed_tabs || ['tab-shop']);
      const firstTab = allowedList[0] || 'tab-accounts';
      if (window.App && typeof window.App.activateTabById === 'function') {
        window.App.activateTabById(firstTab);
      }
    }
  },

  // Cơ chế khóa tự động: ĐÃ GỠ BỎ THEO LỆNH ĐẠI CA TÚ
  setupInactivityTracker() {
    this.clearInactivityTracker();
    this.isLocked = false;
    const lockOverlay = document.getElementById('lock-screen-modal');
    if (lockOverlay) lockOverlay.classList.add('hidden');
  },

  clearInactivityTracker() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
  },

  lockSession() {
    // Đã vô hiệu hóa hoàn toàn theo lệnh của Đại Ca Tú
    this.isLocked = false;
    const lockOverlay = document.getElementById('lock-screen-modal');
    if (lockOverlay) lockOverlay.classList.add('hidden');
  },

  async unlockSession(password) {
    if (!this.currentUser) return;
    try {
      const res = await API.post('/auth/login', {
        username: this.currentUser.username,
        password
      });

      if (res.success) {
        this.isLocked = false;
        const lockOverlay = document.getElementById('lock-screen-modal');
        if (lockOverlay) lockOverlay.classList.add('hidden');
        Toast.success('Mở khóa màn hình tác chiến thành công!');
        this.setupInactivityTracker();
        return true;
      }
    } catch (err) {
      Toast.error('Mật khẩu mở khóa không chính xác!');
      return false;
    }
  }
};

window.addEventListener('auth:required', () => {
  Auth.showLoginModal();
});

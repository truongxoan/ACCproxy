// Quản trị Xác thực & Khóa Phiên Tự Động (Auto-Lock Engine)
const Auth = {
  currentUser: null,
  idleTimer: null,
  lockTimeoutMs: 5 * 60 * 1000, // 5 phút không thao tác sẽ khóa màn hình
  isLocked: false,

  async init() {
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
      this.showLoginModal();
    }
    return false;
  },

  async login(username, password) {
    try {
      const res = await API.post('/auth/login', { username, password });
      if (res.success) {
        this.currentUser = res.user;
        this.hideLoginModal();
        this.renderUserBadge();
        this.setupInactivityTracker();
        Toast.success(`Chào mừng Đại Ca [${res.user.username}] gia nhập tác chiến!`);
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
    this.showLoginModal();
  },

  showLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.remove('hidden');
    const mainApp = document.getElementById('main-app');
    if (mainApp) mainApp.classList.add('filter', 'blur-sm');
  },

  hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.add('hidden');
    const mainApp = document.getElementById('main-app');
    if (mainApp) mainApp.classList.remove('filter', 'blur-sm');
  },

  renderUserBadge() {
    const container = document.getElementById('user-profile-badge');
    if (!container || !this.currentUser) return;

    const isAdmin = this.currentUser.role === 'admin';
    container.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="text-right">
          <div class="text-xs font-semibold text-slate-200">${this.currentUser.username}</div>
          <span class="inline-block text-[10px] px-1.5 py-0.5 rounded font-mono uppercase ${isAdmin ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'}">
            ${isAdmin ? '👑 Super Admin' : '👤 Operator'}
          </span>
        </div>
        <button id="btn-lock-screen" title="Khóa màn hình ngay (Security Lock)" class="p-2 text-slate-400 hover:text-cyan-400 transition-colors">
          🔒
        </button>
        <button id="btn-logout" title="Đăng xuất an toàn" class="p-2 text-slate-400 hover:text-rose-400 transition-colors">
          🚪
        </button>
      </div>
    `;

    document.getElementById('btn-lock-screen')?.addEventListener('click', () => this.lockSession());
    document.getElementById('btn-logout')?.addEventListener('click', () => this.logout());

    // Hiển thị các nút dành riêng cho Admin nếu là Admin
    const adminTabs = document.querySelectorAll('.admin-only');
    adminTabs.forEach(el => {
      if (isAdmin) el.classList.remove('hidden');
      else el.classList.add('hidden');
    });
  },

  // Cơ chế phát hiện treo máy & khóa tự động (Auto-Lock)
  setupInactivityTracker() {
    this.clearInactivityTracker();
    const resetTimer = () => {
      if (this.isLocked) return;
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => this.lockSession(), this.lockTimeoutMs);
    };

    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
      window.addEventListener(evt, resetTimer, { passive: true });
    });

    resetTimer();
  },

  clearInactivityTracker() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
  },

  lockSession() {
    if (this.isLocked || !this.currentUser) return;
    this.isLocked = true;
    const lockOverlay = document.getElementById('lock-screen-modal');
    if (lockOverlay) {
      lockOverlay.classList.remove('hidden');
      document.getElementById('lock-username').innerText = this.currentUser.username;
      const passInput = document.getElementById('lock-password');
      if (passInput) {
        passInput.value = '';
        passInput.focus();
      }
    }
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

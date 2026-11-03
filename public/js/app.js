// Trình Điều Khiển Ứng Dụng Chính (Main Application Controller)
const App = {
  accounts: [],
  filteredAccounts: [],
  currentPlatform: 'all',
  searchQuery: '',
  totpTimer: null,
  activeAlertFilter: null,
  assets: [],
  filteredAssets: [],
  activeAssetFilter: 'all',
  assetSearchQuery: '',
  assetAccountFilter: '',
  currentViewingAsset: null,
  selectedUploadFile: null,
  knowledgeSubTab: 'repos',
  knowledgeCategory: 'all',
  knowledgeSearch: '',
  knowledgePage: 1,
  knowledgeTotalPages: 1,

  async init() {
    this.bindEvents();
    const isAuthed = await Auth.init();
    if (isAuthed) {
      await this.loadAccounts();
      await this.loadSuggestions();
      await this.loadSchedules();
      await this.loadAssets();
      this.startTotpClock();
    }
  },

  bindEvents() {
    // Chuyển đổi Tab điều hướng chính
    document.querySelectorAll('.nav-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        document.querySelectorAll('.nav-tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab-pane').forEach((pane) => pane.classList.add('hidden'));
        document.getElementById(targetTab)?.classList.remove('hidden');

        if (targetTab === 'tab-piik') {
          this.refreshPiikStreams();
        } else if (targetTab === 'tab-assets') {
          this.loadAssets();
        } else if (targetTab === 'tab-tools') {
          this.loadTelegramConfig();
          this.loadHooks();
          this.loadProviders();
        } else if (targetTab === 'tab-knowledge') {
          this.loadKnowledgeSummary();
          this.loadKnowledgeItems();
        } else if (targetTab === 'tab-admin') {
          this.loadUsersList();
          this.loadAuditLogs();
        }
      });
    });

    // Sự kiện sau khi đăng nhập thành công
    window.addEventListener('auth:success', async () => {
      await this.loadAccounts();
      await this.loadSuggestions();
      await this.loadSchedules();
      await this.loadAssets();
      this.startTotpClock();
    });

    // Form tải lên asset
    document.getElementById('upload-asset-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.submitUploadAsset();
    });

    // Drag & Drop cho Kho Tư Liệu
    const assetDropzone = document.getElementById('asset-dropzone');
    if (assetDropzone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        assetDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          assetDropzone.classList.add('border-cyan-400', 'bg-cyan-500/10');
        }, false);
      });
      ['dragleave', 'drop'].forEach(eventName => {
        assetDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          assetDropzone.classList.remove('border-cyan-400', 'bg-cyan-500/10');
        }, false);
      });
      assetDropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
          this.processFileForUpload(files[0]);
        }
      });
    }

    // Form đăng nhập
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('login-username').value;
      const p = document.getElementById('login-password').value;
      await Auth.login(u, p);
    });

    // Form mở khóa màn hình
    document.getElementById('lock-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const p = document.getElementById('lock-password').value;
      await Auth.unlockSession(p);
    });

    // Tìm kiếm nhanh
    document.getElementById('search-input')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.applyFilters();
    });

    // Bộ lọc Platform
    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active-filter', 'bg-cyan-600', 'text-white'));
        btn.classList.add('active-filter', 'bg-cyan-600', 'text-white');
        this.currentPlatform = btn.dataset.platform;
        this.activeAlertFilter = null;
        this.applyFilters();
      });
    });

    // Nút mở Modal Thêm Tài Khoản
    document.getElementById('btn-add-account')?.addEventListener('click', () => {
      this.openAccountModal();
    });

    // Nút mở Modal Import
    document.getElementById('btn-import-accounts')?.addEventListener('click', () => {
      this.openImportModal();
    });

    // Nút mở Modal Quản Lý User (Admin)
    document.getElementById('btn-manage-users')?.addEventListener('click', () => {
      this.openUsersModal();
    });

    // Nút mở Modal Audit Logs (Admin)
    document.getElementById('btn-audit-logs')?.addEventListener('click', () => {
      this.openAuditModal();
    });

    // Nút mở Modal Lịch Up Video
    document.getElementById('btn-schedules')?.addEventListener('click', () => {
      this.openSchedulesModal();
    });

    // Nút làm mới dữ liệu
    document.getElementById('btn-refresh')?.addEventListener('click', async () => {
      Toast.info('Đang đồng bộ dữ liệu mới nhất...');
      await this.loadAccounts();
      await this.loadSuggestions();
      await this.loadSchedules();
      Toast.success('Dữ liệu đã được cập nhật mượt mà!');
    });

    // Tự động bóc tách Proxy khi dán vào ô raw_proxy
    document.getElementById('acc-raw-proxy')?.addEventListener('input', (e) => {
      this.autoParseProxyInput(e.target.value);
    });

    // Lưu form Tài khoản
    document.getElementById('account-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveAccount();
    });

    // Lưu form Import
    document.getElementById('import-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.submitImport();
    });

    // Lưu form Lên Lịch Up Video
    document.getElementById('schedule-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveSchedule();
    });

    // Lưu form Telegram Bot
    document.getElementById('telegram-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveTelegramConfig();
    });

    // Form sao lưu database về Telegram trong Modal
    document.getElementById('backup-config-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = document.getElementById('backup-tg-token')?.value || '';
      const chatId = document.getElementById('backup-tg-chat-id')?.value || '';
      await this.triggerTelegramBackup(token, chatId);
    });
  },

  async loadAccounts() {
    try {
      const res = await API.get('/accounts');
      if (res.success) {
        this.accounts = res.accounts || [];
        this.applyFilters();
      }
    } catch (err) {
      Toast.error(`Lỗi tải danh sách tài khoản: ${err.message}`);
    }
  },

  async loadSuggestions() {
    try {
      const res = await API.get('/suggestions');
      if (res.success && res.data) {
        this.renderSuggestions(res.data);
      }
    } catch (e) {}
  },

  renderSuggestions(data) {
    const banner = document.getElementById('suggestions-banner');
    if (!banner) return;

    if (!data.alerts || data.alerts.length === 0) {
      banner.innerHTML = `
        <div class="flex items-center justify-between p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs">
          <div class="flex items-center gap-2">
            <span>🛡️</span>
            <span>Hệ thống an ninh tối đa! Không phát hiện trùng lặp Proxy hay mật khẩu nguy hiểm. (Điểm: ${data.healthScore}/100)</span>
          </div>
          <span class="font-mono font-bold bg-emerald-500/20 px-2 py-0.5 rounded">100% SECURE</span>
        </div>
      `;
      return;
    }

    const collisionCount = data.summary.collisionsCount || 0;
    const weakCount = data.summary.weakPasswordsCount || 0;
    const missing2FACount = data.summary.missing2FACount || 0;

    banner.innerHTML = `
      <div class="p-4 rounded-xl bg-gradient-to-r from-amber-950/40 via-rose-950/30 to-slate-900 border border-amber-500/30 shadow-lg text-xs">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="text-base">⚠️</span>
            <span class="font-bold text-amber-200">BỘ GỢI Ý & PHÁT HIỆN RỦI RO HỆ THỐNG</span>
            <span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">Điểm an toàn: ${data.healthScore}/100</span>
          </div>
          <span class="text-slate-400">Phát hiện ${data.alerts.length} cảnh báo</span>
        </div>
        <div class="flex flex-wrap gap-2 mt-2">
          ${collisionCount > 0 ? `
            <button class="px-2.5 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-500/40 flex items-center gap-1.5 transition-all" onclick="App.filterByAlert('collision')">
              <span>🚨</span>
              <span>${collisionCount} cụm trùng IP Proxy (Nguy cơ Checkpoint)</span>
            </button>
          ` : ''}
          ${weakCount > 0 ? `
            <button class="px-2.5 py-1 rounded bg-amber-900/60 hover:bg-amber-800 text-amber-200 border border-amber-500/40 flex items-center gap-1.5 transition-all" onclick="App.filterByAlert('weak_password')">
              <span>🔑</span>
              <span>${weakCount} tài khoản mật khẩu yếu</span>
            </button>
          ` : ''}
          ${missing2FACount > 0 ? `
            <button class="px-2.5 py-1 rounded bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 border border-cyan-500/40 flex items-center gap-1.5 transition-all" onclick="App.filterByAlert('missing_2fa')">
              <span>⏱️</span>
              <span>${missing2FACount} tài khoản chưa bật 2FA</span>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  },

  filterByAlert(alertType) {
    this.activeAlertFilter = alertType;
    Toast.info(`Đang lọc danh sách theo cảnh báo: [${alertType}]`);
    this.applyFilters();
  },

  applyFilters() {
    this.filteredAccounts = this.accounts.filter((acc) => {
      // 1. Lọc theo Platform
      if (this.currentPlatform !== 'all' && acc.platform !== this.currentPlatform) {
        return false;
      }

      // 2. Lọc theo Search Query
      if (this.searchQuery) {
        const matchName = (acc.account_name || '').toLowerCase().includes(this.searchQuery);
        const matchUser = (acc.username || '').toLowerCase().includes(this.searchQuery);
        const matchProxy = (acc.proxy_host || '').toLowerCase().includes(this.searchQuery);
        const matchNotes = (acc.notes || '').toLowerCase().includes(this.searchQuery);
        if (!matchName && !matchUser && !matchProxy && !matchNotes) {
          return false;
        }
      }

      // 3. Lọc theo Alert Filter
      if (this.activeAlertFilter === 'missing_2fa' && acc.has_totp) {
        return false;
      }

      return true;
    });

    this.renderTable();
  },

  renderTable() {
    const tbody = document.getElementById('accounts-tbody');
    const countBadge = document.getElementById('accounts-count');
    if (countBadge) countBadge.innerText = `${this.filteredAccounts.length} / ${this.accounts.length}`;

    if (!tbody) return;

    if (this.filteredAccounts.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-12 text-slate-500">
            <div class="text-4xl mb-2">🔍</div>
            <div>Không tìm thấy tài khoản nào phù hợp với bộ lọc</div>
          </td>
        </tr>
      `;
      return;
    }

    const platformBadges = {
      facebook: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
      google: 'bg-red-600/20 text-red-400 border-red-500/30',
      tiktok: 'bg-fuchsia-600/20 text-fuchsia-400 border-fuchsia-500/30',
      x: 'bg-zinc-700/30 text-zinc-300 border-zinc-500/30',
      github: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
      amazon: 'bg-amber-600/20 text-amber-400 border-amber-500/30',
      custom: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30'
    };

    tbody.innerHTML = this.filteredAccounts
      .map((acc) => {
        const badgeClass = platformBadges[acc.platform] || platformBadges.custom;
        const isRunning = acc.is_running;
        const hasProxy = acc.proxy_host && acc.proxy_port;

        return `
          <tr class="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors" data-id="${acc.id}">
            <!-- Cột 1: Nền tảng & Tên -->
            <td class="py-3 px-4">
              <div class="flex items-center gap-2.5">
                <span class="text-xs uppercase px-2 py-0.5 rounded border font-mono font-semibold ${badgeClass}">
                  ${acc.platform}
                </span>
                <div>
                  <div class="font-medium text-slate-200 text-sm flex items-center gap-1.5">
                    <span>${acc.account_name || 'Chưa đặt tên'}</span>
                    ${acc.last_country_code ? this.renderFlagBadge(acc.last_country_code, acc.last_country) : ''}
                  </div>
                  <div class="text-[11px] text-slate-500">${acc.login_url ? `<a href="${acc.login_url}" target="_blank" class="hover:underline hover:text-cyan-400">${new URL(acc.login_url).hostname}</a>` : 'Không có URL'}</div>
                </div>
              </div>
            </td>

            <!-- Cột 2: Đăng nhập & Mật khẩu -->
            <td class="py-3 px-4">
              <div class="flex items-center gap-2">
                <button class="font-mono text-xs text-slate-300 hover:text-cyan-400 flex items-center gap-1" title="Nhấp để chép Username" onclick="Security.safeCopy('${acc.username}', 'Username')">
                  <span>${acc.username}</span>
                  <span class="text-[10px] text-slate-500">📋</span>
                </button>
              </div>
              <div class="mt-1">
                ${acc.has_password
                  ? `<button class="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition-colors" onclick="Security.copyAccountPassword('${acc.id}', '${acc.account_name || acc.username}')">
                      <span>🔑 Copy Password</span>
                    </button>`
                  : `<span class="text-[11px] text-slate-600 italic">Chưa có pass</span>`
                }
              </div>
            </td>

            <!-- Cột 3: Mã 2FA Real-time & Đồng hồ -->
            <td class="py-3 px-4">
              ${acc.has_totp
                ? `
                  <div class="flex items-center gap-2">
                    <button class="totp-badge text-base px-2.5 py-1 rounded bg-slate-900 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-950/50 hover:border-cyan-400 transition-all cursor-pointer flex items-center gap-1.5" title="Nhấp để chép mã 2FA" onclick="Security.safeCopy('${acc.totp_code}', 'Mã 2FA')">
                      <span id="totp-code-${acc.id}">${acc.totp_code}</span>
                      <span class="text-xs">📋</span>
                    </button>
                    <div class="flex flex-col items-center">
                      <span class="text-[10px] font-mono font-bold text-amber-400" id="totp-sec-${acc.id}">${acc.totp_remaining}s</span>
                      <div class="w-8 h-1 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                        <div class="h-full bg-amber-400 transition-all duration-1000" id="totp-bar-${acc.id}" style="width: ${(acc.totp_remaining / 30) * 100}%"></div>
                      </div>
                    </div>
                  </div>
                `
                : `<span class="text-xs text-slate-600 italic">Không có 2FA</span>`
              }
            </td>

            <!-- Cột 4: Proxy & Trạng thái IP -->
            <td class="py-3 px-4">
              ${hasProxy
                ? `
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-mono text-slate-300">${acc.proxy_protocol}://${acc.proxy_host}:${acc.proxy_port}</span>
                    ${acc.last_country_code ? this.renderFlagBadge(acc.last_country_code, acc.last_country) : ''}
                  </div>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full ${acc.last_ip ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-slate-600'}"></span>
                      <span class="font-mono">${acc.last_ip || 'Chưa check IP'}</span>
                      ${acc.last_country ? `<span class="text-slate-400 font-medium">(${acc.last_country})</span>` : ''}
                      ${acc.proxy_latency ? `<span class="text-cyan-400 font-mono text-[10px] bg-cyan-950/40 px-1 rounded">${acc.proxy_latency}ms</span>` : ''}
                    </span>
                    <button class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 transition-colors" title="Kiểm tra kết nối Proxy" onclick="App.checkAccountProxy('${acc.id}')">
                      ⚡ Check
                    </button>
                  </div>
                `
                : `<span class="text-xs text-slate-600 italic">Không gắn Proxy</span>`
              }
            </td>

            <!-- Cột 5: Điều khiển Trình duyệt & Hành động -->
            <td class="py-3 px-4 text-right">
              <div class="flex items-center justify-end gap-2">
                ${isRunning
                  ? `<button class="px-3 py-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 running-glow transition-all" onclick="App.closeBrowser('${acc.id}')">
                      <span>⏹️</span>
                      <span>Đang Chạy - Đóng</span>
                    </button>`
                  : `<button class="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md hover:shadow-emerald-500/20 transition-all" onclick="App.launchBrowser('${acc.id}')">
                      <span>🚀</span>
                      <span>Mở Trình Duyệt</span>
                    </button>`
                }
                <button class="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-colors" title="Chỉnh sửa tài khoản" onclick="App.openEditAccountModal('${acc.id}')">
                  ✏️
                </button>
                <button class="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors" title="Xóa tài khoản" onclick="App.deleteAccount('${acc.id}', '${acc.account_name || acc.username}')">
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  },

  // Đồng hồ đếm ngược 2FA thời gian thực & Batch Ticker
  startTotpClock() {
    if (this.totpTimer) clearInterval(this.totpTimer);

    this.totpTimer = setInterval(async () => {
      const epoch = Math.floor(Date.now() / 1000);
      const remaining = 30 - (epoch % 30);

      // Cập nhật thanh tiến trình và số giây
      for (const acc of this.accounts) {
        if (!acc.has_totp) continue;
        const secEl = document.getElementById(`totp-sec-${acc.id}`);
        const barEl = document.getElementById(`totp-bar-${acc.id}`);
        if (secEl) secEl.innerText = `${remaining}s`;
        if (barEl) barEl.style.width = `${(remaining / 30) * 100}%`;
      }

      // Mỗi khi hết chu kỳ 30s (remaining === 30 hoặc 29), gọi batch update
      if (remaining === 30 || remaining === 29) {
        try {
          const res = await API.get('/accounts/totp/batch');
          if (res.success && res.tokens) {
            for (const [accId, info] of Object.entries(res.tokens)) {
              const codeEl = document.getElementById(`totp-code-${accId}`);
              if (codeEl) codeEl.innerText = info.code;
            }
          }
        } catch (e) {}
      }
    }, 1000);
  },

  // ==================== BẢN ĐỒ & QUỐC KỲ PROXY (FLAG BADGE) ====================
  getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🌐';
    const codePoints = countryCode.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  },

  renderFlagBadge(countryCode, countryName) {
    if (!countryCode) return '';
    const code = countryCode.toLowerCase().trim();
    const name = countryName || countryCode.toUpperCase();
    const emoji = this.getFlagEmoji(countryCode);

    return `
      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700/80 text-[10px] font-mono text-slate-200 shadow-sm" title="${name} (${countryCode.toUpperCase()})">
        <img src="https://flagcdn.com/20x15/${code}.png" 
             srcset="https://flagcdn.com/40x30/${code}.png 2x" 
             width="16" height="12" 
             alt="${countryCode}" 
             class="inline-block rounded-[2px] shadow-sm object-cover" 
             onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
        <span style="display:none;" class="text-xs leading-none">${emoji}</span>
        <span class="font-bold text-[10px] text-cyan-300">${countryCode.toUpperCase()}</span>
      </span>
    `;
  },

  async checkAccountProxy(accountId) {
    try {
      Toast.info('Đang gửi tín hiệu kiểm tra Proxy...');
      const res = await API.post(`/accounts/${accountId}/check-proxy`);
      if (res.success) {
        const flag = res.countryCode ? this.getFlagEmoji(res.countryCode) : '🌐';
        Toast.success(`${flag} Proxy LIVE! [${res.countryCode || 'N/A'}] ${res.ip} (${res.country}) - ${res.latencyMs}ms`);
        await this.loadAccounts();
        await this.loadSuggestions();
      } else {
        Toast.error(`Proxy DIE: ${res.error}`);
      }
    } catch (err) {
      Toast.error(`Lỗi kiểm tra proxy: ${err.message}`);
    }
  },

  async launchBrowser(accountId) {
    try {
      Toast.info('Đang khởi tạo Chromium persistent profile và proxy routing...');
      const res = await API.post(`/accounts/${accountId}/launch`);
      if (res.success) {
        Toast.success(res.message);
        await this.loadAccounts();
      }
    } catch (err) {
      Toast.error(`Không thể mở trình duyệt: ${err.message}`);
    }
  },

  async closeBrowser(accountId) {
    try {
      const res = await API.post(`/accounts/${accountId}/close`);
      if (res.success) {
        Toast.info('Đã đóng phiên trình duyệt');
        await this.loadAccounts();
      }
    } catch (err) {
      Toast.error(`Lỗi đóng trình duyệt: ${err.message}`);
    }
  },

  autoParseProxyInput(raw) {
    if (!raw || !raw.trim()) return;
    let clean = raw.trim();
    let proto = 'http';

    if (clean.includes('://')) {
      const p = clean.split('://');
      proto = p[0].toLowerCase();
      clean = p[1];
    }

    if (clean.includes('@')) {
      const atParts = clean.split('@');
      const auth = atParts[0].split(':');
      const host = atParts[1].split(':');
      document.getElementById('acc-proxy-proto').value = proto;
      document.getElementById('acc-proxy-host').value = host[0] || '';
      document.getElementById('acc-proxy-port').value = host[1] || '';
      document.getElementById('acc-proxy-user').value = auth[0] || '';
      document.getElementById('acc-proxy-pass').value = auth[1] || '';
      return;
    }

    const parts = clean.split(':');
    if (parts.length === 4) {
      document.getElementById('acc-proxy-proto').value = proto;
      document.getElementById('acc-proxy-host').value = parts[0];
      document.getElementById('acc-proxy-port').value = parts[1];
      document.getElementById('acc-proxy-user').value = parts[2];
      document.getElementById('acc-proxy-pass').value = parts[3];
    } else if (parts.length === 2) {
      document.getElementById('acc-proxy-proto').value = proto;
      document.getElementById('acc-proxy-host').value = parts[0];
      document.getElementById('acc-proxy-port').value = parts[1];
    }
  },

  openAccountModal(account = null) {
    const modal = document.getElementById('account-modal');
    const title = document.getElementById('account-modal-title');
    const form = document.getElementById('account-form');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('acc-id').value = account ? account.id : '';

    if (account) {
      title.innerText = 'Chỉnh Sửa Tài Khoản';
      document.getElementById('acc-platform').value = account.platform;
      document.getElementById('acc-login-url').value = account.login_url || '';
      document.getElementById('acc-name').value = account.account_name || '';
      document.getElementById('acc-username').value = account.username;
      document.getElementById('acc-password').placeholder = '(Giữ nguyên mật khẩu cũ)';
      document.getElementById('acc-totp').placeholder = '(Giữ nguyên 2FA Secret cũ)';
      document.getElementById('acc-proxy-proto').value = account.proxy_protocol || 'http';
      document.getElementById('acc-proxy-host').value = account.proxy_host || '';
      document.getElementById('acc-proxy-port').value = account.proxy_port || '';
      document.getElementById('acc-proxy-user').value = account.proxy_user || '';
      document.getElementById('acc-proxy-pass').placeholder = '(Giữ nguyên proxy pass)';
      document.getElementById('acc-ua').value = account.user_agent || '';
      document.getElementById('acc-notes').value = account.notes || '';
    } else {
      title.innerText = 'Thêm Tài Khoản Mới';
      document.getElementById('acc-password').placeholder = 'Mật khẩu tài khoản';
      document.getElementById('acc-totp').placeholder = 'Ví dụ: JBSWY3DPEHPK3PXP';
      document.getElementById('acc-proxy-pass').placeholder = 'Password Proxy';
    }

    modal.classList.remove('hidden');
  },

  async openEditAccountModal(accountId) {
    const acc = this.accounts.find((a) => a.id === accountId);
    if (acc) this.openAccountModal(acc);
  },

  closeAccountModal() {
    document.getElementById('account-modal')?.classList.add('hidden');
  },

  async saveAccount() {
    const id = document.getElementById('acc-id').value;
    const payload = {
      platform: document.getElementById('acc-platform').value,
      login_url: document.getElementById('acc-login-url').value,
      account_name: document.getElementById('acc-name').value,
      username: document.getElementById('acc-username').value,
      password: document.getElementById('acc-password').value,
      totp_secret: document.getElementById('acc-totp').value,
      proxy_protocol: document.getElementById('acc-proxy-proto').value,
      proxy_host: document.getElementById('acc-proxy-host').value,
      proxy_port: document.getElementById('acc-proxy-port').value,
      proxy_user: document.getElementById('acc-proxy-user').value,
      proxy_pass: document.getElementById('acc-proxy-pass').value,
      user_agent: document.getElementById('acc-ua').value,
      notes: document.getElementById('acc-notes').value
    };

    try {
      if (id) {
        await API.put(`/accounts/${id}`, payload);
        Toast.success('Cập nhật tài khoản thành công!');
      } else {
        await API.post('/accounts', payload);
        Toast.success('Thêm tài khoản mới thành công!');
      }
      this.closeAccountModal();
      await this.loadAccounts();
      await this.loadSuggestions();
    } catch (err) {
      Toast.error(`Lỗi: ${err.message}`);
    }
  },

  async deleteAccount(accountId, name) {
    if (!confirm(`Đại Ca có chắc chắn muốn xóa tài khoản [${name}] và dọn sạch Profile trình duyệt không?`)) {
      return;
    }

    try {
      await API.delete(`/accounts/${accountId}`);
      Toast.success(`Đã xóa sạch tài khoản [${name}]!`);
      await this.loadAccounts();
      await this.loadSuggestions();
    } catch (err) {
      Toast.error(`Lỗi xóa: ${err.message}`);
    }
  },

  // Import Hàng Loạt
  openImportModal() {
    document.getElementById('import-modal')?.classList.remove('hidden');
  },
  closeImportModal() {
    document.getElementById('import-modal')?.classList.add('hidden');
  },
  async submitImport() {
    const raw = document.getElementById('import-raw-data').value;
    if (!raw.trim()) {
      Toast.warning('Vui lòng dán dữ liệu cần import');
      return;
    }

    try {
      Toast.info('Đang xử lý mã hóa và nhập dữ liệu hàng loạt...');
      const res = await API.post('/accounts/import', { raw_data: raw });
      Toast.success(res.message);
      this.closeImportModal();
      await this.loadAccounts();
      await this.loadSuggestions();
    } catch (err) {
      Toast.error(`Lỗi import: ${err.message}`);
    }
  },

  // Quản lý Users (Admin)
  async openUsersModal() {
    const modal = document.getElementById('users-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    await this.loadUsersList();
  },
  closeUsersModal() {
    document.getElementById('users-modal')?.classList.add('hidden');
  },
  async loadUsersList() {
    try {
      const res = await API.get('/users');
      const tbody = document.getElementById('users-tbody');
      if (!tbody || !res.success) return;

      tbody.innerHTML = res.users
        .map((u) => `
          <tr class="border-b border-slate-800 text-xs">
            <td class="py-2.5 px-3 font-semibold text-slate-200">${u.username}</td>
            <td class="py-2.5 px-3">
              <span class="px-2 py-0.5 rounded font-mono ${u.role === 'admin' ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'}">
                ${u.role}
              </span>
            </td>
            <td class="py-2.5 px-3">
              <span class="px-2 py-0.5 rounded ${u.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}">
                ${u.status}
              </span>
            </td>
            <td class="py-2.5 px-3 text-slate-400 font-mono">${u.assigned_accounts_count || 0} acc</td>
            <td class="py-2.5 px-3 text-right">
              <button class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 mr-1" onclick="App.openPermissionsModal('${u.id}', '${u.username}')">
                🛡️ Quyền
              </button>
              ${u.username !== 'admin'
                ? `
                  <button class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 ${u.status === 'active' ? 'text-amber-400' : 'text-emerald-400'} mr-1" onclick="App.toggleUserLock('${u.id}', '${u.status}')">
                    ${u.status === 'active' ? 'Khóa' : 'Mở'}
                  </button>
                  <button class="px-2 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-300" onclick="App.deleteUser('${u.id}')">
                    Xóa
                  </button>
                `
                : ''}
            </td>
          </tr>
        `)
        .join('');
    } catch (e) {
      Toast.error(`Lỗi tải danh sách người dùng: ${e.message}`);
    }
  },

  async createUserPrompt() {
    const username = prompt('Nhập tên người dùng mới (Username):');
    if (!username) return;
    const password = prompt('Nhập mật khẩu cho người dùng này:');
    if (!password) return;
    const isAdmin = confirm('Bạn có muốn cấp quyền Super Admin cho tài khoản này không? (OK = Admin, Cancel = User)');

    try {
      await API.post('/users', {
        username,
        password,
        role: isAdmin ? 'admin' : 'user'
      });
      Toast.success(`Tạo thành công thành viên [${username}]!`);
      await this.loadUsersList();
    } catch (err) {
      Toast.error(`Lỗi tạo user: ${err.message}`);
    }
  },

  async toggleUserLock(userId, currentStatus) {
    const nextStatus = currentStatus === 'active' ? 'locked' : 'active';
    try {
      await API.put(`/users/${userId}`, { status: nextStatus });
      Toast.success(`Đã cập nhật trạng thái người dùng thành: ${nextStatus}`);
      await this.loadUsersList();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async deleteUser(userId) {
    if (!confirm('Đại Ca có chắc chắn muốn xóa người dùng này?')) return;
    try {
      await API.delete(`/users/${userId}`);
      Toast.success('Đã xóa người dùng thành công');
      await this.loadUsersList();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  // Phân quyền cho User
  async openPermissionsModal(userId, username) {
    document.getElementById('perm-modal-username').innerText = username;
    document.getElementById('perm-modal-user-id').value = userId;
    const modal = document.getElementById('permissions-modal');
    modal.classList.remove('hidden');

    try {
      const res = await API.get(`/users/${userId}/permissions`);
      const userPerms = res.permissions || [];
      const permMap = new Map();
      userPerms.forEach((p) => permMap.set(p.account_id, p));

      const container = document.getElementById('permissions-list');
      container.innerHTML = this.accounts
        .map((acc) => {
          const perm = permMap.get(acc.id);
          const canView = perm ? !!perm.can_view : false;
          const canLaunch = perm ? !!perm.can_launch : false;
          const canReveal = perm ? !!perm.can_reveal_password : false;

          return `
            <div class="flex items-center justify-between p-2.5 rounded bg-slate-900 border border-slate-800 text-xs">
              <div class="flex items-center gap-2">
                <span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 uppercase">${acc.platform}</span>
                <span class="font-medium text-slate-200">${acc.account_name || acc.username}</span>
              </div>
              <div class="flex items-center gap-4">
                <label class="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" class="perm-view" data-acc="${acc.id}" ${canView ? 'checked' : ''}>
                  <span class="text-slate-400">Xem/2FA</span>
                </label>
                <label class="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" class="perm-launch" data-acc="${acc.id}" ${canLaunch ? 'checked' : ''}>
                  <span class="text-slate-400">Mở Browser</span>
                </label>
                <label class="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" class="perm-reveal" data-acc="${acc.id}" ${canReveal ? 'checked' : ''}>
                  <span class="text-amber-400 font-semibold">Copy Pass</span>
                </label>
              </div>
            </div>
          `;
        })
        .join('');
    } catch (e) {
      Toast.error(e.message);
    }
  },
  closePermissionsModal() {
    document.getElementById('permissions-modal')?.classList.add('hidden');
  },
  async savePermissions() {
    const userId = document.getElementById('perm-modal-user-id').value;
    const permissions = [];

    document.querySelectorAll('#permissions-list .perm-view').forEach((cb) => {
      const accId = cb.dataset.acc;
      const canView = cb.checked;
      const canLaunch = document.querySelector(`.perm-launch[data-acc="${accId}"]`)?.checked || false;
      const canReveal = document.querySelector(`.perm-reveal[data-acc="${accId}"]`)?.checked || false;

      if (canView) {
        permissions.push({
          accountId: accId,
          can_view: true,
          can_launch: canLaunch,
          can_reveal_password: canReveal
        });
      }
    });

    try {
      await API.post(`/users/${userId}/permissions`, { permissions });
      Toast.success('Đã cập nhật phân quyền tài khoản thành công!');
      this.closePermissionsModal();
      await this.loadUsersList();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  // Audit Logs (Admin)
  async openAuditModal() {
    const modal = document.getElementById('audit-modal');
    modal.classList.remove('hidden');
    try {
      const res = await API.get('/audit-logs?limit=50');
      const tbody = document.getElementById('audit-tbody');
      if (!tbody || !res.success) return;

      tbody.innerHTML = res.logs
        .map((l) => `
          <tr class="border-b border-slate-800 text-[11px]">
            <td class="py-2 px-3 text-slate-400 font-mono">${new Date(l.created_at).toLocaleString('vi-VN')}</td>
            <td class="py-2 px-3 font-semibold text-slate-200">${l.username || 'System'}</td>
            <td class="py-2 px-3">
              <span class="px-1.5 py-0.5 rounded font-mono ${l.action.includes('FAIL') ? 'bg-rose-500/20 text-rose-400' : 'bg-cyan-500/20 text-cyan-400'}">
                ${l.action}
              </span>
            </td>
            <td class="py-2 px-3 font-mono text-slate-400">${l.ip_address}</td>
            <td class="py-2 px-3 text-slate-400 truncate max-w-xs">${l.details || '-'}</td>
          </tr>
        `)
        .join('');
    } catch (e) {
      Toast.error(e.message);
    }
  },
  closeAuditModal() {
    document.getElementById('audit-modal')?.classList.add('hidden');
  },

  // ==================== LỊCH UP VIDEO & NHẮC NHỞ HÀNG NGÀY ====================
  schedules: [],

  async loadSchedules() {
    try {
      const res = await API.get('/schedules');
      if (res.success) {
        this.schedules = res.schedules || [];
        this.renderScheduleBadge();
        this.renderSchedulesTable();
      }
    } catch (e) {
      console.warn('Lỗi tải lịch up video:', e.message);
    }
  },

  renderScheduleBadge() {
    const badge = document.getElementById('schedules-badge');
    const headerBadge = document.getElementById('header-sched-badge');
    const pendingCount = this.schedules.filter(s => s.status === 'pending').length;

    if (badge) {
      badge.innerText = pendingCount;
      if (pendingCount > 0) {
        badge.classList.remove('bg-black/40', 'text-pink-300');
        badge.classList.add('bg-rose-500', 'text-white', 'animate-pulse');
      } else {
        badge.classList.remove('bg-rose-500', 'text-white', 'animate-pulse');
        badge.classList.add('bg-black/40', 'text-pink-300');
      }
    }

    if (headerBadge) {
      headerBadge.innerText = pendingCount;
      if (pendingCount > 0) {
        headerBadge.classList.remove('bg-pink-500');
        headerBadge.classList.add('bg-rose-500', 'animate-pulse');
      } else {
        headerBadge.classList.remove('bg-rose-500', 'animate-pulse');
        headerBadge.classList.add('bg-pink-500');
      }
    }
  },

  async openSchedulesModal() {
    document.getElementById('schedules-modal')?.classList.remove('hidden');
    await this.loadSchedules();
  },

  closeSchedulesModal() {
    document.getElementById('schedules-modal')?.classList.add('hidden');
  },

  renderSchedulesTable() {
    const tbody = document.getElementById('schedules-tbody');
    const progText = document.getElementById('sched-progress-text');
    const progBar = document.getElementById('sched-progress-bar');
    if (!tbody) return;

    const total = this.schedules.length;
    const posted = this.schedules.filter(s => s.status === 'posted').length;
    const percent = total > 0 ? Math.round((posted / total) * 100) : 100;

    if (progText) progText.innerText = `${posted} / ${total} video (${percent}%)`;
    if (progBar) progBar.style.width = `${percent}%`;

    if (this.schedules.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="py-8 text-center text-slate-500 italic">
            Chưa có lịch up video nào. Hãy bấm "+ Thêm Lịch Up Bài" để lên kế hoạch xây kênh!
          </td>
        </tr>
      `;
      return;
    }

    const platformBadges = {
      facebook: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
      google: 'bg-red-600/20 text-red-400 border-red-500/30',
      tiktok: 'bg-fuchsia-600/20 text-fuchsia-400 border-fuchsia-500/30',
      x: 'bg-zinc-700/30 text-zinc-300 border-zinc-500/30',
      github: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
      custom: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30'
    };

    tbody.innerHTML = this.schedules.map(s => {
      const isPosted = s.status === 'posted';
      const isUrgent = s.time_status === 'urgent';
      const isOverdue = s.time_status === 'overdue';

      let statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">⏳ Chờ đăng</span>`;
      if (isPosted) {
        statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">✓ Đã đăng</span>`;
      } else if (isOverdue) {
        statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">⚠️ Quá giờ!</span>`;
      } else if (isUrgent) {
        statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 animate-pulse">🔥 Sắp tới giờ!</span>`;
      }

      return `
        <tr class="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
          <td class="py-2.5 px-3">
            <div class="flex items-center gap-2">
              <span class="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${platformBadges[s.platform] || platformBadges.custom}">
                ${s.platform}
              </span>
              <span class="font-medium text-slate-200">${s.account_name || s.account_username}</span>
            </div>
          </td>
          <td class="py-2.5 px-3">
            <div class="font-semibold text-slate-100">${s.video_title}</div>
            ${s.hashtags ? `<div class="text-[10px] text-fuchsia-400 font-mono truncate max-w-xs">${s.hashtags}</div>` : ''}
          </td>
          <td class="py-2.5 px-3 font-mono font-bold text-cyan-300">
            ${s.scheduled_time}
            <div class="text-[10px] font-normal text-slate-400">
              ${isPosted ? (s.posted_url ? `<a href="${s.posted_url}" target="_blank" class="text-cyan-400 underline">Xem bài</a>` : 'Đã xong') : (s.minutes_remaining > 0 ? `Còn ${s.minutes_remaining} phút` : `Trễ ${Math.abs(s.minutes_remaining)} phút`)}
            </div>
          </td>
          <td class="py-2.5 px-3">${statusBadge}</td>
          <td class="py-2.5 px-3 text-right">
            <div class="flex items-center justify-end gap-1.5">
              ${s.caption || s.hashtags ? `
                <button class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]" title="Copy Caption & Hashtag" onclick="Security.safeCopy('${(s.caption || '') + ' ' + (s.hashtags || '')}', 'Caption Video')">
                  📋 Copy
                </button>
              ` : ''}
              
              <button class="px-2.5 py-1 rounded-lg bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white text-[11px] font-semibold shadow-sm flex items-center gap-1" title="1-Click mở trang Studio Upload Video của nền tảng" onclick="App.launchStudio('${s.id}')">
                <span>🚀</span>
                <span>Mở Studio Up</span>
              </button>

              ${!isPosted ? `
                <button class="px-2 py-1 rounded bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 text-[11px]" title="Đánh dấu đã đăng xong" onclick="App.markSchedulePosted('${s.id}')">
                  ✓ Xong
                </button>
              ` : ''}

              <button class="p-1 rounded text-slate-500 hover:text-rose-400 text-xs" title="Xóa lịch này" onclick="App.deleteSchedule('${s.id}')">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openAddScheduleModal() {
    const select = document.getElementById('sched-account-id');
    if (!select) return;

    select.innerHTML = '<option value="">-- Chọn Kênh / Tài Khoản --</option>' +
      this.accounts.map(a => `
        <option value="${a.id}">[${a.platform.toUpperCase()}] ${a.account_name || a.username}</option>
      `).join('');

    // Đặt giờ mặc định là giờ vàng tiếp theo
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const defaultTime = `${String(now.getHours()).padStart(2, '0')}:00`;
    document.getElementById('sched-time').value = defaultTime;

    document.getElementById('schedule-form-modal')?.classList.remove('hidden');
  },

  closeAddScheduleModal() {
    document.getElementById('schedule-form-modal')?.classList.add('hidden');
  },

  async saveSchedule() {
    const account_id = document.getElementById('sched-account-id').value;
    const video_title = document.getElementById('sched-title').value;
    const scheduled_time = document.getElementById('sched-time').value;
    const frequency = document.getElementById('sched-frequency').value;
    const caption = document.getElementById('sched-caption').value;
    const hashtags = document.getElementById('sched-hashtags').value;

    if (!account_id || !video_title || !scheduled_time) {
      Toast.warning('Vui lòng điền đầy đủ các mục bắt buộc (*)');
      return;
    }

    try {
      await API.post('/schedules', {
        account_id,
        video_title,
        scheduled_time,
        frequency,
        caption,
        hashtags
      });
      Toast.success('Đã lên lịch nhắc nhở đăng video thành công!');
      this.closeAddScheduleModal();
      await this.loadSchedules();
    } catch (err) {
      Toast.error(`Lỗi: ${err.message}`);
    }
  },

  async markSchedulePosted(scheduleId) {
    const postedUrl = prompt('Nhập link video đã đăng (Tùy chọn, để tiện theo dõi sau này):') || '';
    try {
      await API.put(`/schedules/${scheduleId}`, {
        status: 'posted',
        posted_url: postedUrl
      });
      Toast.success('Tuyệt vời! Đã ghi nhận chỉ tiêu video hôm nay hoàn thành!');
      await this.loadSchedules();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async launchStudio(scheduleId) {
    try {
      Toast.info('Đang mở Chromium Studio Upload Video kèm Proxy sạch...');
      const res = await API.post(`/schedules/${scheduleId}/launch-studio`);
      if (res.success) {
        Toast.success(res.message);
        await this.loadAccounts();
      }
    } catch (err) {
      Toast.error(`Lỗi mở Studio: ${err.message}`);
    }
  },

  async deleteSchedule(scheduleId) {
    if (!confirm('Đại Ca có muốn xóa lịch nhắc nhở này không?')) return;
    try {
      await API.delete(`/schedules/${scheduleId}`);
      Toast.success('Đã xóa lịch đăng video');
      await this.loadSchedules();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  // ==================== PIIK LIVE SCREEN STREAM ====================
  async refreshPiikStreams() {
    try {
      const grid = document.getElementById('piik-streams-grid');
      const badge = document.getElementById('header-stream-badge');
      if (!grid) return;

      const res = await API.get('/tools/piik-streams');
      if (!res.success) return;

      if (badge) {
        if (res.count > 0) badge.classList.remove('hidden');
        else badge.classList.add('hidden');
      }

      if (res.count === 0) {
        grid.innerHTML = `
          <div class="col-span-full py-12 text-center text-slate-500 italic">
            <div class="text-4xl mb-2">📺</div>
            <div>Hiện chưa có phiên trình duyệt nào đang mở trên máy chủ.</div>
            <div class="text-xs text-slate-600 mt-1">Vào tab "Tài Khoản & Proxy" và bấm [Mở Trình Duyệt] để quan sát live stream tại đây!</div>
          </div>
        `;
        return;
      }

      grid.innerHTML = res.streams.map(s => `
        <div class="glass-panel p-3.5 rounded-xl flex flex-col gap-2.5 border-emerald-500/30">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span class="font-bold text-xs text-slate-200">${s.accountName}</span>
              <span class="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400">${s.platform}</span>
              ${s.countryCode ? this.renderFlagBadge(s.countryCode, s.country) : ''}
            </div>
            <span class="text-[10px] font-mono text-slate-400">${s.proxy}</span>
          </div>

          <div class="stream-screen-frame aspect-video flex items-center justify-center bg-black">
            ${s.screenshot
              ? `<img src="${s.screenshot}" alt="Live Preview" class="w-full h-full object-contain">`
              : `<div class="text-xs text-slate-600 font-mono">Đang nạp tín hiệu khung hình...</div>`
            }
          </div>

          <div class="flex items-center justify-between text-[11px] text-slate-400">
            <span class="truncate max-w-[200px]" title="${s.previewUrl || ''}">${s.previewTitle || s.previewUrl || 'Đang duyệt web...'}</span>
            <button class="px-2 py-0.5 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-300 text-[10px] font-semibold" onclick="App.closeBrowser('${s.accountId}'); setTimeout(() => App.refreshPiikStreams(), 1000);">
              Đóng Phiên
            </button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      console.warn('Lỗi tải Piik Live Stream:', e.message);
    }
  },

  // ==================== VŨ KHÍ RỬA MÃ VIDEO (HASH SANITIZER) ====================
  async handleVideoFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 150 * 1024 * 1024) {
      Toast.error('File video quá lớn (>150MB). Vui lòng chọn file ngắn hơn để xử lý nhanh');
      return;
    }

    Toast.info(`Đang nạp file [${file.name}] để tẩy rửa metadata...`);
    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const base64Data = reader.result;
        const res = await API.post('/tools/sanitize-video', {
          base64Data,
          filename: file.name
        });

        if (res.success) {
          document.getElementById('sanitizer-result')?.classList.remove('hidden');
          document.getElementById('old-md5').innerText = res.originalHash.md5;
          document.getElementById('new-md5').innerText = res.newHash.md5;

          const downloadBtn = document.getElementById('btn-download-sanitized');
          if (downloadBtn) {
            downloadBtn.href = res.sanitizedBase64;
            downloadBtn.download = res.filename;
          }

          Toast.success('Rửa mã video thành công! Mã MD5 mới đã được tạo 100%!');
        }
      } catch (err) {
        Toast.error(`Lỗi rửa video: ${err.message}`);
      }
    };

    reader.readAsDataURL(file);
  },

  // ==================== CẤU HÌNH BÁO ĐỘNG TELEGRAM ====================
  async loadTelegramConfig() {
    try {
      const res = await API.get('/tools/telegram');
      if (res.success) {
        if (res.botToken) document.getElementById('tg-token').value = res.botToken;
        if (res.chatId) document.getElementById('tg-chat-id').value = res.chatId;
      }
    } catch (e) {}
  },

  async saveTelegramConfig() {
    const botToken = document.getElementById('tg-token').value;
    const chatId = document.getElementById('tg-chat-id').value;

    try {
      const res = await API.post('/tools/telegram', { botToken, chatId });
      Toast.success(res.message);
    } catch (err) {
      Toast.error(`Lỗi: ${err.message}`);
    }
  },

  async testTelegramAlert() {
    const botToken = document.getElementById('tg-token').value;
    const chatId = document.getElementById('tg-chat-id').value;

    Toast.info('Đang gửi tin nhắn thử nghiệm tới Telegram...');
    try {
      const res = await API.post('/tools/telegram/test', { botToken, chatId });
      if (res.success) {
        Toast.success('Chuông báo Telegram kêu to đét! Kiểm tra điện thoại nhé Đại Ca!');
      } else {
        Toast.error(`Lỗi Telegram: ${res.error}`);
      }
    } catch (err) {
      Toast.error(`Lỗi kết nối: ${err.message}`);
    }
  },

  // ==================== KHO HOOK 3 GIÂY TRIỆU VIEW ====================
  async loadHooks(categoryId = 'all') {
    try {
      const res = await API.get(`/tools/hooks?category=${categoryId}`);
      if (!res.success) return;

      const catContainer = document.getElementById('hook-categories-container');
      if (catContainer && res.categories) {
        catContainer.innerHTML = res.categories.map(c => `
          <button class="px-2.5 py-1 rounded-lg text-xs font-semibold ${c.id === categoryId ? 'bg-amber-500 text-black font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}" onclick="App.loadHooks('${c.id}')">
            ${c.name}
          </button>
        `).join('');
      }

      const grid = document.getElementById('hooks-grid');
      if (!grid) return;

      grid.innerHTML = res.hooks.map(h => `
        <div class="glass-panel p-4 rounded-xl flex flex-col justify-between gap-3 border-slate-800 hover:border-amber-500/40 transition-colors">
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold uppercase">${h.category}</span>
              <button class="text-xs text-slate-400 hover:text-amber-400" title="Chép Hook 3s" onclick="Security.safeCopy('${h.hookText.replace(/'/g, "\\'")}', 'Hook 3 Giây')">
                📋 Chép Hook
              </button>
            </div>
            <h4 class="font-bold text-white text-xs mb-1">${h.title}</h4>
            <p class="text-xs text-amber-200/90 italic bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">"${h.hookText}"</p>
          </div>

          <div class="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
            <span class="text-slate-400 truncate max-w-[200px]">${h.hashtags}</span>
            <button class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-[10px]" onclick="Security.safeCopy('${(h.caption + ' ' + h.hashtags).replace(/'/g, "\\'")}', 'Caption & Hashtags')">
              Chép Caption
            </button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      console.warn('Lỗi tải Hook Vault:', e.message);
    }
  },

  // ==================== TẢI AUDIT LOGS TRỰC TIẾP ====================
  async loadAuditLogs() {
    try {
      const res = await API.get('/audit-logs?limit=30');
      const tbody = document.getElementById('audit-tbody');
      if (!tbody || !res.success) return;

      tbody.innerHTML = res.logs.map(l => `
        <tr class="border-b border-slate-800/40 text-[11px]">
          <td class="py-2 px-2 text-slate-400 font-mono">${new Date(l.created_at).toLocaleTimeString('vi-VN')}</td>
          <td class="py-2 px-2 font-semibold text-slate-200">${l.username || 'System'}</td>
          <td class="py-2 px-2">
            <span class="px-1.5 py-0.5 rounded font-mono text-[10px] ${l.action.includes('FAIL') ? 'bg-rose-500/20 text-rose-400' : 'bg-cyan-500/20 text-cyan-400'}">
              ${l.action}
            </span>
          </td>
          <td class="py-2 px-2 text-slate-400 truncate max-w-xs">${l.details || '-'}</td>
        </tr>
      `).join('');
    } catch (e) {}
  },

  // ==================== TÍCH HỢP API WEB BÁN PROXY (PROVIDER HUB) ====================
  providers: [],
  activeProviderForAssign: null,
  activeProxyForAssign: null,

  handleProviderTypeChange() {
    const type = document.getElementById('prov-type')?.value;
    const urlContainer = document.getElementById('prov-custom-url-container');
    if (urlContainer) {
      if (type === 'custom') urlContainer.classList.remove('hidden');
      else urlContainer.classList.add('hidden');
    }
  },

  openAddProviderForm() {
    const keyInput = document.getElementById('prov-key');
    if (keyInput) {
      keyInput.focus();
      keyInput.scrollIntoView({ behavior: 'smooth' });
    }
  },

  async testLiveProviderKey() {
    const provider_type = document.getElementById('prov-type')?.value || 'tmproxy';
    const api_key = document.getElementById('prov-key')?.value;
    const api_url = document.getElementById('prov-url')?.value;

    if (!api_key || !api_key.trim()) {
      Toast.warning('Vui lòng nhập API Key của bên bán proxy');
      return;
    }

    Toast.info(`Đang gửi tín hiệu kiểm tra Key sang máy chủ bên bán [${provider_type.toUpperCase()}]...`);
    try {
      const res = await API.post('/providers/test-live', {
        provider_type,
        api_key,
        api_url
      });

      const resultBox = document.getElementById('provider-test-result');
      const statusBadge = document.getElementById('prov-status-badge');
      const flagContainer = document.getElementById('prov-flag-container');
      const proxyVal = document.getElementById('prov-proxy-val');
      const timeVal = document.getElementById('prov-time-val');
      const msgVal = document.getElementById('prov-msg-val');
      const assignBtn = document.getElementById('btn-prov-assign');

      if (resultBox) resultBox.classList.remove('hidden');

      if (res.success && (res.status === 'active' || res.proxy)) {
        Toast.success(`Key [${provider_type.toUpperCase()}] HOẠT ĐỘNG TỐT!`);
        if (statusBadge) {
          statusBadge.innerHTML = `
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse"></span>
            <span class="font-bold text-emerald-400 text-sm">TRẠNG THÁI: ACTIVE (CÒN HẠN & ĐANG HOẠT ĐỘNG)</span>
          `;
        }

        this.activeProxyForAssign = res.proxy;
        this.activeProviderForAssign = null; // Chế độ test live
        if (assignBtn) assignBtn.classList.remove('hidden');

        if (proxyVal) proxyVal.innerText = res.proxy || 'Chưa lấy IP (Bấm đổi IP)';
        if (flagContainer && res.countryCode) {
          flagContainer.innerHTML = this.renderFlagBadge(res.countryCode, res.location || res.countryCode);
        }
        if (timeVal) {
          timeVal.innerText = res.timeoutSeconds ? `Chờ đổi IP: ${res.timeoutSeconds}s` : (res.totalProxies ? `Gói có: ${res.totalProxies} proxies` : '');
        }
        if (msgVal) msgVal.innerText = res.message || 'Kết nối thành công!';
      } else {
        Toast.error(`Lỗi bên bán: ${res.error || res.message || 'Key không hoạt động'}`);
        if (statusBadge) {
          statusBadge.innerHTML = `
            <span class="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]"></span>
            <span class="font-bold text-rose-400 text-sm">TRẠNG THÁI: EXPIRED / LỖI (${res.error || 'Từ chối'})</span>
          `;
        }
        if (assignBtn) assignBtn.classList.add('hidden');
        if (proxyVal) proxyVal.innerText = 'Không có proxy';
        if (flagContainer) flagContainer.innerHTML = '';
        if (msgVal) msgVal.innerText = res.error || 'Key không hợp lệ hoặc đã hết hạn!';
      }
    } catch (err) {
      Toast.error(`Lỗi kết nối API: ${err.message}`);
    }
  },

  async saveProviderKey() {
    const provider_name = document.getElementById('prov-name')?.value;
    const provider_type = document.getElementById('prov-type')?.value;
    const api_key = document.getElementById('prov-key')?.value;
    const api_url = document.getElementById('prov-url')?.value;

    if (!provider_name || !api_key) {
      Toast.warning('Vui lòng nhập Tên gói và API Key');
      return;
    }

    try {
      Toast.info('Đang kiểm tra và lưu API Key vào hệ thống...');
      const res = await API.post('/providers', {
        provider_name,
        provider_type,
        api_key,
        api_url
      });

      if (res.success) {
        Toast.success(`Đã lưu thành công gói Proxy [${provider_name}]!`);
        document.getElementById('prov-name').value = '';
        document.getElementById('prov-key').value = '';
        await this.loadProviders();
      }
    } catch (err) {
      Toast.error(`Lỗi lưu: ${err.message}`);
    }
  },

  async loadProviders() {
    try {
      const res = await API.get('/providers');
      const tbody = document.getElementById('providers-tbody');
      if (!tbody) return;

      this.providers = res.providers || [];

      if (this.providers.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="py-6 text-center text-slate-500 italic">
              Chưa lưu API Key của web bán proxy nào. Nhập form bên trên để check và lưu nhé!
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = this.providers.map(p => {
        const isActive = p.last_check_status === 'active';
        return `
          <tr class="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors">
            <td class="py-2.5 px-3 font-semibold text-slate-200">
              <div class="flex items-center gap-1.5">
                <span>${p.provider_name}</span>
                ${p.country_code ? this.renderFlagBadge(p.country_code) : ''}
              </div>
            </td>
            <td class="py-2.5 px-3">
              <span class="px-2 py-0.5 rounded font-mono uppercase bg-slate-800 text-amber-300 text-[10px] border border-amber-500/20">
                ${p.provider_type}
              </span>
            </td>
            <td class="py-2.5 px-3 font-mono text-slate-400 text-[11px]">${p.api_key_masked}</td>
            <td class="py-2.5 px-3 font-mono text-cyan-300 text-[11px] truncate max-w-xs">
              ${p.current_proxy || '<span class="text-slate-600 italic">Chưa check</span>'}
            </td>
            <td class="py-2.5 px-3">
              <span class="px-2 py-0.5 rounded text-[10px] font-mono ${isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}">
                ${isActive ? '✓ Live' : '✕ Die / Error'}
              </span>
            </td>
            <td class="py-2.5 px-3 text-right">
              <div class="flex items-center justify-end gap-1.5">
                <button class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px]" title="Check lại key ngay" onclick="App.checkStoredProvider('${p.id}')">
                  ⚡ Check
                </button>
                ${p.current_proxy ? `
                  <button class="px-2 py-1 rounded bg-cyan-900/60 hover:bg-cyan-800 text-cyan-300 text-[11px] font-bold" title="Gán proxy này vào kênh" onclick="App.openAssignProxyModal('${p.id}', '${p.current_proxy}')">
                    📥 Gán
                  </button>
                ` : ''}
                <button class="p-1 rounded text-slate-500 hover:text-rose-400 text-xs" title="Xóa key này" onclick="App.deleteProvider('${p.id}')">
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      console.warn('Lỗi tải Provider list:', e.message);
    }
  },

  async checkStoredProvider(providerId) {
    Toast.info('Đang gửi tín hiệu kiểm tra Key sang bên bán...');
    try {
      const res = await API.post(`/providers/${providerId}/check`);
      if (res.success && res.checkResult) {
        const c = res.checkResult;
        if (c.success) {
          Toast.success(`Key ACTIVE! Proxy: ${c.proxy || 'Sẵn sàng'}`);
        } else {
          Toast.error(`Bên bán báo lỗi: ${c.error || 'Key hết hạn'}`);
        }
        await this.loadProviders();
      }
    } catch (err) {
      Toast.error(`Lỗi check: ${err.message}`);
    }
  },

  async deleteProvider(providerId) {
    if (!confirm('Đại Ca có chắc chắn muốn xóa API Key này không?')) return;
    try {
      await API.delete(`/providers/${providerId}`);
      Toast.success('Đã xóa Provider API Key');
      await this.loadProviders();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  openAssignProxyModal(providerId = null, proxyStr = null) {
    this.activeProviderForAssign = providerId;
    const finalProxy = proxyStr || this.activeProxyForAssign;
    if (!finalProxy) {
      Toast.warning('Chưa có thông tin Proxy hợp lệ để gán');
      return;
    }

    const preview = document.getElementById('assign-proxy-preview');
    if (preview) preview.innerText = finalProxy;

    const select = document.getElementById('assign-target-account');
    if (select) {
      select.innerHTML = '<option value="">-- Chọn Kênh / Tài Khoản Muốn Nhận Proxy --</option>' +
        this.accounts.map(a => `
          <option value="${a.id}">[${a.platform.toUpperCase()}] ${a.account_name || a.username} (${a.proxy_host ? a.proxy_host : 'Chưa có proxy'})</option>
        `).join('');
    }

    document.getElementById('assign-proxy-modal')?.classList.remove('hidden');
  },

  closeAssignProxyModal() {
    document.getElementById('assign-proxy-modal')?.classList.add('hidden');
  },

  async submitAssignProxy() {
    const account_id = document.getElementById('assign-target-account')?.value;
    if (!account_id) {
      Toast.warning('Vui lòng chọn Kênh cần nhận Proxy');
      return;
    }

    try {
      if (this.activeProviderForAssign) {
        // Gán từ Provider đã lưu
        const res = await API.post(`/providers/${this.activeProviderForAssign}/assign-to-account`, { account_id });
        Toast.success(res.message);
      } else if (this.activeProxyForAssign) {
        // Gán từ kết quả test live
        const parsed = parseProxyString(this.activeProxyForAssign);
        await API.put(`/accounts/${account_id}`, {
          raw_proxy: this.activeProxyForAssign
        });
        Toast.success(`Đã gán thành công Proxy [${this.activeProxyForAssign}] vào kênh!`);
      }

      this.closeAssignProxyModal();
      await this.loadAccounts();
    } catch (err) {
      Toast.error(`Lỗi gán proxy: ${err.message}`);
    }
  },

  // ==================== KHO TƯ LIỆU KỊCH BẢN & ẢNH (.md / .txt / .png) ====================

  /**
   * Trình biên dịch Markdown client-side độc lập, không phụ thuộc thư viện ngoài
   */
  renderMarkdown(text) {
    if (!text || !text.trim()) {
      return '<p class="text-slate-500 italic">Nội dung văn bản rỗng.</p>';
    }

    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 1. Code blocks
    const codeBlocks = [];
    escaped = escaped.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || 'code', code });
      return `__CODE_BLOCK_${idx}__`;
    });

    // 2. Inline code
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 3. Headers
    escaped = escaped.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
    escaped = escaped.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
    escaped = escaped.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    escaped = escaped.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    escaped = escaped.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    escaped = escaped.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // 4. Blockquotes
    escaped = escaped.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // 5. Horizontal Rules
    escaped = escaped.replace(/^---$/gim, '<hr>');
    escaped = escaped.replace(/^\*\*\*$/gim, '<hr>');

    // 6. Bold, Italic, Strikethrough
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/_([^_]+)_/g, '<em>$1</em>');
    escaped = escaped.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // 7. Checkboxes
    escaped = escaped.replace(/\[x\] (.*$)/gim, '<div class="flex items-center gap-2 text-emerald-400 font-semibold"><input type="checkbox" checked disabled class="accent-emerald-500"> <span>$1</span></div>');
    escaped = escaped.replace(/\[ \] (.*$)/gim, '<div class="flex items-center gap-2 text-slate-400"><input type="checkbox" disabled> <span>$1</span></div>');

    // 8. Lists
    escaped = escaped.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
    escaped = escaped.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');

    // 9. Links & Images
    escaped = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="rounded-lg max-w-full my-2 border border-slate-700">');
    escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-cyan-400 hover:underline">$1</a>');

    // 10. Split Paragraphs
    let html = escaped.split('\n\n').map(p => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<h') || trimmed.startsWith('<blockquote') || trimmed.startsWith('<ul') || trimmed.startsWith('<hr') || trimmed.startsWith('__CODE_BLOCK_') || trimmed.startsWith('<div')) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    // Restore Code Blocks
    codeBlocks.forEach((item, i) => {
      const placeholder = `__CODE_BLOCK_${i}__`;
      const blockHtml = `
        <div class="my-3 rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
          <div class="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[10px] font-mono text-slate-400">
            <span class="text-cyan-400 font-bold uppercase">${item.lang}</span>
            <button type="button" class="text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(item.code)}'));Toast.success('Đã sao chép khối mã code!');">
              <span>📋</span> <span>Sao chép</span>
            </button>
          </div>
          <pre class="p-3 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed"><code>${item.code}</code></pre>
        </div>
      `;
      html = html.replace(placeholder, blockHtml);
    });

    return html;
  },

  /**
   * Tải toàn bộ danh sách tư liệu từ máy chủ
   */
  async loadAssets() {
    try {
      const res = await API.get('/assets');
      if (res.success && Array.isArray(res.assets)) {
        this.assets = res.assets;
        this.updateAssetStats();
        this.updateAssetAccountDropdowns();
        this.updateScheduleAssetPicker();
        this.renderAssets();
      }
    } catch (err) {
      console.error('Lỗi nạp kho tư liệu:', err);
    }
  },

  /**
   * Cập nhật các chỉ số thống kê của kho tư liệu
   */
  updateAssetStats() {
    const total = this.assets.length;
    const mdCount = this.assets.filter(a => a.file_type === 'md').length;
    const txtCount = this.assets.filter(a => a.file_type === 'txt').length;
    const pngCount = this.assets.filter(a => ['png', 'jpg', 'jpeg', 'webp'].includes(a.file_type)).length;

    const elTotal = document.getElementById('stat-total-assets');
    const elMd = document.getElementById('stat-md-assets');
    const elTxt = document.getElementById('stat-txt-assets');
    const elPng = document.getElementById('stat-png-assets');
    const elBadge = document.getElementById('header-assets-badge');

    if (elTotal) elTotal.innerText = total;
    if (elMd) elMd.innerText = mdCount;
    if (elTxt) elTxt.innerText = txtCount;
    if (elPng) elPng.innerText = pngCount;
    if (elBadge) elBadge.innerText = total;

    const fAll = document.getElementById('count-filter-all');
    const fMd = document.getElementById('count-filter-md');
    const fTxt = document.getElementById('count-filter-txt');
    const fImg = document.getElementById('count-filter-images');

    if (fAll) fAll.innerText = total;
    if (fMd) fMd.innerText = mdCount;
    if (fTxt) fTxt.innerText = txtCount;
    if (fImg) fImg.innerText = pngCount;
  },

  /**
   * Cập nhật danh sách Kênh trong bộ lọc và form upload
   */
  updateAssetAccountDropdowns() {
    const filterSelect = document.getElementById('asset-account-filter-select');
    const modalSelect = document.getElementById('modal-asset-account');

    const optionsHtml = '<option value="">Tất cả các Kênh</option>' +
      this.accounts.map(a => `
        <option value="${a.id}">[${a.platform.toUpperCase()}] ${a.account_name || a.username}</option>
      `).join('');

    if (filterSelect) {
      const cur = filterSelect.value;
      filterSelect.innerHTML = optionsHtml;
      filterSelect.value = cur;
    }

    if (modalSelect) {
      modalSelect.innerHTML = '<option value="">-- Không gán vào kênh --</option>' +
        this.accounts.map(a => `
          <option value="${a.id}">[${a.platform.toUpperCase()}] ${a.account_name || a.username}</option>
        `).join('');
    }
  },

  /**
   * Cập nhật danh sách kịch bản sẵn trong form Lên lịch đăng
   */
  updateScheduleAssetPicker() {
    const picker = document.getElementById('sched-asset-picker');
    if (!picker) return;

    const textAssets = this.assets.filter(a => a.file_type === 'md' || a.file_type === 'txt');
    if (textAssets.length === 0) {
      picker.innerHTML = '<option value="">-- Kho chưa có kịch bản (.md/.txt) --</option>';
      return;
    }

    picker.innerHTML = '<option value="">-- Chọn file kịch bản có sẵn --</option>' +
      textAssets.map(a => `
        <option value="${a.id}">[${a.file_type.toUpperCase()}] ${a.title || a.original_name}</option>
      `).join('');
  },

  /**
   * Thiết lập bộ lọc định dạng (.md, .txt, .png, all)
   */
  setAssetFilter(filterType) {
    this.activeAssetFilter = filterType;
    document.querySelectorAll('.asset-filter-btn').forEach(btn => {
      if (btn.dataset.filter === filterType) {
        btn.classList.add('bg-cyan-600', 'text-white', 'active-asset-filter');
        btn.classList.remove('bg-slate-900', 'text-slate-300');
      } else {
        btn.classList.remove('bg-cyan-600', 'text-white', 'active-asset-filter');
        btn.classList.add('bg-slate-900', 'text-slate-300');
      }
    });
    this.renderAssets();
  },

  handleAssetSearch(val) {
    this.assetSearchQuery = (val || '').toLowerCase().trim();
    this.renderAssets();
  },

  handleAssetAccountFilter(val) {
    this.assetAccountFilter = val || '';
    this.renderAssets();
  },

  /**
   * Hiển thị lưới tư liệu ra giao diện
   */
  renderAssets() {
    const grid = document.getElementById('assets-grid');
    if (!grid) return;

    let list = [...this.assets];

    // Lọc theo loại file
    if (this.activeAssetFilter === 'md') {
      list = list.filter(a => a.file_type === 'md');
    } else if (this.activeAssetFilter === 'txt') {
      list = list.filter(a => a.file_type === 'txt');
    } else if (this.activeAssetFilter === 'images') {
      list = list.filter(a => ['png', 'jpg', 'jpeg', 'webp'].includes(a.file_type));
    }

    // Lọc theo kênh
    if (this.assetAccountFilter) {
      list = list.filter(a => a.associated_account_id === this.assetAccountFilter);
    }

    // Lọc theo từ khóa tìm kiếm
    if (this.assetSearchQuery) {
      list = list.filter(a => {
        const title = (a.title || '').toLowerCase();
        const fname = (a.original_name || '').toLowerCase();
        const tags = (a.tags || '').toLowerCase();
        const content = (a.content_text || '').toLowerCase();
        return title.includes(this.assetSearchQuery) ||
               fname.includes(this.assetSearchQuery) ||
               tags.includes(this.assetSearchQuery) ||
               content.includes(this.assetSearchQuery);
      });
    }

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full p-12 text-center glass-panel rounded-2xl flex flex-col items-center justify-center gap-3">
          <div class="w-16 h-16 rounded-full bg-slate-800/80 text-3xl flex items-center justify-center text-slate-500">📁</div>
          <div class="font-bold text-slate-300 text-sm">Chưa có file nào phù hợp với bộ lọc</div>
          <p class="text-xs text-slate-500 max-w-sm">Kéo thả file .md, .txt hoặc .png vào khung phía trên hoặc nhấp nút Tải File Lên để nạp kịch bản vào kho tư liệu</p>
          <button onclick="App.openUploadAssetModal()" class="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs mt-1">
            + Tải File Lên Ngay
          </button>
        </div>
      `;
      return;
    }

    grid.innerHTML = list.map(a => this.renderAssetCard(a)).join('');
  },

  /**
   * Tạo HTML thẻ cho từng tư liệu
   */
  renderAssetCard(a) {
    const isImage = ['png', 'jpg', 'jpeg', 'webp'].includes(a.file_type);
    const isMd = a.file_type === 'md';
    const isTxt = a.file_type === 'txt';

    const sizeKb = (a.file_size / 1024).toFixed(1) + ' KB';
    const words = a.content_text ? a.content_text.trim().split(/\s+/).filter(Boolean).length : 0;

    let typeBadge = '';
    if (isMd) {
      typeBadge = '<span class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold text-[10px] border border-purple-500/30">.MD MARKDOWN</span>';
    } else if (isTxt) {
      typeBadge = '<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[10px] border border-emerald-500/30">.TXT PROMPT</span>';
    } else {
      typeBadge = `<span class="px-2 py-0.5 rounded bg-pink-500/20 text-pink-300 font-mono font-bold text-[10px] border border-pink-500/30">.${a.file_type.toUpperCase()} IMAGE</span>`;
    }

    const channelBadge = a.account_name ? `
      <span class="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 text-[10px] border border-cyan-500/20 truncate max-w-[120px]">
        📺 ${a.account_name}
      </span>
    ` : '';

    if (isImage) {
      return `
        <div class="glass-panel rounded-2xl overflow-hidden border border-slate-800 hover:border-pink-500/40 transition-all flex flex-col group shadow-lg">
          <div class="relative h-44 bg-slate-950 overflow-hidden cursor-pointer" onclick="App.viewAsset('${a.id}')">
            <img src="/api/assets/${a.id}/raw" alt="${a.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy">
            <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80"></div>
            <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5">
              ${typeBadge}
            </div>
            <div class="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[11px] text-slate-300">
              <span class="font-mono text-xs font-bold text-white">${sizeKb}</span>
              ${channelBadge}
            </div>
          </div>

          <div class="p-3.5 flex flex-col gap-2.5 flex-1 justify-between bg-slate-900/60">
            <div>
              <h4 class="font-bold text-white text-xs truncate group-hover:text-pink-300 transition-colors" title="${a.title}">${a.title}</h4>
              <div class="text-[10px] text-slate-400 font-mono truncate mt-0.5">${a.original_name}</div>
            </div>

            <div class="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
              <div class="flex items-center gap-1.5">
                <button type="button" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-pink-300 font-semibold text-[11px] flex items-center gap-1" onclick="App.viewAsset('${a.id}')">
                  <span>🔍</span> <span>Xem Ảnh</span>
                </button>
                <button type="button" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]" title="Tải ảnh về máy" onclick="App.downloadAsset('${a.id}')">
                  📥
                </button>
              </div>

              <div class="flex items-center gap-1">
                <button type="button" class="px-2 py-1 rounded bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 text-[11px]" title="Gán vào lịch đăng video" onclick="App.promptAttachSchedule('${a.id}')">
                  🚀 Gán Lịch
                </button>
                <button type="button" class="p-1 rounded text-slate-500 hover:text-red-400" title="Xóa file" onclick="App.deleteAssetConfirm('${a.id}')">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    const snippet = a.content_text ? a.content_text.substring(0, 140).replace(/[\r\n]+/g, ' ') : '(File rỗng)';
    const cardBorder = isMd ? 'hover:border-purple-500/50' : 'hover:border-emerald-500/50';

    return `
      <div class="glass-panel p-4 rounded-2xl border border-slate-800 ${cardBorder} transition-all flex flex-col justify-between gap-3 group shadow-lg">
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              ${typeBadge}
              <span class="text-[10px] text-slate-400 font-mono">${sizeKb}</span>
            </div>
            ${channelBadge}
          </div>

          <h4 class="font-bold text-white text-xs truncate group-hover:text-cyan-300 transition-colors" title="${a.title}">
            ${a.title}
          </h4>
          <div class="text-[10px] text-slate-500 font-mono truncate -mt-1">${a.original_name}</div>

          <div class="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-300 font-mono line-clamp-3 leading-relaxed cursor-pointer" onclick="App.viewAsset('${a.id}')" title="Nhấp để mở đọc toàn bộ">
            ${snippet}
          </div>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
          <div class="flex items-center gap-1.5">
            <button type="button" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-[11px] flex items-center gap-1" onclick="App.viewAsset('${a.id}')">
              <span>📖</span> <span>Đọc & Sửa</span>
            </button>
            <button type="button" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]" title="Sao chép toàn bộ nội dung" onclick="App.copyAssetContent('${a.id}')">
              📋
            </button>
          </div>

          <div class="flex items-center gap-1">
            <button type="button" class="px-2 py-1 rounded bg-gradient-to-r from-fuchsia-600/30 to-pink-600/30 hover:from-fuchsia-600/50 hover:to-pink-600/50 text-pink-300 text-[11px] font-semibold border border-pink-500/30" title="Đẩy sang Lịch đăng video" onclick="App.pushAssetToSchedule('${a.id}')">
              🎬 Lên Lịch Up
            </button>
            <button type="button" class="p-1 rounded text-slate-500 hover:text-red-400" title="Xóa file" onclick="App.deleteAssetConfirm('${a.id}')">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `;
  },

  // ==================== UPLOAD HANDLERS ====================

  openUploadAssetModal() {
    this.updateAssetAccountDropdowns();
    document.getElementById('upload-asset-modal')?.classList.remove('hidden');
  },

  closeUploadAssetModal() {
    document.getElementById('upload-asset-modal')?.classList.add('hidden');
    this.selectedUploadFile = null;
    const form = document.getElementById('upload-asset-form');
    if (form) form.reset();
    const fnameEl = document.getElementById('modal-upload-filename');
    if (fnameEl) fnameEl.innerText = 'Nhấp vào đây để chọn file';
    const fsizeEl = document.getElementById('modal-upload-filesize');
    if (fsizeEl) fsizeEl.innerText = 'Dung lượng tối đa 50MB';
  },

  handleQuickFileSelect(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.processFileForUpload(files[0]);
    }
  },

  handleModalFileSelect(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.processFileForUpload(files[0], false);
    }
  },

  processFileForUpload(file, openModal = true) {
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    const validExts = ['md', 'txt', 'png', 'jpg', 'jpeg', 'webp'];
    if (!validExts.includes(ext)) {
      Toast.error(`Chỉ hỗ trợ file .md, .txt, .png, .jpg (Bạn vừa chọn .${ext})`);
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      Toast.error('Dung lượng file vượt quá giới hạn 50MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.selectedUploadFile = {
        file,
        originalName: file.name,
        base64Data: e.target.result,
        size: file.size,
        ext
      };

      const fnameEl = document.getElementById('modal-upload-filename');
      const fsizeEl = document.getElementById('modal-upload-filesize');
      const titleInput = document.getElementById('modal-asset-title');
      const iconEl = document.getElementById('modal-upload-icon');

      if (fnameEl) fnameEl.innerText = file.name;
      if (fsizeEl) fsizeEl.innerText = (file.size / 1024).toFixed(1) + ' KB';
      if (titleInput && (!titleInput.value || titleInput.value.trim() === '')) {
        titleInput.value = file.name.replace(/\.[^/.]+$/, '');
      }

      if (iconEl) {
        if (ext === 'md') iconEl.innerText = '📄';
        else if (ext === 'txt') iconEl.innerText = '📝';
        else iconEl.innerText = '🖼️';
      }

      if (openModal) {
        this.openUploadAssetModal();
      }
    };

    reader.readAsDataURL(file);
  },

  async submitUploadAsset() {
    if (!this.selectedUploadFile) {
      Toast.warning('Vui lòng chọn file tải lên!');
      return;
    }

    const title = document.getElementById('modal-asset-title')?.value;
    const associatedAccountId = document.getElementById('modal-asset-account')?.value;
    const tags = document.getElementById('modal-asset-tags')?.value;

    Toast.info(`Đang tải lên file [${this.selectedUploadFile.originalName}] vào kho...`);
    try {
      const res = await API.post('/assets/upload', {
        originalName: this.selectedUploadFile.originalName,
        base64Data: this.selectedUploadFile.base64Data,
        title,
        associatedAccountId,
        tags
      });

      if (res.success) {
        Toast.success(res.message);
        this.closeUploadAssetModal();
        await this.loadAssets();
      } else {
        Toast.error(res.message || 'Lỗi tải file');
      }
    } catch (err) {
      Toast.error(`Lỗi tải lên: ${err.message}`);
    }
  },

  // ==================== VIEWER & READER HANDLERS ====================

  async viewAsset(assetId) {
    const asset = this.assets.find(a => a.id === assetId);
    if (!asset) {
      Toast.error('Không tìm thấy tư liệu!');
      return;
    }

    this.currentViewingAsset = asset;
    const modal = document.getElementById('asset-viewer-modal');
    if (!modal) return;

    const tIcon = document.getElementById('viewer-type-icon');
    const tTitle = document.getElementById('viewer-title');
    const tFname = document.getElementById('viewer-filename');
    const tSize = document.getElementById('viewer-size');
    const tExtra = document.getElementById('viewer-meta-extra');

    const isImage = ['png', 'jpg', 'jpeg', 'webp'].includes(asset.file_type);
    const isMd = asset.file_type === 'md';
    const isTxt = asset.file_type === 'txt';

    if (tTitle) tTitle.innerText = asset.title;
    if (tFname) tFname.innerText = asset.original_name;
    if (tSize) tSize.innerText = (asset.file_size / 1024).toFixed(1) + ' KB';

    if (tIcon) {
      if (isMd) tIcon.innerText = '📄';
      else if (isTxt) tIcon.innerText = '📝';
      else tIcon.innerText = '🖼️';
    }

    const words = asset.content_text ? asset.content_text.trim().split(/\s+/).filter(Boolean).length : 0;
    const chars = asset.content_text ? asset.content_text.length : 0;

    if (tExtra) {
      if (isImage) {
        tExtra.innerText = 'Định dạng Ảnh';
      } else {
        tExtra.innerText = `${words} từ | ${chars} ký tự`;
      }
    }

    const textTabs = document.getElementById('viewer-text-tabs');
    const renderedBody = document.getElementById('viewer-rendered-body');
    const editorContainer = document.getElementById('viewer-editor-container');
    const editorTextarea = document.getElementById('viewer-editor-textarea');
    const imageContainer = document.getElementById('viewer-image-container');
    const imagePreview = document.getElementById('viewer-image-preview');
    const saveBtn = document.getElementById('btn-save-edited-content');
    const wordCounter = document.getElementById('viewer-word-counter');

    if (isImage) {
      if (textTabs) textTabs.classList.add('hidden');
      if (renderedBody) renderedBody.classList.add('hidden');
      if (editorContainer) editorContainer.classList.add('hidden');
      if (saveBtn) saveBtn.classList.add('hidden');
      if (imageContainer) imageContainer.classList.remove('hidden');
      if (imagePreview) imagePreview.src = `/api/assets/${asset.id}/raw`;
    } else {
      if (textTabs) textTabs.classList.remove('hidden');
      if (imageContainer) imageContainer.classList.add('hidden');

      if (editorTextarea) {
        editorTextarea.value = asset.content_text || '';
        editorTextarea.oninput = () => {
          const cur = editorTextarea.value;
          const w = cur.trim().split(/\s+/).filter(Boolean).length;
          if (wordCounter) wordCounter.innerText = `${w} từ | ${cur.length} ký tự`;
        };
      }

      if (wordCounter) wordCounter.innerText = `${words} từ | ${chars} ký tự`;

      const lblRendered = document.getElementById('lbl-rendered-mode');
      if (lblRendered) {
        lblRendered.innerText = isMd ? 'Đọc Kịch Bản (Markdown)' : 'Xem Toàn Bộ Ghi Chú';
      }

      this.switchViewerMode('rendered');
    }

    modal.classList.remove('hidden');
  },

  closeAssetViewer() {
    document.getElementById('asset-viewer-modal')?.classList.add('hidden');
    this.currentViewingAsset = null;
  },

  switchViewerMode(mode) {
    const btnRendered = document.getElementById('btn-view-rendered');
    const btnEdit = document.getElementById('btn-view-edit');
    const renderedBody = document.getElementById('viewer-rendered-body');
    const editorContainer = document.getElementById('viewer-editor-container');
    const editorTextarea = document.getElementById('viewer-editor-textarea');
    const saveBtn = document.getElementById('btn-save-edited-content');

    if (mode === 'rendered') {
      if (btnRendered) {
        btnRendered.classList.add('bg-cyan-600', 'text-white');
        btnRendered.classList.remove('text-slate-400');
      }
      if (btnEdit) {
        btnEdit.classList.remove('bg-cyan-600', 'text-white');
        btnEdit.classList.add('text-slate-400');
      }

      if (renderedBody) {
        renderedBody.classList.remove('hidden');
        const text = editorTextarea?.value || this.currentViewingAsset?.content_text || '';
        if (this.currentViewingAsset?.file_type === 'md') {
          renderedBody.innerHTML = this.renderMarkdown(text);
        } else {
          renderedBody.innerHTML = `<pre class="font-mono text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
        }
      }

      if (editorContainer) editorContainer.classList.add('hidden');
      if (saveBtn) saveBtn.classList.add('hidden');
    } else {
      if (btnEdit) {
        btnEdit.classList.add('bg-cyan-600', 'text-white');
        btnEdit.classList.remove('text-slate-400');
      }
      if (btnRendered) {
        btnRendered.classList.remove('bg-cyan-600', 'text-white');
        btnRendered.classList.add('text-slate-400');
      }

      if (renderedBody) renderedBody.classList.add('hidden');
      if (editorContainer) editorContainer.classList.remove('hidden');
      if (saveBtn) saveBtn.classList.remove('hidden');
      if (editorTextarea) editorTextarea.focus();
    }
  },

  async saveCurrentViewerEdits() {
    if (!this.currentViewingAsset) return;
    const contentText = document.getElementById('viewer-editor-textarea')?.value;

    Toast.info('Đang lưu thay đổi vào file...');
    try {
      const res = await API.put(`/assets/${this.currentViewingAsset.id}`, { contentText });
      if (res.success && res.asset) {
        Toast.success('Đã lưu nội dung kịch bản mới thành công!');
        this.currentViewingAsset = res.asset;
        const idx = this.assets.findIndex(a => a.id === res.asset.id);
        if (idx !== -1) this.assets[idx] = res.asset;

        this.switchViewerMode('rendered');
        this.renderAssets();
      }
    } catch (err) {
      Toast.error(`Lỗi lưu file: ${err.message}`);
    }
  },

  async copyCurrentViewerContent() {
    if (!this.currentViewingAsset) return;
    const a = this.currentViewingAsset;
    const isImage = ['png', 'jpg', 'jpeg', 'webp'].includes(a.file_type);

    if (isImage) {
      const fullUrl = window.location.origin + `/api/assets/${a.id}/raw`;
      await navigator.clipboard.writeText(fullUrl);
      Toast.success('Đã sao chép đường dẫn hình ảnh!');
    } else {
      const content = document.getElementById('viewer-editor-textarea')?.value || a.content_text || '';
      await navigator.clipboard.writeText(content);
      Toast.success('Đã sao chép toàn bộ nội dung kịch bản!');
    }
  },

  async copyAssetContent(assetId) {
    const a = this.assets.find(x => x.id === assetId);
    if (!a) return;
    const isImage = ['png', 'jpg', 'jpeg', 'webp'].includes(a.file_type);

    if (isImage) {
      const fullUrl = window.location.origin + `/api/assets/${a.id}/raw`;
      await navigator.clipboard.writeText(fullUrl);
      Toast.success('Đã sao chép link ảnh vào bộ nhớ tạm!');
    } else {
      await navigator.clipboard.writeText(a.content_text || '');
      Toast.success(`Đã sao chép kịch bản [${a.title}]!`);
    }
  },

  downloadCurrentViewerFile() {
    if (!this.currentViewingAsset) return;
    this.downloadAsset(this.currentViewingAsset.id);
  },

  downloadAsset(assetId) {
    const a = this.assets.find(x => x.id === assetId);
    if (!a) return;
    const link = document.createElement('a');
    link.href = `/api/assets/${assetId}/raw?download=1`;
    link.download = a.original_name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    Toast.success(`Đang tải file [${a.original_name}] về máy...`);
  },

  pushCurrentViewerToSchedule() {
    if (!this.currentViewingAsset) return;
    this.pushAssetToSchedule(this.currentViewingAsset.id);
    this.closeAssetViewer();
  },

  pushAssetToSchedule(assetId) {
    const a = this.assets.find(x => x.id === assetId);
    if (!a) return;

    const schedBtn = document.querySelector('[data-tab="tab-schedules"]');
    if (schedBtn) schedBtn.click();

    this.openAddScheduleModal();

    const titleInput = document.getElementById('sched-title');
    const captionInput = document.getElementById('sched-caption');
    const picker = document.getElementById('sched-asset-picker');
    const accSelect = document.getElementById('sched-account-id');

    if (titleInput) titleInput.value = a.title;
    if (captionInput && a.content_text) {
      captionInput.value = a.content_text;
    }
    if (picker) picker.value = a.id;
    if (accSelect && a.associated_account_id) {
      accSelect.value = a.associated_account_id;
    }

    Toast.success(`Đã đẩy kịch bản [${a.title}] vào lịch đăng video!`);
  },

  handlePickAssetForSchedule(assetId) {
    if (!assetId) return;
    const a = this.assets.find(x => x.id === assetId);
    if (!a) return;

    const titleInput = document.getElementById('sched-title');
    const captionInput = document.getElementById('sched-caption');

    if (titleInput && (!titleInput.value || titleInput.value.trim() === '')) {
      titleInput.value = a.title;
    }
    if (captionInput && a.content_text) {
      captionInput.value = a.content_text;
    }

    Toast.info(`Đã áp dụng nội dung từ file [${a.original_name}]!`);
  },

  promptAttachSchedule(assetId) {
    this.pushAssetToSchedule(assetId);
  },

  async deleteAssetConfirm(assetId) {
    const a = this.assets.find(x => x.id === assetId);
    const name = a ? a.title : 'file này';
    if (!confirm(`Đại Ca có chắc chắn muốn xóa vĩnh viễn [${name}] khỏi kho tư liệu?`)) return;

    try {
      const res = await API.delete(`/assets/${assetId}`);
      if (res.success) {
        Toast.success(res.message);
        await this.loadAssets();
      }
    } catch (err) {
      Toast.error(`Lỗi xóa: ${err.message}`);
    }
  },

  // ==================== SAO LƯU DATABASE & TELEGRAM SNAPSHOT ====================
  async openBackupModal() {
    const modal = document.getElementById('backup-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const progressBox = document.getElementById('backup-progress-box');
    if (progressBox) progressBox.classList.add('hidden');

    const statusEl = document.getElementById('backup-modal-tg-status');
    if (statusEl) {
      statusEl.textContent = 'Đang kiểm tra...';
      statusEl.className = 'font-bold text-amber-400 font-mono';
    }

    try {
      const [tgRes, statsRes] = await Promise.all([
        API.get('/tools/telegram'),
        API.get('/tools/backup/stats')
      ]);

      if (tgRes && tgRes.success) {
        const tokenInput = document.getElementById('backup-tg-token');
        const chatInput = document.getElementById('backup-tg-chat-id');
        if (tokenInput && tgRes.botToken) tokenInput.value = tgRes.botToken;
        if (chatInput && tgRes.chatId) chatInput.value = tgRes.chatId;

        if (statusEl) {
          if (tgRes.hasToken && tgRes.chatId) {
            statusEl.textContent = '🟢 Sẵn Sàng Bắn File';
            statusEl.className = 'font-bold text-emerald-400 font-mono';
          } else {
            statusEl.textContent = '🟡 Chưa Cấu Hình Token/Chat ID';
            statusEl.className = 'font-bold text-amber-400 font-mono';
          }
        }
      }

      if (statsRes && statsRes.success && statsRes.stats) {
        const s = statsRes.stats;
        const accEl = document.getElementById('backup-stat-acc');
        const proxyEl = document.getElementById('backup-stat-proxy');
        const schedEl = document.getElementById('backup-stat-sched');
        if (accEl) accEl.textContent = `${s.accounts} acc`;
        if (proxyEl) proxyEl.textContent = `${s.proxies} proxy`;
        if (schedEl) schedEl.textContent = `${s.schedules} lịch`;
      }
    } catch (err) {
      console.error('Lỗi nạp thông tin backup:', err);
    }
  },

  closeBackupModal() {
    const modal = document.getElementById('backup-modal');
    if (modal) modal.classList.add('hidden');
  },

  async triggerTelegramBackup(customToken = null, customChatId = null) {
    const progressBox = document.getElementById('backup-progress-box');
    const submitBtn = document.getElementById('btn-submit-backup');

    if (progressBox) {
      progressBox.classList.remove('hidden');
      const msgEl = document.getElementById('backup-progress-msg');
      if (msgEl) msgEl.textContent = 'Đang trích xuất snapshot SQLite và đẩy file về Telegram...';
    }
    if (submitBtn) submitBtn.disabled = true;

    Toast.info('Đang chuẩn bị gói dữ liệu snapshot kho quân lương...');

    try {
      const res = await API.post('/tools/backup/telegram', {
        botToken: customToken,
        chatId: customChatId
      });

      if (res.notConfigured) {
        Toast.error(res.message);
        this.openBackupModal();
        return;
      }

      if (res.success) {
        Toast.success(res.message || 'Đã gửi file backup về Telegram thành công!');
        if (progressBox) {
          const msgEl = document.getElementById('backup-progress-msg');
          if (msgEl) msgEl.textContent = `✓ Đã gửi thành công: ${res.backupInfo?.filename} (${res.backupInfo?.sizeFormatted})`;
        }
        setTimeout(() => {
          this.closeBackupModal();
        }, 1500);
      } else {
        Toast.error(`Lỗi sao lưu: ${res.message || res.error}`);
        if (progressBox) {
          const msgEl = document.getElementById('backup-progress-msg');
          if (msgEl) msgEl.textContent = `Lỗi: ${res.message || res.error}`;
        }
      }
    } catch (err) {
      Toast.error(`Lỗi kết nối sao lưu: ${err.message}`);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  },

  downloadBackupDirect() {
    Toast.info('Đang chuẩn bị file snapshot SQLite để tải về máy...');
    window.location.href = '/api/tools/backup/download';
  },

  // ==================== KHO TRI THỨC NHÓM & 360+ SIÊU REPOS ====================
  async loadKnowledgeSummary() {
    try {
      const res = await API.get('/knowledge/summary');
      if (!res || !res.success) return;

      const reposEl = document.getElementById('kn-stat-repos');
      const starsEl = document.getElementById('kn-stat-stars');
      const hubEl = document.getElementById('kn-stat-hub');
      const contribEl = document.getElementById('kn-stat-contributors');

      if (reposEl) reposEl.textContent = `${res.stats.totalRepos}+`;
      if (starsEl) starsEl.textContent = `${(res.stats.totalStars / 1000000).toFixed(1)}M+`;
      if (hubEl) hubEl.textContent = `${res.stats.totalHubItems}+`;
      if (contribEl) contribEl.textContent = `${res.stats.totalContributors}`;

      // Render 4 Trụ Cột Công Nghệ Bento Cards
      const pillarsContainer = document.getElementById('kn-pillars-container');
      if (pillarsContainer && res.pillars) {
        pillarsContainer.innerHTML = res.pillars.map(p => `
          <div class="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-violet-500/40 flex flex-col justify-between transition-colors">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xl">${p.icon}</span>
                <span class="text-[9px] font-mono px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 font-bold">${p.badge}</span>
              </div>
              <h4 class="font-bold text-white text-xs mb-1">${p.title}</h4>
              <p class="text-[11px] text-slate-400 line-clamp-3 mb-2">${p.description}</p>
            </div>
            <div class="pt-2 border-t border-slate-800/80">
              <div class="text-[10px] text-violet-300 font-semibold truncate">🎯 ${p.keyTools.join(' • ')}</div>
            </div>
          </div>
        `).join('');
      }

      // Render Category Filter Chips for Repos
      const chipsContainer = document.getElementById('kn-category-chips');
      if (chipsContainer && res.categories) {
        const allCats = [{ category: 'Tất Cả', count: res.stats.totalRepos }, ...res.categories];
        chipsContainer.innerHTML = allCats.map(c => `
          <button onclick="App.selectKnowledgeCategory('${c.category}')" class="px-2.5 py-1 rounded-lg text-xs font-semibold ${this.knowledgeCategory === c.category || (this.knowledgeCategory === 'all' && c.category === 'Tất Cả') ? 'bg-violet-600 text-white font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}">
            ${c.category} <span class="text-[10px] opacity-75 font-mono">(${c.count})</span>
          </button>
        `).join('');
      }
    } catch (err) {
      console.error('Lỗi nạp tóm tắt tri thức:', err);
    }
  },

  async loadKnowledgeItems() {
    const grid = document.getElementById('kn-items-grid');
    if (!grid) return;

    grid.innerHTML = `
      <div class="col-span-full py-16 text-center text-slate-500">
        <div class="animate-pulse">Đang nạp dữ liệu từ kho tri thức nhóm...</div>
      </div>
    `;

    try {
      if (this.knowledgeSubTab === 'repos') {
        const cat = this.knowledgeCategory === 'Tất Cả' ? 'all' : this.knowledgeCategory;
        const res = await API.get(`/knowledge/repos?category=${encodeURIComponent(cat)}&search=${encodeURIComponent(this.knowledgeSearch)}&page=${this.knowledgePage}&limit=24`);
        if (!res.success) throw new Error(res.message);

        this.knowledgeTotalPages = res.totalPages || 1;
        this.updateKnowledgePagination(res.page, res.totalPages, res.total, 'repositories');

        if (!res.repos || res.repos.length === 0) {
          grid.innerHTML = `
            <div class="col-span-full py-12 text-center text-slate-500">
              Không tìm thấy repository nào khớp với bộ lọc "${this.knowledgeSearch}".
            </div>
          `;
          return;
        }

        grid.innerHTML = res.repos.map(r => `
          <div class="glass-panel p-4 rounded-xl flex flex-col justify-between gap-3 border-slate-800 hover:border-violet-500/40 transition-colors">
            <div>
              <div class="flex items-center justify-between gap-2 mb-2">
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-bold truncate max-w-[140px]">
                  ${r.category || 'Tool'}
                </span>
                <span class="flex items-center gap-1 text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  ⭐ ${(r.stars || 0).toLocaleString()}
                </span>
              </div>

              <h4 class="font-bold text-white text-xs mb-1 flex items-center gap-1.5 truncate">
                <span>📦</span>
                <a href="${r.repo_url}" target="_blank" class="hover:text-violet-300 hover:underline truncate" title="${r.full_name}">
                  ${r.full_name}
                </a>
              </h4>

              <p class="text-xs text-slate-300 line-clamp-2 mt-1 mb-2">
                ${r.summary_vi || r.description || 'Không có mô tả chi tiết'}
              </p>

              ${r.target_audience ? `
                <div class="text-[10px] text-slate-400 bg-slate-950/60 p-1.5 rounded border border-slate-800/80 mb-2 truncate">
                  🎯 <b>Phù hợp:</b> ${r.target_audience}
                </div>
              ` : ''}
            </div>

            <div class="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
              <span class="text-[11px] font-mono text-cyan-400">${r.language || 'Code'}</span>
              <div class="flex items-center gap-1.5">
                <button onclick="Security.safeCopy('${r.repo_url}', 'Link Repository')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]" title="Chép link GitHub">
                  📋 Link
                </button>
                <a href="${r.repo_url}" target="_blank" class="px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm">
                  <span>Mở Git</span>
                  <span>↗</span>
                </a>
              </div>
            </div>
          </div>
        `).join('');

      } else {
        // Sub-tab Hub Items
        const res = await API.get(`/knowledge/hub?search=${encodeURIComponent(this.knowledgeSearch)}&page=${this.knowledgePage}&limit=18`);
        if (!res.success) throw new Error(res.message);

        this.knowledgeTotalPages = res.totalPages || 1;
        this.updateKnowledgePagination(res.page, res.totalPages, res.total, 'bài chia sẻ & file AI');

        if (!res.items || res.items.length === 0) {
          grid.innerHTML = `
            <div class="col-span-full py-12 text-center text-slate-500">
              Không tìm thấy tài nguyên nào khớp với bộ lọc.
            </div>
          `;
          return;
        }

        grid.innerHTML = res.items.map(h => `
          <div class="glass-panel p-4 rounded-xl flex flex-col justify-between gap-3 border-slate-800 hover:border-cyan-500/40 transition-colors">
            <div>
              <div class="flex items-center justify-between gap-2 mb-2">
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-bold truncate">
                  ${h.categoryLabel || h.category || 'AI Resource'}
                </span>
                <span class="text-[11px] text-slate-500 font-mono">${h.date || ''}</span>
              </div>

              <h4 class="font-bold text-white text-xs mb-1.5 line-clamp-2" title="${h.title}">
                ${h.title}
              </h4>

              <p class="text-[11px] text-slate-400 line-clamp-2 mb-2">
                ${h.summary || ''}
              </p>

              ${h.keyPoints && h.keyPoints.length > 0 ? `
                <div class="space-y-1 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 mb-2">
                  ${h.keyPoints.slice(0, 3).map(k => `
                    <div class="text-[10px] text-slate-300 flex items-start gap-1">
                      <span class="text-violet-400">•</span>
                      <span class="line-clamp-1">${k}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>

            <div class="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
              <span class="text-[11px] text-slate-400">👤 ${h.author || 'Thành viên'}</span>
              <div class="flex items-center gap-1.5">
                ${h.links && h.links.length > 0 ? `
                  <a href="${h.links[0].url}" target="_blank" class="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm">
                    <span>Mở Link (${h.links.length})</span>
                    <span>↗</span>
                  </a>
                ` : `
                  <span class="text-[10px] text-slate-500 italic">Nội dung text</span>
                `}
              </div>
            </div>
          </div>
        `).join('');
      }
    } catch (err) {
      grid.innerHTML = `
        <div class="col-span-full py-12 text-center text-rose-400">
          Lỗi nạp dữ liệu: ${err.message}
        </div>
      `;
    }
  },

  updateKnowledgePagination(page, totalPages, total, unit) {
    const infoEl = document.getElementById('kn-page-info');
    const currEl = document.getElementById('kn-current-page');
    const prevBtn = document.getElementById('btn-kn-prev');
    const nextBtn = document.getElementById('btn-kn-next');

    if (infoEl) infoEl.textContent = `Tổng ${total} ${unit} (Trang ${page}/${totalPages})`;
    if (currEl) currEl.textContent = `${page}`;
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
  },

  switchKnowledgeSubTab(type) {
    this.knowledgeSubTab = type;
    this.knowledgePage = 1;

    const btnRepos = document.getElementById('btn-kn-subtab-repos');
    const btnHub = document.getElementById('btn-kn-subtab-hub');
    const chipsContainer = document.getElementById('kn-category-chips');

    if (type === 'repos') {
      btnRepos.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 text-white shadow-md shadow-violet-500/20 transition-all flex items-center gap-1.5';
      btnHub.className = 'px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white transition-all flex items-center gap-1.5';
      if (chipsContainer) chipsContainer.classList.remove('hidden');
    } else {
      btnHub.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 text-white shadow-md shadow-cyan-500/20 transition-all flex items-center gap-1.5';
      btnRepos.className = 'px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white transition-all flex items-center gap-1.5';
      if (chipsContainer) chipsContainer.classList.add('hidden');
    }

    this.loadKnowledgeItems();
  },

  selectKnowledgeCategory(cat) {
    this.knowledgeCategory = cat;
    this.knowledgePage = 1;
    this.loadKnowledgeSummary();
    this.loadKnowledgeItems();
  },

  handleKnowledgeSearch(e) {
    this.knowledgeSearch = e.target.value;
    this.knowledgePage = 1;
    clearTimeout(this._knSearchDebounce);
    this._knSearchDebounce = setTimeout(() => {
      this.loadKnowledgeItems();
    }, 300);
  },

  changeKnowledgePage(delta) {
    const newPage = this.knowledgePage + delta;
    if (newPage >= 1 && newPage <= this.knowledgeTotalPages) {
      this.knowledgePage = newPage;
      this.loadKnowledgeItems();
      const grid = document.getElementById('kn-items-grid');
      if (grid) grid.scrollIntoView({ behavior: 'smooth' });
    }
  },

  async syncKnowledge() {
    const btn = document.getElementById('btn-sync-knowledge');
    const spinner = document.getElementById('sync-knowledge-spinner');
    if (spinner) spinner.classList.add('animate-spin');
    if (btn) btn.disabled = true;

    Toast.info('Đang kết nối tới máy chủ tri thức nhóm để kéo dữ liệu mới nhất...');

    try {
      const res = await API.post('/knowledge/sync', {});
      if (res.success) {
        Toast.success(res.message);
        await this.loadKnowledgeSummary();
        await this.loadKnowledgeItems();
      } else {
        Toast.error(res.message);
      }
    } catch (err) {
      Toast.error(`Lỗi đồng bộ: ${err.message}`);
    } finally {
      if (spinner) spinner.classList.remove('animate-spin');
      if (btn) btn.disabled = false;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

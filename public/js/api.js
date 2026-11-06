// API Client & Toast Notification Center
const API = {
  baseUrl: '/api',

  async request(endpoint, options = {}) {
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        // Hết phiên làm việc hoặc chưa đăng nhập
        window.dispatchEvent(new CustomEvent('auth:required'));
        throw new Error(data.message || 'Vui lòng đăng nhập lại');
      }

      if (!response.ok) {
        throw new Error(data.message || `Lỗi HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body });
  },

  put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body });
  },

  patch(endpoint, body) {
    return this.request(endpoint, { method: 'PATCH', body });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
};

// Hệ thống Toast thông báo thời gian thực
const Toast = {
  show(message, type = 'info', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgColors = {
      success: 'bg-emerald-900/90 border-emerald-500 text-emerald-200',
      error: 'bg-rose-900/90 border-rose-500 text-rose-200',
      warning: 'bg-amber-900/90 border-amber-500 text-amber-200',
      info: 'bg-cyan-900/90 border-cyan-500 text-cyan-200'
    };

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    toast.className = `toast flex items-center gap-3 px-4 py-3 rounded-lg border shadow-xl backdrop-blur-md text-sm font-medium ${bgColors[type] || bgColors.info}`;
    toast.innerHTML = `
      <span class="text-base font-bold">${icons[type] || '•'}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  success(msg, duration) { this.show(msg, 'success', duration); },
  error(msg, duration) { this.show(msg, 'error', duration); },
  warning(msg, duration) { this.show(msg, 'warning', duration); },
  info(msg, duration) { this.show(msg, 'info', duration); }
};

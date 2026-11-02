// Giao Diện Bảo Mật Cấp Cao & Tẩy Rửa Dấu Vết (Security Engine)
const Security = {
  wipeTimeout: null,
  wipeInterval: null,

  /**
   * Sao chép an toàn kèm cơ chế tự động xóa Clipboard sau 15 giây
   * @param {string} text - Chuỗi cần chép
   * @param {string} label - Tên dữ liệu ('Mật khẩu', 'Mã 2FA')
   * @param {number} [wipeSeconds=15]
   */
  async safeCopy(text, label = 'Dữ liệu', wipeSeconds = 15) {
    if (!text || text === '------' || text === 'ERR-2FA') {
      Toast.warning('Không có dữ liệu hợp lệ để sao chép');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      this.startClipboardWiper(label, wipeSeconds);
    } catch (err) {
      // Fallback cho trình duyệt chặn async clipboard
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        this.startClipboardWiper(label, wipeSeconds);
      } catch (e) {
        Toast.error('Không thể truy cập Clipboard trên thiết bị này');
      }
      textArea.remove();
    }
  },

  /**
   * Bộ đếm ngược tẩy rửa Clipboard
   */
  startClipboardWiper(label, totalSeconds) {
    if (this.wipeTimeout) clearTimeout(this.wipeTimeout);
    if (this.wipeInterval) clearInterval(this.wipeInterval);

    let remaining = totalSeconds;
    Toast.success(`Đã sao chép ${label}! (Tự xóa Clipboard sau ${remaining}s)`);

    this.wipeTimeout = setTimeout(async () => {
      try {
        await navigator.clipboard.writeText('');
        Toast.info(`🧹 [Bảo mật] Clipboard đã được xóa sạch tự động để tránh lộ lọt!`);
      } catch (e) {}
    }, totalSeconds * 1000);
  },

  /**
   * Lấy mật khẩu gốc từ API và sao chép an toàn
   */
  async copyAccountPassword(accountId, accountName) {
    try {
      Toast.info(`Đang giải mã mật khẩu cho [${accountName}]...`);
      const res = await API.get(`/accounts/${accountId}/reveal`);
      if (res.success && res.password) {
        await this.safeCopy(res.password, `Mật khẩu [${accountName}]`, 15);
      } else {
        Toast.warning('Tài khoản này chưa lưu mật khẩu');
      }
    } catch (err) {
      Toast.error(err.message || 'Không thể lấy mật khẩu. Bạn có thể chưa được cấp quyền!');
    }
  }
};

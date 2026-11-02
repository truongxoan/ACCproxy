@echo off
chcp 65001 >nul
title AccProxy Sovereign Server
echo ====================================================================
echo  🚀 KHỞI ĐỘNG HỆ THỐNG ACCPROXY SOVEREIGN (MULTI-USER WEB APP)
echo  🔒 Đa Người Dùng • Phân Quyền Admin/User • Proxy • 2FA Realtime
echo ====================================================================

if not exist node_modules (
  echo [!] Chưa tìm thấy thư viện, đang tự động cài đặt...
  call npm.cmd install
  call npx.cmd playwright install chromium
)

echo.
echo [*] Khởi chạy máy chủ tại http://localhost:3000
echo [*] Để cho 2, 4, 6 người dùng chung: Hãy chia sẻ địa chỉ IP máy tính này!
echo.
node src/server.js
pause

@echo off
echo ============================================
echo   MIMO TODO - 启动服务
echo ============================================
echo.
echo 服务启动后，本机访问: http://localhost:3000
echo 局域网访问: http://172.22.164.119:3000
echo.
echo 按 Ctrl+C 停止服务
echo ============================================
echo.
cd /d "%~dp0"
node server.js
pause

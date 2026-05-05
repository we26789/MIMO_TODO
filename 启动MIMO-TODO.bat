@echo off
chcp 65001 >nul
title MIMO TODO 智能日程管理系统

:: 获取当前目录
set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo ========================================
echo   MIMO TODO 智能日程管理系统
echo ========================================
echo.

:: 检查MySQL是否在运行
tasklist /fi "imagename eq mysqld.exe" 2>nul | find /i "mysqld.exe" >nul
if errorlevel 1 (
    echo [提示] MySQL未运行，正在尝试启动...
    :: 尝试启动MySQL服务
    net start mysql 2>nul
    if errorlevel 1 (
        echo [警告] 无法自动启动MySQL，请确保MySQL已安装并运行
        echo.
        pause
    )
)

:: 检查Node.js是否安装
where node >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到Node.js，请先安装Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 检查node_modules是否存在
if not exist "%ROOT_DIR%node_modules" (
    echo [提示] 首次运行，正在安装依赖...
    npm install
    echo.
)

:: 启动服务器
echo [启动] 正在启动服务器...
start /b node server.js

:: 等待服务器启动
echo [等待] 等待服务器就绪...
timeout /t 2 /nobreak >nul

:: 打开浏览器
echo [完成] 正在打开浏览器...
start http://localhost:3000

echo.
echo ========================================
echo   MIMO TODO 已启动！
echo   浏览器应该会自动打开
echo   如果没有，请手动访问: http://localhost:3000
echo ========================================
echo.
echo   按 Ctrl+C 可停止服务器
echo   或者关闭此窗口
echo ========================================
echo.

:: 保持窗口打开，显示服务器日志
node server.js
pause

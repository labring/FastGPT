@echo off
setlocal enabledelayedexpansion

echo ========================================
echo  FastGPT 认证监管系统 - 快速部署
echo ========================================
echo.

:: 检查 Node.js
echo [1/6] 检查 Node.js 环境...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 未检测到 Node.js，请先安装 Node.js 14.0+ 
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js 环境正常

:: 检查 FastGPT 服务
echo.
echo [2/6] 检查 FastGPT 服务...
curl -s --connect-timeout 5 http://localhost:3000 >nul 2>&1
if errorlevel 1 (
    echo ❌ FastGPT 未运行在端口3000，请先启动 FastGPT
    echo 提示: 确保 FastGPT 在 http://localhost:3000 可访问
    pause
    exit /b 1
)
echo ✅ FastGPT 服务正常运行

:: 安装依赖
echo.
echo [3/6] 安装系统依赖...
npm install express cors >nul 2>&1
if errorlevel 1 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)
echo ✅ 依赖安装完成

:: 启动用户管理系统
echo.
echo [4/6] 启动用户管理系统...
cd /d "%~dp0核心组件"
start "FastGPT用户管理系统" cmd /k "echo 🚀 用户管理系统启动中... && node simple-server.js"

:: 等待服务启动
echo 等待用户管理系统启动...
timeout /t 5 /nobreak >nul

:: 检查用户管理系统
echo 检查用户管理系统状态...
curl -s --connect-timeout 3 http://localhost:3002 >nul 2>&1
if errorlevel 1 (
    echo ⚠️  用户管理系统可能未完全启动，继续部署...
) else (
    echo ✅ 用户管理系统启动成功
)

:: 启动认证代理服务器
echo.
echo [5/6] 启动认证代理服务器...
start "FastGPT认证代理" cmd /k "echo 🔐 认证代理启动中... && node fixed-proxy.js"

:: 等待代理服务启动
echo 等待认证代理服务器启动...
timeout /t 5 /nobreak >nul

:: 最终检查
echo.
echo [6/6] 系统状态检查...
curl -s --connect-timeout 3 http://localhost:3001 >nul 2>&1
if errorlevel 1 (
    echo ⚠️  认证代理可能未完全启动
) else (
    echo ✅ 认证代理启动成功
)

echo.
echo ========================================
echo          🎉 部署完成！
echo ========================================
echo.
echo 📍 系统地址:
echo    认证代理服务器: http://localhost:3001
echo    用户管理系统:   http://localhost:3002
echo    原始FastGPT:    http://localhost:3000
echo.
echo 📋 测试页面:
echo    系统测试:       %~dp0测试页面\认证代理.html
echo    管理后台:       http://localhost:3002/admin.html
echo.
echo 🔑 默认账户:
echo    用户名: admin
echo    密码:   123456
echo.
echo ⚡ 现在您可以：
echo 1. 将分享链接的端口从 3000 改为 3001
echo 2. 打开测试页面验证系统功能
echo 3. 访问管理后台查看用户数据
echo.
echo 📖 详细说明请查看: 使用说明.md
echo ========================================

pause

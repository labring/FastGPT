#!/bin/bash

echo "========================================"
echo "  FastGPT 认证监管系统 - 快速部署"
echo "========================================"
echo ""

# 检查 Node.js
echo "[1/6] 检查 Node.js 环境..."
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到 Node.js，请先安装 Node.js 14.0+"
    echo "安装指南: https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js 环境正常"

# 检查 FastGPT 服务
echo ""
echo "[2/6] 检查 FastGPT 服务..."
if ! curl -s --connect-timeout 5 http://localhost:3000 > /dev/null; then
    echo "❌ FastGPT 未运行在端口3000，请先启动 FastGPT"
    echo "提示: 确保 FastGPT 在 http://localhost:3000 可访问"
    exit 1
fi
echo "✅ FastGPT 服务正常运行"

# 安装依赖
echo ""
echo "[3/6] 安装系统依赖..."
if ! npm install express cors > /dev/null 2>&1; then
    echo "❌ 依赖安装失败"
    exit 1
fi
echo "✅ 依赖安装完成"

# 进入核心组件目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/核心组件"

# 启动用户管理系统
echo ""
echo "[4/6] 启动用户管理系统..."
nohup node simple-server.js > ../logs/user-system.log 2>&1 &
USER_SYSTEM_PID=$!

# 等待服务启动
echo "等待用户管理系统启动..."
sleep 5

# 检查用户管理系统
echo "检查用户管理系统状态..."
if curl -s --connect-timeout 3 http://localhost:3002 > /dev/null; then
    echo "✅ 用户管理系统启动成功 (PID: $USER_SYSTEM_PID)"
else
    echo "⚠️  用户管理系统可能未完全启动，继续部署..."
fi

# 启动认证代理服务器
echo ""
echo "[5/6] 启动认证代理服务器..."
nohup node fixed-proxy.js > ../logs/auth-proxy.log 2>&1 &
AUTH_PROXY_PID=$!

# 等待代理服务启动
echo "等待认证代理服务器启动..."
sleep 5

# 最终检查
echo ""
echo "[6/6] 系统状态检查..."
if curl -s --connect-timeout 3 http://localhost:3001 > /dev/null; then
    echo "✅ 认证代理启动成功 (PID: $AUTH_PROXY_PID)"
else
    echo "⚠️  认证代理可能未完全启动"
fi

echo ""
echo "========================================"
echo "          🎉 部署完成！"
echo "========================================"
echo ""
echo "📍 系统地址:"
echo "   认证代理服务器: http://localhost:3001"
echo "   用户管理系统:   http://localhost:3002"
echo "   原始FastGPT:    http://localhost:3000"
echo ""
echo "📋 测试页面:"
echo "   系统测试:       $SCRIPT_DIR/测试页面/认证代理.html"
echo "   管理后台:       http://localhost:3002/admin.html"
echo ""
echo "🔑 默认账户:"
echo "   用户名: admin"
echo "   密码:   123456"
echo ""
echo "⚡ 现在您可以："
echo "1. 将分享链接的端口从 3000 改为 3001"
echo "2. 打开测试页面验证系统功能"
echo "3. 访问管理后台查看用户数据"
echo ""
echo "📊 进程信息:"
echo "   用户管理系统 PID: $USER_SYSTEM_PID"
echo "   认证代理 PID: $AUTH_PROXY_PID"
echo ""
echo "🛑 停止服务命令:"
echo "   kill $USER_SYSTEM_PID $AUTH_PROXY_PID"
echo ""
echo "📖 详细说明请查看: 使用说明.md"
echo "========================================"

# 保存PID到文件
mkdir -p ../logs
echo $USER_SYSTEM_PID > ../logs/user-system.pid
echo $AUTH_PROXY_PID > ../logs/auth-proxy.pid

echo ""
echo "系统日志位置:"
echo "   用户管理系统: $SCRIPT_DIR/logs/user-system.log"
echo "   认证代理:     $SCRIPT_DIR/logs/auth-proxy.log"

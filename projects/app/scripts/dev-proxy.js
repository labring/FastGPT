#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// 默认代理地址配置
const DEFAULT_PROXY_URL = 'http://200.200.22.23:3000';

// 解析命令行参数
const args = process.argv.slice(2);
const urlArg = args.find(arg => arg.startsWith('url='));

let proxyUrl = '';

if (urlArg) {
  // 优先使用命令行参数
  proxyUrl = urlArg.split('=')[1];
} else if (DEFAULT_PROXY_URL) {
  // 如果没有命令行参数，使用默认地址
  proxyUrl = DEFAULT_PROXY_URL;
  console.log('ℹ️  未提供命令行参数，使用默认代理地址');
}

if (!proxyUrl) {
  console.error('错误: 请提供代理 URL');
  console.log('用法: pnpm dev:proxy url=http://ip:port');
  console.log('提示: 可以通过环境变量 DEFAULT_PROXY_URL 设置默认地址');
  process.exit(1);
}

// 验证 URL 格式
try {
  new URL(proxyUrl);
} catch (error) {
  console.error('错误: 无效的 URL 格式');
  console.log('用法: pnpm dev:proxy url=http://ip:port');
  process.exit(1);
}

console.log(`🚀 启动开发服务器，代理到: ${proxyUrl}`);
console.log('📡 代理范围: /api/*');
console.log('🛑 按 Ctrl+C 停止服务器\n');

// 设置环境变量并启动 Next.js
const env = { ...process.env, PROXY_URL: proxyUrl };

const child = spawn('next', ['dev'], {
  env,
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
  shell: true
});

// 处理退出信号
process.on('SIGINT', () => {
  console.log('\n🛑 正在停止开发服务器...');
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});

child.on('exit', (code) => {
  process.exit(code);
});

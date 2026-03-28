#!/usr/bin/env node

const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const path = require('path');

// 默认代理地址配置
const DEFAULT_PROXY_URL = 'https://10.109.96.192:19443';
// 本地 HTTP 中间代理端口（Next.js rewrite 指向此端口）
const LOCAL_PROXY_PORT = 19444;

// 解析命令行参数
const args = process.argv.slice(2);
const urlArg = args.find(arg => arg.startsWith('url='));

let proxyUrl = '';

if (urlArg) {
  proxyUrl = urlArg.split('=')[1];
} else if (DEFAULT_PROXY_URL) {
  proxyUrl = DEFAULT_PROXY_URL;
  console.log('ℹ️  未提供命令行参数，使用默认代理地址');
}

if (!proxyUrl) {
  console.error('错误: 请提供代理 URL');
  console.log('用法: pnpm dev:proxy url=https://ip:port');
  process.exit(1);
}

let targetUrl;
try {
  targetUrl = new URL(proxyUrl);
} catch (error) {
  console.error('错误: 无效的 URL 格式');
  console.log('用法: pnpm dev:proxy url=https://ip:port');
  process.exit(1);
}

// 启动本地 HTTP 中间代理，绕过 undici 的 TLS 校验限制
const proxyServer = http.createServer((req, res) => {
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: targetUrl.host },
    rejectUnauthorized: false  // 忽略自签名证书
  };

  const transport = targetUrl.protocol === 'https:' ? https : http;
  const proxyReq = transport.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`[HTTP Proxy] 转发失败: ${req.url}`, err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end(err.message);
    }
  });

  req.pipe(proxyReq, { end: true });
});

proxyServer.listen(LOCAL_PROXY_PORT, () => {
  console.log(`✅ 本地 HTTP 代理已启动: http://localhost:${LOCAL_PROXY_PORT}`);
  console.log(`🔗 转发目标: ${proxyUrl}`);
  console.log('📡 代理范围: /api/*');
  console.log('🛑 按 Ctrl+C 停止\n');

  // 代理服务器就绪后再启动 Next.js，指向本地 HTTP 代理
  const localProxy = `http://localhost:${LOCAL_PROXY_PORT}`;
  const env = {
    ...process.env,
    PROXY_API_TARGET: localProxy,
    PROXY_URL: localProxy
  };

  const child = spawn('npm', ['run', 'build:workers', '&&', 'next', 'dev'], {
    env,
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
    shell: true
  });

  process.on('SIGINT', () => {
    console.log('\n🛑 正在停止...');
    child.kill('SIGINT');
    proxyServer.close();
  });

  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
    proxyServer.close();
  });

  child.on('exit', (code) => {
    proxyServer.close();
    process.exit(code);
  });
});

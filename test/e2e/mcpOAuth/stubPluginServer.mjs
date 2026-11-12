/**
 * 本地启动 FastGPT 所需的最小 FastGPT-Plugin 桩服务（仅测试环境）。
 *
 * 背景：Next dev 的 instrumentation 启动链会调用 PLUGIN_BASE_URL 的
 * `GET /api/models/get-providers`，拿不到响应就以 `[plugin_error]` 退出。
 * F1 只验证 MCP OAuth，不需要真实插件市场，于是提供一个只读空目录的桩：
 *   - 返回空 modelProviders / aiproxyChannels（契约与 @fastgpt-plugin/sdk-client 一致）
 *   - 不实现任何工具执行能力；调用未实现路由直接 404
 *
 * 生产路径不会引用本文件；它只由 test/e2e/mcpOAuth/runRealStack.sh 在本地拉起。
 */
import http from 'node:http';

const HOST = process.env.STUB_PLUGIN_HOST || '127.0.0.1';
const PORT = Number(process.env.STUB_PLUGIN_PORT || 3004);
const TOKEN = process.env.PLUGIN_TOKEN || '';

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload)
  });
  res.end(payload);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);

  // 与插件服务一致：所有 /api 路由要求 Bearer（存在 PLUGIN_TOKEN 时）。
  if (url.pathname.startsWith('/api') && TOKEN) {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      return json(res, 401, { error: { code: 'unauthorized', message: 'invalid plugin token' } });
    }
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { status: 'ok', stub: true });
  }

  // instrumentation-check -> loadModelProviders()
  if (req.method === 'GET' && url.pathname === '/api/models/get-providers') {
    return json(res, 200, { data: { modelProviders: [], aiproxyChannels: [] } });
  }

  // 模型列表（空目录即可，模型目录实际来自 Mongo catalog）
  if (req.method === 'GET' && url.pathname === '/api/models') {
    return json(res, 200, { data: [] });
  }

  // 插件标签/列表：空集合
  if (req.method === 'GET' && (url.pathname === '/api/plugin/tags' || url.pathname === '/api/plugins')) {
    return json(res, 200, { data: [] });
  }

  return json(res, 404, {
    error: { code: 'not_found', message: `stub plugin server: ${req.method} ${url.pathname}` }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[stub-plugin] listening on http://${HOST}:${PORT}`);
});

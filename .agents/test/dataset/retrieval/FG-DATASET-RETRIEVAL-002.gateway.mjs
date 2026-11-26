import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/**
 * 只替代外部模型 HTTP 响应：record 转发真实网关，replay 严格按请求回放。
 * 权限、数据库、向量召回和计费仍由两个真实应用执行；缓存不保存请求认证头。
 */
export const startSearchRegressionGateway = async ({ upstream, listenUrl }) => {
  const target = new URL(listenUrl);
  assert.ok(
    ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname),
    'The regression gateway must listen on loopback'
  );
  const cache = new Map();
  let mode = 'live';
  let calls = [];
  /** 临时访问签名不是图片内容的一部分；其余请求字段保持严格匹配。 */
  const normalize = (value) => {
    if (typeof value === 'string' && /^https?:/.test(value)) {
      const url = new URL(value);
      if (url.pathname.includes('/temp/') || url.pathname.includes('/api/file/')) {
        url.search = '';
        return url.origin + url.pathname;
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, normalize(value[key])])
      );
    return value;
  };
  const server = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      if (req.url === '/__control') {
        if (req.method === 'POST') {
          const control = JSON.parse(body.toString());
          assert.ok(['live', 'record', 'replay'].includes(control.mode), 'Invalid gateway mode');
          mode = control.mode;
          if (control.reset) {
            calls = [];
            cache.clear();
          }
        }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ mode, calls }));
        return;
      }
      let input;
      try {
        input = JSON.parse(body.toString());
      } catch {
        input = body.toString();
      }
      const key = createHash('sha256')
        .update(JSON.stringify([req.method, req.url, normalize(input)]))
        .digest('hex');
      const summary = {
        path: req.url,
        model: input?.model,
        inputCount: Array.isArray(input?.input) ? input.input.length : undefined,
        documents: input?.documents?.length,
        requestHash: key,
        mode,
        at: new Date().toISOString()
      };
      let response;
      if (mode === 'replay') {
        response = cache.get(key);
        if (!response) {
          calls.push({ ...summary, cacheMiss: true });
          res.writeHead(409, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              error: {
                message: 'No matching recorded model request',
                type: 'integration_replay_miss'
              }
            })
          );
          return;
        }
      } else {
        const headers = { ...req.headers };
        delete headers.host;
        delete headers['content-length'];
        delete headers.connection;
        const actual = await fetch(upstream.replace(/\/$/, '') + req.url, {
          method: req.method,
          headers,
          ...(req.method !== 'GET' ? { body } : {}),
          signal: AbortSignal.timeout(120000)
        });
        response = {
          status: actual.status,
          body: Buffer.from(await actual.arrayBuffer()),
          type: actual.headers.get('content-type') || 'application/json'
        };
        if (mode === 'record' && actual.ok) cache.set(key, response);
      }
      summary.status = response.status;
      try {
        const data = JSON.parse(response.body.toString());
        summary.usage = data.usage;
        summary.resultCount = data.results?.length;
      } catch {
        /* SSE 响应原样转发，不将其误记为 JSON 用量。 */
      }
      calls.push(summary);
      res.writeHead(response.status, { 'content-type': response.type });
      res.end(response.body);
    } catch (error) {
      calls.push({ path: req.url, error: error.name });
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: { message: 'Integration gateway forwarding failed', type: error.name }
        })
      );
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(target.port), target.hostname, resolve);
  });
  return {
    close: () =>
      new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.ok(process.env.FASTGPT_TEST_SEARCH_FIXTURE, 'Set FASTGPT_TEST_SEARCH_FIXTURE');
  const fixture = JSON.parse(await readFile(process.env.FASTGPT_TEST_SEARCH_FIXTURE, 'utf8'));
  const gateway = await startSearchRegressionGateway({
    upstream: fixture.upstreamGateway,
    listenUrl: fixture.gatewayUrl
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      void gateway.close().then(() => process.exit(0));
    });
  console.log('Search regression model gateway is listening on loopback');
}

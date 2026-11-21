import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

/**
 * 只模拟测试外部边界：空插件目录、可控 HTTP 错误/屏障和文件源。
 * 不提供假的 Workflow、变量、权限或沙箱执行；未声明的路由直接 404。
 */
export async function startWorkflowFixtureServer({ port = 0 } = {}) {
  const observations = [],
    gates = new Map(),
    counts = new Map();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const json = (status, data) =>
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data));
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const contentType = req.headers['content-type']?.split(';')[0];
      // echo 仅模拟外部供应商；工作流侧的参数替换、出站请求和输出提取仍全部走生产实现。
      const body = (() => {
        if (url.pathname !== '/echo' || contentType === 'application/json') {
          return rawBody ? JSON.parse(rawBody) : {};
        }
        if (contentType === 'application/x-www-form-urlencoded') {
          return Object.fromEntries(new URLSearchParams(rawBody));
        }
        return rawBody;
      })();
      observations.push({
        at: new Date().toISOString(),
        method: req.method,
        path: url.pathname,
        bodyBytes: Buffer.byteLength(rawBody),
        body
      });
      if (url.pathname === '/echo') {
        const echo = {
          method: req.method,
          path: url.pathname,
          bodyBytes: Buffer.byteLength(rawBody),
          query: Object.fromEntries(url.searchParams),
          headers: {
            'content-type': req.headers['content-type'],
            'x-fg-test': req.headers['x-fg-test']
          },
          body,
          nil: null,
          zero: 0,
          flag: false,
          empty: ''
        };
        Object.assign(observations.at(-1), { query: echo.query, headers: echo.headers });
        return json(200, echo);
      }
      if (url.pathname === '/api/models/get-providers')
        return json(200, { data: { modelProviders: [], aiproxyChannels: [] } });
      if (url.pathname === '/api/models') return json(200, { data: [] });
      if (url.pathname === '/observations') return json(200, { observations });
      if (url.pathname === '/release') {
        const pending = gates.get(body.runId) ?? [];
        gates.delete(body.runId);
        pending.forEach((response) =>
          response.writeHead(200, { 'content-type': 'application/json' }).end('{"released":true}')
        );
        return json(200, { released: pending.length });
      }
      if (url.pathname === '/wait' || url.pathname === '/slow' || url.pathname === '/fast') {
        if (typeof body.runId !== 'string' || !body.runId.startsWith('fgtest-'))
          return json(400, { error: 'test runId required' });
        const key = body.runId;
        gates.set(key, [...(gates.get(key) ?? []), res]);
        return;
      }
      if (url.pathname === '/fail') return json(503, { error: 'FG-TEST controlled failure' });
      if (url.pathname === '/count' || url.pathname === '/attempt') {
        const key = body.runId + ':' + (body.index ?? '') + ':' + url.pathname;
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        if (url.pathname === '/attempt' && count === 1)
          return json(503, { error: 'FG-TEST retry once', count });
        return json(200, { count, runId: body.runId });
      }
      if (url.pathname === '/file.txt')
        return res
          .writeHead(200, { 'content-type': 'text/plain', 'content-length': '15' })
          .end('FG-TEST-CONTENT');
      return json(404, { error: 'Undeclared test fixture route', path: url.pathname });
    } catch (error) {
      return json(400, { error: error.message });
    }
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    observations,
    async close() {
      for (const responses of gates.values()) for (const res of responses) res.destroy();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = await startWorkflowFixtureServer({
    port: Number(process.env.FASTGPT_FIXTURE_PORT ?? 3219)
  });
  console.log(
    JSON.stringify({
      fixtureServer: fixture.baseUrl,
      simulated: ['plugin-empty-catalog', 'http-gate', 'http-errors', 'external-file']
    })
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => fixture.close().then(() => process.exit(0)));
}

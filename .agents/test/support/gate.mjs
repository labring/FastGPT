import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Blocked } from './runtime.mjs';
import { required, poll } from './scenario.mjs';

/** 真实 HTTP 等待工具，只有本进程可放行；按本轮注册的问题白名单接受请求。 */
export async function getGate(context, scenario) {
  if (context.resources.has('gate')) return context.resources.get('gate');
  const config = required(scenario.fixture.gate, 'gate');
  const token = scenario.secret(config.tokenEnv);
  const held = new Map();
  const pending = new Set();
  let closing = false;
  const server = createServer(async (req, res) => {
    try {
      if (
        req.url !== '/wait' ||
        req.method !== 'POST' ||
        req.headers['x-fastgpt-test-token'] !== token
      ) {
        res.writeHead(403).end();
        return;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) throw new Error('gate body too large');
        chunks.push(chunk);
      }
      const { runId } = JSON.parse(Buffer.concat(chunks).toString());
      const entry = held.get(runId);
      if (!entry) {
        res.writeHead(404).end();
        return;
      }
      entry.responses.push(res);
      (context.resources.get('record') ?? scenario.record)('gate 进入', { runId, at: Date.now() });
      // 清理可能早于在途 HTTP 节点到达，迟到连接也必须放行，才能先收尾再删数据。
      if (closing)
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"cleanup":true}');
    } catch {
      res.writeHead(400).end();
    }
  });
  server.listen(required(config.port, 'gate.port'), config.bindHost ?? '127.0.0.1');
  try {
    await once(server, 'listening');
  } catch {
    throw new Blocked('测试 gate 端口不可用，请配置独立端口');
  }
  const gate = {
    address: server.address(),
    requestHeaders: { 'x-fastgpt-test-token': token },
    register(runId) {
      assert.ok(runId.startsWith(context.run));
      assert.ok(!held.has(runId));
      const entry = { responses: [] };
      held.set(runId, entry);
      return {
        count: () => entry.responses.length,
        entered: () => poll(() => assert.ok(entry.responses.length), 30000),
        release: ({ status = 200, value = { marker: runId } } = {}) => {
          for (const res of entry.responses)
            if (!res.writableEnded)
              res
                .writeHead(status, { 'content-type': 'application/json' })
                .end(JSON.stringify(value));
        }
      };
    },
    releaseAll() {
      for (const entry of held.values())
        for (const res of entry.responses)
          if (!res.writableEnded)
            res.writeHead(200, { 'content-type': 'application/json' }).end('{"cleanup":true}');
    },
    track(promise) {
      const outcome = promise.then(
        (value) => ({ value }),
        (error) => ({ error })
      );
      pending.add(outcome);
      return outcome;
    }
  };
  context.resources.set('gate', gate);
  context.finalizers.push(async () => {
    closing = true;
    for (const entry of held.values())
      for (const res of entry.responses)
        if (!res.writableEnded)
          res.writeHead(200, { 'content-type': 'application/json' }).end('{"cleanup":true}');
    await Promise.all(pending);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    return {
      gateClosed: true,
      acceptedRequests: [...held.values()].reduce((sum, entry) => sum + entry.responses.length, 0)
    };
  });
  return gate;
}

/** 通过当前代码的 DAL helper 得到物理 key；不扫描或修改 Redis。 */
export async function getLeaseReader(context, scenario) {
  if (context.resources.has('lease-reader')) return context.resources.get('lease-reader');
  const appRequire = createRequire(new URL('../../../projects/app/package.json', import.meta.url));
  const tsx = appRequire('tsx/cjs/api');
  const parent = fileURLToPath(import.meta.url);
  const lease = tsx.require(
    fileURLToPath(
      new URL('../../../packages/dal/redis/lease/chat/chatGenerationLease.ts', import.meta.url)
    ),
    parent
  );
  const keyspace = tsx.require(
    fileURLToPath(new URL('../../../packages/dal/redis/runtime/keyspace.ts', import.meta.url)),
    parent
  );
  // DAL 已经通过 tsx 加载 ioredis；共用加载器避免 CJS 入口再次定义同一构造器的 default。
  const dalRequire = createRequire(new URL('../../../packages/dal/package.json', import.meta.url));
  const Redis = tsx.require(dalRequire.resolve('ioredis'), parent);
  const client = new Redis(scenario.secret(scenario.fixture.redis?.uriEnv), {
    lazyConnect: true,
    maxRetriesPerRequest: 0
  });
  client.on('error', () => {});
  try {
    await client.connect();
  } catch {
    client.disconnect();
    throw new Blocked('Redis 测试只读连接不可用');
  }
  context.cleanups.unshift(async () => {
    client.disconnect();
  });
  const read = async (appId, chatId) => {
    const key = keyspace.toPhysicalRedisKey(
      lease.getChatGenerationLeaseKey({ sourceType: 'app', sourceId: appId, chatId })
    );
    const results = await client.pipeline().get(key).pttl(key).exec();
    for (const [error] of results) if (error) throw error;
    const value = { key, owner: results[0][1], pttl: results[1][1], at: Date.now() };
    scenario.record('Redis GET/PTTL', value);
    return value;
  };
  context.resources.set('lease-reader', read);
  return read;
}

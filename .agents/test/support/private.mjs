import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Blocked } from './runtime.mjs';
import { required } from './scenario.mjs';

/** 复用本地 dev 数据库；写夹具前确认目标为本轮新建的测试团队，不要求独立数据库。 */
export async function privateDatabase(context, c) {
  const cacheKey = 'dev-db:' + c.fixture.teamId;
  if (context.resources.has(cacheKey)) return context.resources.get(cacheKey);
  const uri = c.secret(required(c.fixture.mongo?.writeUriEnv, 'mongo.writeUriEnv'));
  const { MongoClient, ObjectId } = createRequire(
    new URL('../../../packages/service/package.json', import.meta.url)
  )('mongoose').mongo;
  const client = await new MongoClient(uri).connect();
  context.cleanups.unshift(async () => client.close());
  const db = client.db();
  const team = await db.collection('teams').findOne({ _id: new ObjectId(c.fixture.teamId) });
  if (!team || !/^FG-TEST(?:[- ])/.test(team.name ?? ''))
    throw new Blocked('写夹具仅限本轮新建的 FG-TEST 团队');
  const value = { db, ObjectId, uri };
  context.resources.set(cacheKey, value);
  return value;
}

/** 当前 DAL 模块和 Redis 客户端使用同一 tsx 加载器，避免重复加载 CJS default。 */
export async function redisTools(context, c) {
  if (context.resources.has('redis-tools')) return context.resources.get('redis-tools');
  const req = createRequire(new URL('../../../projects/app/package.json', import.meta.url));
  const dal = createRequire(new URL('../../../packages/dal/package.json', import.meta.url));
  process.env.TSX_TSCONFIG_PATH = fileURLToPath(
    new URL('../../../projects/app/tsconfig.json', import.meta.url)
  );
  const tsx = req('tsx/cjs/api'),
    parent = fileURLToPath(import.meta.url);
  const load = (path) =>
    tsx.require(fileURLToPath(new URL('../../../' + path, import.meta.url)), parent);
  const lease = load('packages/dal/redis/lease/chat/chatGenerationLease.ts');
  const keyspace = load('packages/dal/redis/runtime/keyspace.ts');
  const { StreamResumeCache } = load('packages/dal/redis/lease/chat/streamResume.ts');
  const Redis = tsx.require(dal.resolve('ioredis'), parent);
  const client = new Redis(c.secret(c.fixture.redis?.uriEnv), {
    lazyConnect: true,
    maxRetriesPerRequest: 0
  });
  client.on('error', () => {});
  try {
    await client.connect();
  } catch {
    client.disconnect();
    throw new Blocked('Redis 测试连接不可用');
  }
  context.cleanups.unshift(async () => client.disconnect());
  const cache = new StreamResumeCache({
    logger: { error() {} },
    streamTtlSeconds: 30,
    postCompleteTtlSeconds: 4,
    ttlTouchIntervalMs: 1000
  });
  const leaseKey = ({ sourceType = 'app', sourceId, chatId }) =>
    keyspace.toPhysicalRedisKey(lease.getChatGenerationLeaseKey({ sourceType, sourceId, chatId }));
  const mirrorKeys = ({ sourceType = 'app', sourceId, chatId }) =>
    Object.fromEntries(
      Object.entries(cache.getKeys({ teamId: c.fixture.teamId, sourceType, sourceId, chatId })).map(
        ([name, key]) => [name, keyspace.toPhysicalRedisKey(key)]
      )
    );
  const value = {
    client,
    load,
    tsx,
    parent,
    leaseKey,
    mirrorKeys,
    async assertPrivate() {
      await privateDatabase(context, c);
      if (c.fixture.environment === 'local-dev')
        throw new Blocked('共享 dev 不注入全局 Redis 故障；该项归底层专项测试');
      const config = required(c.fixture.privateEnvironment, 'privateEnvironment');
      assert.equal(await client.get('fgtest:environment:' + config.id), c.secret(config.nonceEnv));
    },
    async observe(source) {
      const key = leaseKey(source),
        keys = mirrorKeys(source);
      const result = {
        lease: await client.get(key),
        pttl: await client.pttl(key),
        stream: await client.xrange(keys.keyOfStream, '-', '+'),
        streamTtl: await client.ttl(keys.keyOfStream),
        active: await client.get(keys.keyOfActive),
        unavailable: await client.get(keys.keyOfUnavailable)
      };
      (context.resources.get('record') ?? c.record)('Redis 会话白名单', {
        source,
        keys,
        ...result
      });
      return result;
    }
  };
  context.resources.set('redis-tools', value);
  return value;
}

/** 控制器仅服务本轮专用实例，调用后同时保存 Redis 命令观测作为实际证据。 */
export async function control(c, body) {
  const config = required(c.fixture.privateEnvironment, 'privateEnvironment');
  const response = await fetch(required(config.controlUrl, 'privateEnvironment.controlUrl'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + c.secret(config.nonceEnv)
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  assert.equal(response.status, 200);
  const value = await response.json();
  c.record('私有环境控制/命令观测', { body, value });
  return value;
}

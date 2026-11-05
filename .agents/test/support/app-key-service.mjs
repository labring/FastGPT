import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// 专用服务进程只接受固定操作；凭证从 stdin 进入，不进入命令行或执行证据。
let rawInput = '';
for await (const chunk of process.stdin) rawInput += chunk;
const input = JSON.parse(rawInput);
const env = JSON.parse(await readFile(input.environmentFile, 'utf8'));
Object.assign(process.env, env);
process.env.TSX_TSCONFIG_PATH = fileURLToPath(
  new URL('../../../projects/app/tsconfig.json', import.meta.url)
);
const req = createRequire(new URL('../../../projects/app/package.json', import.meta.url));
const tsx = req('tsx/cjs/api');
const load = (file) =>
  tsx.require(
    fileURLToPath(new URL('../../../' + file, import.meta.url)),
    fileURLToPath(import.meta.url)
  );
let mongo, redis;
try {
  mongo = load('packages/service/common/mongo/index.ts');
  await mongo.connectionMongo.connect(env.MONGODB_URI);
  await mongo.connectionLogMongo.connect(env.MONGODB_LOG_URI ?? env.MONGODB_URI);
  const db = mongo.connectionMongo.connection.db;
  assert.match(db.databaseName, /^fg_it_[a-z0-9_]+$/);
  assert.equal(db.databaseName, input.database);
  const marker = await db.collection('fg_test_environment').findOne({ _id: input.environmentId });
  assert.equal(marker?.nonce, input.nonce);
  redis = load('packages/dal/redis/runtime/index.ts');
  await redis.configureRedisRuntime({ redisUrl: env.REDIS_URL });
  let result;
  if (input.operation === 'auth-flags') {
    const { parseHeaderCert } = load('packages/service/support/permission/auth/common.ts');
    result = [];
    for (const type of ['app', 'personal'])
      for (const authApiKey of [undefined, false, true])
        for (const authAppApiKey of [undefined, false, true]) {
          let accepted = false,
            actualType;
          try {
            const cert = await parseHeaderCert({
              req: { headers: { authorization: 'Bearer ' + input.keys[type] } },
              ...(authApiKey === undefined ? {} : { authApiKey }),
              ...(authAppApiKey === undefined ? {} : { authAppApiKey })
            });
            accepted = true;
            actualType = cert.apiKeyType;
          } catch (error) {
            assert.ok(
              ['unAuthorization', 'unAuthApiKey'].includes(error?.statusText ?? error),
              '鉴权关闭应返回已知认证拒绝，不能把服务异常当作通过'
            );
          }
          assert.equal(accepted, Boolean(type === 'app' ? authAppApiKey : authApiKey));
          if (accepted) assert.equal(actualType, type);
          result.push({
            type,
            authApiKey: authApiKey ?? 'default',
            authAppApiKey: authAppApiKey ?? 'default',
            accepted
          });
        }
  } else if (input.operation === 'prepare-resources') {
    assert.match(input.name, /^FG-TEST-/);
    const { MongoDataset } = load('packages/service/core/dataset/schema.ts');
    const { MongoAgentSkills } = load('packages/service/core/ai/skill/model/schema.ts');
    const identity = { teamId: input.teamId, tmbId: input.tmbId, name: input.name };
    const dataset = await MongoDataset.create(identity);
    try {
      const skill = await MongoAgentSkills.create({ ...identity, source: 'personal' });
      result = {
        datasetId: String(dataset._id),
        skillId: String(skill._id),
        datasetCollection: MongoDataset.collection.name,
        skillCollection: MongoAgentSkills.collection.name
      };
    } catch (error) {
      await MongoDataset.deleteOne({ _id: dataset._id });
      throw error;
    }
  } else if (input.operation === 'verify-sandbox-cleanup') {
    // 应用删除已执行正常资源回收；此处只读验证，避免重入已物理删除的 source。
    const { MongoSandboxInstance } = load(
      'packages/service/core/ai/sandbox/infrastructure/instance/schema.ts'
    );
    const remaining = await MongoSandboxInstance.countDocuments({
      sourceType: 'app',
      sourceId: input.appId
    });
    assert.equal(remaining, 0);
    // SDK 仅导出 ESM；只读探测不走 CJS 业务 loader，也不执行 ensureRunning/create。
    const { createSandbox } = await import('../../../sdk/sandbox-adapter/dist/index.js');
    for (const resource of input.resources) {
      assert.equal(resource.sourceId, input.appId);
      assert.ok(['opensandbox', 'sealosdevbox'].includes(resource.provider));
      const adapter = createSandbox(
        resource.provider === 'opensandbox'
          ? {
              provider: 'opensandbox',
              connectionConfig: {
                baseUrl: env.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
                apiKey: env.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
                runtime: env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME,
                useServerProxy: env.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY === 'true',
                sessionId: resource.sandboxId
              }
            }
          : {
              provider: 'sealosdevbox',
              connectionConfig: {
                baseUrl: env.AGENT_SANDBOX_SEALOS_BASEURL,
                token: env.AGENT_SANDBOX_SEALOS_TOKEN,
                sandboxId: resource.sandboxId
              }
            }
      );
      try {
        assert.equal(await adapter.getInfo(), null, '远端 Sandbox 应已删除');
      } finally {
        await adapter.close();
      }
    }
    result = { appId: input.appId, remaining, remoteResourcesChecked: input.resources.length };
  } else throw Error('Unsupported operation');
  process.stdout.write('\nFG_TEST_RESULT=' + JSON.stringify(result) + '\n');
  process.exitCode = 0;
} catch (error) {
  process.stdout.write('\nFG_TEST_ERROR=' + error.name + '\n');
  process.exitCode = 1;
} finally {
  await mongo?.connectionMongo.disconnect();
  await mongo?.connectionLogMongo.disconnect();
  // DAL 客户端由本子进程拥有，不让全局 logger/定时器阻止进程结束。
  process.exit(process.exitCode ?? 1);
}

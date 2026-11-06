import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 服务子进程复用本地 dev 配置；凭证从 stdin 进入，只接受限定团队下的固定操作。
let rawInput = '';
for await (const chunk of process.stdin) rawInput += chunk;
const input = JSON.parse(rawInput);
const env = JSON.parse(await readFile(input.environmentFile, 'utf8'));
if (typeof input.transferResources === 'boolean')
  env.TRANSFER_RESOURCE_ON_MEMBER_LEAVE = String(input.transferResources);
Object.assign(process.env, env);
const appConfig = fileURLToPath(new URL('../../../projects/app/tsconfig.json', import.meta.url));
let temporaryConfig;
if (input.operation === 'lifecycle') {
  // Pro 子模块的相对 SDK alias 面向其部署布局；本仓库脚本复用 app 的实际 SDK 路径，仅切换 @/ 到 Pro。
  const config = JSON.parse(await readFile(appConfig, 'utf8'));
  const paths = Object.fromEntries(
    Object.entries(config.compilerOptions.paths).map(([key, values]) => [
      key,
      values.map((value) => path.resolve(path.dirname(appConfig), value))
    ])
  );
  paths['@/*'] = [fileURLToPath(new URL('../../../pro/admin/src/*', import.meta.url))];
  paths['@fastgpt-plugin/sdk-client'] = [
    fileURLToPath(
      new URL(
        '../../../packages/global/node_modules/@fastgpt-plugin/sdk-client/dist/index.js',
        import.meta.url
      )
    )
  ];
  paths['@fastgpt-sdk/sandbox-adapter'] = [
    fileURLToPath(new URL('../../../sdk/sandbox-adapter/src/index.ts', import.meta.url))
  ];
  temporaryConfig = path.join(
    path.dirname(input.environmentFile),
    'service-tsconfig-' + process.pid + '.json'
  );
  await writeFile(
    temporaryConfig,
    JSON.stringify({ extends: appConfig, compilerOptions: { paths } }),
    { mode: 0o600 }
  );
}
process.env.TSX_TSCONFIG_PATH = temporaryConfig ?? appConfig;
const req = createRequire(new URL('../../../projects/app/package.json', import.meta.url));
// Pro 间接加载的词典使用动态 JSON import；同时启用真实 ESM loader，沿用应用打包时的解析语义。
const unregisterEsm =
  input.operation === 'lifecycle'
    ? req('tsx/esm/api').register({ tsconfig: process.env.TSX_TSCONFIG_PATH })
    : undefined;
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
  const team = await db
    .collection('teams')
    .findOne({ _id: new mongo.Types.ObjectId(input.teamId) });
  assert.ok(team && /^FG-TEST(?:[- ])/.test(team.name ?? ''), '服务操作仅限本轮测试团队');
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
  } else if (input.operation === 'lifecycle') {
    const { runLifecycleOperation } = await import('./app-key-lifecycle-service.mjs');
    result = await runLifecycleOperation({ input, load, mongo, db });
  } else throw Error('Unsupported operation');
  process.stdout.write('\nFG_TEST_RESULT=' + JSON.stringify(result) + '\n');
  process.exitCode = 0;
} catch (error) {
  process.stdout.write(
    '\nFG_TEST_ERROR=' + JSON.stringify({ name: error.name, message: error.message }) + '\n'
  );
  process.exitCode = 1;
} finally {
  await mongo?.connectionMongo.disconnect();
  await mongo?.connectionLogMongo.disconnect();
  await unregisterEsm?.();
  if (temporaryConfig) await rm(temporaryConfig, { force: true });
  // DAL 客户端由本子进程拥有，不让全局 logger/定时器阻止进程结束。
  process.exit(process.exitCode ?? 1);
}

import assert from 'node:assert/strict';
import { readFile, writeFile, realpath, mkdir, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workflowDatabase } from './workflow-database.mjs';
import { required } from '../../../support/scenario.mjs';

/** 启动独立 Node 服务执行方，连接已核验的本轮真实依赖；不启动 cron/worker 或替换生产 callback。 */
export async function workflowService(context, c) {
  const stage = async (label) =>
    writeFile(
      context.directory + '/service-stage.json',
      JSON.stringify({ label, at: new Date().toISOString() })
    );
  await stage('private-dependency-validation');
  await workflowDatabase(context, c);
  const filename = c.secret(
    required(
      c.fixture.serviceEnvFileEnv ?? c.fixture.privateEnvironment?.serviceEnvFileEnv,
      'serviceEnvFileEnv'
    )
  );
  const env = JSON.parse(await readFile(filename, 'utf8'));
  assert.equal(env.MONGODB_URI, c.secret(c.fixture.mongo.writeUriEnv));
  Object.assign(process.env, env);
  if (c.fixture.environment === 'local-dev') process.env.SYNC_INDEX = 'false';
  process.env.TSX_TSCONFIG_PATH = fileURLToPath(
    new URL('../../../../../projects/app/test/tsconfig.json', import.meta.url)
  );
  const req = createRequire(new URL('../../../../../projects/app/package.json', import.meta.url));
  const repo = fileURLToPath(new URL('../../../../../', import.meta.url));
  process.chdir(repo + 'projects/app');
  const names = [
    'packages/dal/redis/runtime/connection.ts',
    'packages/service/common/mongo/index.ts',
    'projects/app/src/service/common/system/index.ts',
    'packages/service/common/s3/index.ts',
    'packages/global/core/workflow/runtime/utils.ts',
    'packages/service/support/user/team/utils.ts',
    'packages/service/core/workflow/dispatch/context/resource.ts',
    'packages/service/core/app/resource/utils.ts',
    'packages/service/core/workflow/dispatch/context/index.ts',
    'packages/service/core/workflow/dispatch/context/file.ts',
    'packages/service/core/workflow/dispatch/context/variables.ts',
    'packages/service/core/workflow/dispatch/context/memory.ts',
    'packages/service/core/workflow/dispatch/context/nodeResponse.ts',
    'packages/service/core/workflow/dispatch/index.ts',
    'packages/service/core/workflow/dispatch/ai/toolcall/toolProvider/createToolCallToolProvider.ts',
    'packages/service/core/workflow/dispatch/utils/summary.ts',
    'packages/service/core/workflow/resource/service.ts',
    'packages/service/core/ai/model/catalog/service.ts',
    'packages/service/support/permission/model/auth.ts',
    'packages/service/support/permission/repository/resourcePermissionRepo.ts',
    'packages/service/support/permission/model/cache.ts',
    'packages/service/core/ai/model/schema.ts',
    'packages/service/core/dataset/schema.ts'
  ];
  // 与主站 bundler 一样处理仅提供 ESM import 的插件 SDK，避免 CJS require 兼容错误；源码不变。
  const bundleDir = repo + 'local/tmp/workflow-integration';
  await mkdir(bundleDir, { recursive: true });
  const bundle = bundleDir + '/service-' + context.run + '-' + context.itemId + '.mjs';
  // 只回收当前场景的随机构建产物，构建中途失败也不会留下不必要的 bundle。
  context.cleanups.unshift(async () => {
    await unlink(bundle).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  });
  const alias = Object.fromEntries(
    ['global', 'service', 'web', 'dal'].map((name) => [
      '@fastgpt/' + name,
      repo + 'packages/' + name
    ])
  );
  alias['@fastgpt-plugin/sdk-client'] = await realpath(
    repo + 'packages/global/node_modules/@fastgpt-plugin/sdk-client/dist/index.js'
  );
  alias['@fastgpt-sdk/sandbox-adapter'] = repo + 'sdk/sandbox-adapter/src/index.ts';
  alias.axios = await realpath(repo + 'packages/service/node_modules/axios/index.js');
  const dependencyRequires = [
    req,
    ...['service', 'dal', 'global', 'web'].map((name) =>
      createRequire(repo + 'packages/' + name + '/package.json')
    ),
    ...['storage', 'otel', 'sandbox-adapter'].map((name) =>
      createRequire(repo + 'sdk/' + name + '/package.json')
    )
  ];
  const dependencies = {
    name: 'workspace-external-dependencies',
    setup(build) {
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        if (
          args.path.startsWith('@fastgpt/') ||
          args.path.startsWith('@fastgpt-sdk/') ||
          args.path === '@fastgpt-plugin/sdk-client' ||
          args.path.startsWith('@/') ||
          args.path === 'axios'
        )
          return;
        const importRequires =
          args.importer && path.isAbsolute(args.importer)
            ? [createRequire(args.importer), ...dependencyRequires]
            : dependencyRequires;
        for (const externalRequire of importRequires) {
          try {
            return { path: externalRequire.resolve(args.path), external: true };
          } catch {}
        }
        // import-only ESM 包无法由 require.resolve 找到；保留其公开 import 入口，不改写依赖本身。
        if (args.path.split('/').length === (args.path.startsWith('@') ? 2 : 1)) {
          for (const directory of [
            'projects/app',
            'packages/service',
            'packages/dal',
            'packages/global',
            'sdk/otel',
            'sdk/sandbox-adapter'
          ]) {
            try {
              const base = repo + directory + '/node_modules/' + args.path;
              const pkg = JSON.parse(readFileSync(base + '/package.json', 'utf8'));
              const entry =
                pkg.exports?.['.']?.import ?? pkg.exports?.import ?? pkg.module ?? pkg.main;
              if (typeof entry === 'string')
                return { path: path.resolve(base, entry), external: true };
            } catch {}
          }
        }
      });
    }
  };
  await req('esbuild').build({
    stdin: {
      contents:
        names
          .map((name, index) => `import * as m${index} from ${JSON.stringify(repo + name)};`)
          .join('\n') +
        '\nexport const modules = [' +
        names.map((_, index) => 'm' + index).join(',') +
        '];',
      resolveDir: repo
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    packages: 'external',
    alias,
    plugins: [dependencies],
    tsconfig: repo + 'projects/app/test/tsconfig.json',
    outfile: bundle,
    banner: {
      js: 'import { createRequire as nodeCreateRequire } from "node:module"; const require = nodeCreateRequire(import.meta.url);'
    },
    logLevel: 'silent'
  });
  const compiled = (await import(bundle)).modules;
  const load = (name) => {
    const index = names.indexOf(name);
    assert.ok(index >= 0, '服务模块必须显式登记');
    return compiled[index];
  };
  const { configureRedisRuntime } = load('packages/dal/redis/runtime/connection.ts');
  const redis = configureRedisRuntime({ redisUrl: env.REDIS_URL });
  await stage('redis-configured');
  const mongo = load('packages/service/common/mongo/index.ts');
  if (c.fixture.environment === 'local-dev') {
    mongo.connectionMongo.set('autoIndex', false);
    mongo.connectionMongo.set('autoCreate', false);
    mongo.connectionLogMongo.set('autoIndex', false);
    mongo.connectionLogMongo.set('autoCreate', false);
  }
  context.cleanups.unshift(async () => {
    await redis.close();
    await mongo.connectionMongo.disconnect();
    await mongo.connectionLogMongo.disconnect();
  });
  await mongo.connectionMongo.connect(env.MONGODB_URI);
  await stage('mongo-connected');
  await mongo.connectionLogMongo.connect(env.MONGODB_LOG_URI ?? env.MONGODB_URI);
  await stage('mongo-log-connected');
  const system = load('projects/app/src/service/common/system/index.ts');
  await stage('system-module-loaded');
  system.initGlobalVariables();
  await system.getInitConfig();
  await stage('system-initialized');
  load('packages/service/common/s3/index.ts').initS3Buckets();
  const runtime = load('packages/global/core/workflow/runtime/utils.ts');
  const { getRunningUserInfoByTmbId } = load('packages/service/support/user/team/utils.ts');
  const { createWorkflowResourceContext } = load(
    'packages/service/core/workflow/dispatch/context/resource.ts'
  );
  const { extractAppResources } = load('packages/service/core/app/resource/utils.ts');
  const { runWithContext } = load('packages/service/core/workflow/dispatch/context/index.ts');
  const { prepareWorkflowFileContext } = load(
    'packages/service/core/workflow/dispatch/context/file.ts'
  );
  const { WorkflowVariableState } = load(
    'packages/service/core/workflow/dispatch/context/variables.ts'
  );
  const { WorkflowMemoryContext } = load(
    'packages/service/core/workflow/dispatch/context/memory.ts'
  );
  const { createWorkflowEntryNodeResponseSink } = load(
    'packages/service/core/workflow/dispatch/context/nodeResponse.ts'
  );
  const dispatch = load('packages/service/core/workflow/dispatch/index.ts');
  await stage('workflow-module-loaded');
  c.record('真实服务执行方', {
    commit: c.fixture.workflowRuntime?.commit ?? '未提供，需要执行方另行核实',
    source: fileURLToPath(
      new URL('../../../../../packages/service/core/workflow/dispatch/index.ts', import.meta.url)
    ),
    externalDependencies: ['configured-Mongo', 'configured-Redis', 'configured-S3'],
    callbackMapMocked: false
  });

  async function props(appId, graph, chatId, extra = {}) {
    const tmbId = c.fixture.actors.owner.tmbId;
    return {
      mode: 'chat',
      uid: tmbId,
      runningAppInfo: {
        sourceType: 'app',
        sourceId: appId,
        name: 'FG-TEST-service',
        teamId: c.fixture.teamId,
        tmbId
      },
      runningUserInfo: await getRunningUserInfoByTmbId(tmbId),
      chatId,
      responseChatItemId: c.run + '-response',
      histories: [],
      query: [{ type: 'text', text: { content: c.run } }],
      variables: {},
      chatConfig: graph.chatConfig,
      runtimeNodes: runtime.storeNodes2RuntimeNodes(
        graph.nodes,
        runtime.getWorkflowEntryNodeIds(graph.nodes)
      ),
      runtimeEdges: runtime.storeEdges2RuntimeEdges(graph.edges),
      stream: false,
      nodeResponseWriteConfig: { persistToDb: true, retainInMemory: true },
      maxFileAmount: 10,
      maxBytesPerFile: 1024,
      resourceContext: createWorkflowResourceContext({
        resources: extractAppResources(graph),
        teamId: c.fixture.teamId,
        isRoot: true
      }),
      concatUsage() {},
      ...extra
    };
  }
  /** 直接内核变体仍构建完整真实文件/变量与 DB writer；可调整非 HTTP 的预算和深度。 */
  async function run(appId, graph, chatId, control = {}, observe, execute) {
    const data = await props(appId, graph, chatId);
    const prepared = await prepareWorkflowFileContext({
      query: data.query,
      histories: [],
      scope: { sourceType: 'app', sourceId: appId, uid: data.uid, chatId },
      maxFileAmount: data.maxFileAmount,
      maxBytesPerFile: data.maxBytesPerFile
    });
    const variableContext = await WorkflowVariableState.create({
      ...data,
      timezone: 'Asia/Shanghai',
      variablesConfig: graph.chatConfig?.variables
    });
    let parent;
    const events = [];
    const workflowStreamResponse = (event) => {
      events.push({ ...event, parentBudget: parent?.runtimeControl.maxRunTimes });
      observe?.(event, parent);
    };
    const sink = createWorkflowEntryNodeResponseSink({
      teamId: c.fixture.teamId,
      sourceType: 'app',
      sourceId: appId,
      chatId,
      chatItemDataId: data.responseChatItemId,
      nodeResponseWriteConfig: data.nodeResponseWriteConfig,
      apiVersion: 'v2'
    });
    const runtimeControl = {
      mode: 'chat',
      maxRunTimes: 30,
      workflowDispatchDeep: 0,
      isToolCall: false,
      ...control
    };
    try {
      const result = await runWithContext(
        {
          runtimeControl,
          checkIsStopping: () => false,
          variableContext,
          memoryContext: WorkflowMemoryContext.fromHistories(data.histories, {
            rootSource: data.runningAppInfo
          }),
          nodeResponseSink: sink,
          mcpClientMemory: {},
          fileContext: prepared.fileContext,
          resourceContext: data.resourceContext,
          workflowStreamResponse,
          sandboxContext: {
            sourceType: data.runningAppInfo.sourceType,
            sourceId: appId,
            teamId: c.fixture.teamId,
            userId: data.uid,
            chatId
          }
        },
        async (ctx) => {
          parent = ctx;
          const runData = {
            ...data,
            timezone: 'Asia/Shanghai',
            externalProvider: {},
            query: prepared.query
          };
          return execute ? execute({ data: runData, context: ctx }) : dispatch.runWorkflow(runData);
        }
      );
      await sink.close();
      const flat = sink.getFlatNodeResponses();
      c.record('真实内核运行', {
        chatId,
        control,
        finalControl: runtimeControl,
        result,
        events,
        flat
      });
      return { result, events, flat, runtimeControl };
    } finally {
      await sink.close();
    }
  }
  return {
    load,
    props,
    run,
    ...dispatch,
    prepareWorkflowFileContext,
    WorkflowVariableState,
    runWithContext
  };
}

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { appendFile, readFile, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Blocked, loadFixture, runNodeCase } from '../../../support/runtime.mjs';
import { createScenario, poll, required, sanitize, success } from '../../../support/scenario.mjs';

/**
 * 仅手动执行的真实 Builder HTTP 集成入口，不导入 FastGPT handler 或业务实现。
 * --describe 无副作用；实际执行由 test:cases 设置报告协议环境变量。
 *
 * FASTGPT_TEST_FIXTURE（仓库外 JSON）在通用 fixture 基础上增加：
 *   env: { FG_BUILDER_STATE: '/绝对路径/state.json' },
 *   secretEnv: '/绝对路径/service-env.json',
 *   // 或沿用本轮已有 builder.sourceEnvFileEnv 指定路径环境变量。
 *   actors: { owner: { tmbId, stateEnv: 'FG_BUILDER_STATE' } },
 *   mongo: { uriEnv: 'MONGODB_URI' }, redis: { uriEnv: 'REDIS_URL' },
 *   workflowBuilder: {
 *     report: '/本轮报告/report.html',
 *     scenarioMap: { '实际用例ID': { '实际场景ID': 'confirmed-repair' } },
 *     requestTimeoutMs: 240000, upstreamPort: 0
 *   }
 *
 * service-env 只在本进程内加载；凭证和连接串进入脱敏集合，原文件绝不作为证据。
 * confirmed-repair 包含坏 JSON 和非法参数两个独立应用变体，只验证引擎协议，
 * 不替代真实 LLM 的需求理解、任务路由、方案内容或 UI 验收。
 */
export const capabilities = {
  'confirmed-repair': {
    variants: ['invalid-json', 'invalid-parameters'],
    assertions: [
      '真实创建新 v1 预览任务并提交结构化 confirm',
      '上游看到真实工具错误之后才发送修复参数',
      'stage → draft validate 的实际 revision → commit → 最终文本',
      '确认轮无追加 Ask/preview，Mongo 绑定唯一候选且任务已交付',
      'version/load source=s3；直接读取 S3 对象并核对文档/checksum',
      'Mongo、Redis 会话租约及 OpenSandbox 任务文件取证；finally 清理本轮资源'
    ]
  },
  'domain-repair': {
    variants: ['config-path-not-allowed'],
    assertions: [
      '合法 JSON 暂存不可写配置路径，真实 draft validate 返回领域诊断',
      '同一 chunkId 替换为正确业务命令，重新 validate 后用最新 revision 提交',
      '无追加 Ask/preview，候选精确差集、Mongo/Sandbox/S3 绑定和清理核验'
    ]
  }
};

const defaultScenarioMap = {
  'FG-APP-WORKFLOW-052': { C3: 'confirmed-repair', C4: 'domain-repair' }
};

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const serviceRequire = createRequire(path.join(repo, 'packages/service/package.json'));
const dalRequire = createRequire(path.join(repo, 'packages/dal/package.json'));
const sandboxRequire = createRequire(path.join(repo, 'sdk/sandbox-adapter/package.json'));
const { ObjectId } = serviceRequire('mongoose').mongo;
const sourceType = 'workflowBuilder';
const chatRoute = '/api/proApi/core/workflow/builder/chat';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const newDataId = () => randomBytes(12).toString('hex');
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const textContent = (content) =>
  typeof content === 'string' ? content : (content ?? []).map((part) => part.text ?? '').join('');

/** 仅为 HTTP 请求计算公开文档协议的 checksum；服务端仍独立解析和重算。 */
export function documentChecksum(document) {
  const sort = (value) => {
    if (Array.isArray(value)) return value.map(sort);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compare(a, b))
        .map(([key, item]) => [key, sort(item)])
    );
  };
  const normalized = {
    schemaVersion: document.schemaVersion,
    app: sort(document.app),
    nodes: [...document.nodes].sort((a, b) => compare(a.nodeId, b.nodeId)).map(sort),
    executionEdges: document.executionEdges
      .map(sort)
      .sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b))),
    chatConfig: sort(document.chatConfig)
  };
  return 'sha256:' + sha256(JSON.stringify(normalized));
}

/** 创建本脚本自己的最小 Start → Reply 基线，不复用 fixture 中的应用。 */
function baseline(name) {
  const nodes = [
    {
      nodeId: 'Start',
      flowNodeType: 'workflowStart',
      name: 'Start',
      position: { x: 0, y: 0 },
      inputs: [
        {
          key: 'userChatInput',
          label: 'workflow:user_question',
          valueType: 'string',
          required: true,
          renderTypeList: ['reference', 'textarea']
        }
      ],
      outputs: [
        {
          id: 'userChatInput',
          key: 'userChatInput',
          type: 'static',
          valueType: 'string',
          label: 'User question'
        }
      ]
    },
    {
      nodeId: 'Reply',
      flowNodeType: 'answerNode',
      name: 'Reply',
      position: { x: 500, y: 0 },
      inputs: [
        {
          key: 'text',
          label: 'Response content',
          valueType: 'any',
          required: true,
          renderTypeList: ['textarea', 'reference'],
          selectedType: 'textarea',
          value: 'FG-TEST baseline'
        }
      ],
      outputs: []
    }
  ];
  return {
    schemaVersion: 'fastgpt-workflow/v1',
    app: { name, intro: '', appType: 'advanced' },
    nodes: nodes.sort((a, b) => compare(a.nodeId, b.nodeId)),
    executionEdges: [
      { source: { kind: 'next', nodeId: 'Start' }, target: { kind: 'target', nodeId: 'Reply' } }
    ],
    chatConfig: {}
  };
}

/** 执行前核验真实报告和显式环境；这个函数不发请求、不写业务资源。 */
async function prepareFixture(context) {
  const { fixture } = context;
  const config = fixture.workflowBuilder ?? {};
  const reportPath = await realpath(
    required(
      config.report ?? process.env.FASTGPT_TEST_REPORT,
      'workflowBuilder.report 或 FASTGPT_TEST_REPORT'
    )
  );
  const evidenceDirectory = await realpath(path.join(path.dirname(reportPath), 'evidence'));
  const runDirectory = await realpath(context.directory);
  const relative = path.relative(evidenceDirectory, runDirectory);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Blocked('FASTGPT_TEST_RUN_DIR 必须是本轮报告 evidence 下的独立尝试目录');
  const html = await readFile(reportPath, 'utf8');
  const match = html.match(/<script id="run-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Blocked('本轮报告不存在或未包含所选用例；创建报告后再执行业务场景');
  const report = JSON.parse(match[1]);
  const item = report.cases
    ?.find((entry) => entry.id === process.env.FASTGPT_TEST_CASE_ID)
    ?.items.find((entry) => entry.id === context.itemId);
  if (report.closedAt || !item?.selected || item.result !== 'running')
    throw new Blocked('所选场景必须在未结束的本轮报告中先更新为 running');
  if (fixture.baseUrl !== 'http://127.0.0.1:3000')
    throw new Blocked('本脚本仅授权 http://127.0.0.1:3000 的真实 HTTP 入口');

  const filename = required(
    fixture.secretEnv ?? process.env[fixture.builder?.sourceEnvFileEnv],
    'secretEnv 或 builder.sourceEnvFileEnv 指向的环境变量'
  );
  if (!path.isAbsolute(filename)) throw new Blocked('secretEnv 必须为显式绝对路径');
  const env = JSON.parse(await readFile(filename, 'utf8'));
  for (const [key, value] of Object.entries({ ...env, ...fixture.env })) {
    if (typeof value !== 'string') throw new Blocked('env/secretEnv 只接受字符串值：' + key);
    if (
      value &&
      /PSW|PASSWORD|TOKEN|SECRET|KEY|REDIS_URL|PG_URL|MONGODB_URI|MONGODB_LOG_URI/i.test(key)
    )
      context.secrets.add(value);
    process.env[key] = value;
  }
  for (const key of ['MONGODB_URI', 'MONGODB_LOG_URI', 'REDIS_URL']) {
    if (!env[key]) continue;
    context.secrets.add(env[key]);
    const uri = new URL(env[key]);
    if (uri.password) context.secrets.add(decodeURIComponent(uri.password));
    if (uri.username) context.secrets.add(decodeURIComponent(uri.username));
  }
  const proUrl = new URL(required(env.PRO_URL, 'secretEnv.PRO_URL'));
  if (!['127.0.0.1', 'localhost'].includes(proUrl.hostname) || proUrl.port !== '3001')
    throw new Blocked('需显式配置本机 Pro3001，不能绕过 3000 代理直调 Pro');
  if (!env.AGENT_SANDBOX_OPENSANDBOX_BASEURL?.trim())
    throw new Blocked('本轮远端文件取证要求配置 AGENT_SANDBOX_OPENSANDBOX_BASEURL（真实 OpenSandbox）');
  return { env, config };
}

/**
 * 串行受控 OpenAI 程序。下一步必须先收到上一工具的真实结果；不会自行伪造工具回执。
 * stopAtEnd 用于返回预览交互后不再请求模型的轮次。
 */
export function createProgram({ steps, finalText, stopAtEnd = false }) {
  let cursor = 0;
  let pending;
  const results = [];
  let ended = false;
  return {
    results,
    async respond(body) {
      if (pending) {
        const message = body.messages.findLast(
          (message) => message.role === 'tool' && message.tool_call_id === pending.call.id
        );
        assert.ok(message, '下一次真实模型请求缺少上一工具回执：' + pending.call.function.name);
        const raw = textContent(message.content);
        let json;
        try {
          json = JSON.parse(raw);
        } catch {
          // AgentLoop 的参数解析失败可先于 Gateway，仍需保留并验证真实错误内容。
        }
        const observed = { name: pending.call.function.name, raw, json };
        results.push(observed);
        await pending.step.verify?.(observed);
        pending = undefined;
      }
      const step = steps[cursor++];
      if (!step) {
        assert.ok(finalText, '模型出现未计划的额外请求，不能自动回答或重试');
        assert.equal(ended, false, '交付后不应继续请求模型');
        ended = true;
        return { content: finalText };
      }
      const available = body.tools?.some((tool) => tool.function?.name === step.name);
      assert.ok(available, '真实模型请求未暴露目标工具：' + step.name);
      const args = typeof step.args === 'function' ? await step.args({ body, results }) : step.args;
      const call = {
        id: 'call_' + newDataId(),
        type: 'function',
        function: {
          name: step.name,
          arguments: typeof args === 'string' ? args : JSON.stringify(args)
        }
      };
      pending = { step, call };
      return { tool_calls: [call] };
    },
    assertFinished() {
      assert.equal(cursor, steps.length + (stopAtEnd ? 0 : 1), '受控程序没有走完全部步骤');
      if (!stopAtEnd) {
        assert.equal(pending, undefined);
        assert.equal(ended, true);
      }
    }
  };
}

/** 使用 OpenAI JSON/SSE 原始协议返回确定响应，支持真实 SDK 的 stream 用量事件。 */
function writeCompletion({ response, body, message }) {
  const id = 'chatcmpl-' + newDataId();
  const common = { id, created: Math.floor(Date.now() / 1000), model: body.model };
  const usage = { prompt_tokens: 128, completion_tokens: 32, total_tokens: 160 };
  const finish = message.tool_calls ? 'tool_calls' : 'stop';
  if (!body.stream) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        ...common,
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: null, ...message },
            finish_reason: finish
          }
        ],
        usage
      })
    );
    return;
  }
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const chunk = (delta, finishReason = null) =>
    response.write(
      'data: ' +
        JSON.stringify({
          ...common,
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta, finish_reason: finishReason }]
        }) +
        '\n\n'
    );
  chunk({ role: 'assistant', content: '' });
  if (message.tool_calls) {
    const call = message.tool_calls[0];
    chunk({
      tool_calls: [
        {
          index: 0,
          id: call.id,
          type: 'function',
          function: { name: call.function.name, arguments: '' }
        }
      ]
    });
    const raw = call.function.arguments;
    // 刻意分块，经过真实 SDK/AgentLoop 参数拼接；不直接调用任何工具。
    for (let i = 0; i < raw.length; i += 97)
      chunk({ tool_calls: [{ index: 0, function: { arguments: raw.slice(i, i + 97) } }] });
  } else {
    chunk({ content: message.content });
  }
  chunk({}, finish);
  response.write(
    'data: ' +
      JSON.stringify({ ...common, object: 'chat.completion.chunk', choices: [], usage }) +
      '\n\n'
  );
  response.end('data: [DONE]\n\n');
}

/**
 * 为一个完整场景提供真实 HTTP、只读 DB/Redis 和 provider 原生文件读取。
 * 所有写业务操作都经 3000；没有 privateDatabase、FLUSH 或共享配置修改。
 */
export async function createBuilderHarness(context) {
  const { env, config } = await prepareFixture(context);
  const c = createScenario(context);
  /** 只读 Mongo 连接仅供本轮精确资源取证；沿用公共场景的连接池和收尾。 */
  c.database = async () => {
    const key = 'mongo:' + required(c.fixture.mongo?.uriEnv, 'mongo.uriEnv');
    if (!context.resources.has(key)) {
      const { MongoClient } = serviceRequire('mongoose').mongo;
      const client = new MongoClient(c.secret(c.fixture.mongo.uriEnv), {
        serverSelectionTimeoutMS: 10000
      });
      try {
        await client.connect();
      } catch (error) {
        await client.close();
        throw new Blocked('Mongo 测试连接失败：' + error.name);
      }
      context.resources.set(key, client.db());
      context.cleanups.unshift(() => client.close());
    }
    return context.resources.get(key);
  };
  const apps = [];
  const models = [];
  const remotes = new Map();
  const upstreamErrors = [];
  const journal = context.itemId + '-requests-and-storage.jsonl';
  context.attachments.push({
    path: journal,
    label: '脱敏 HTTP、受控上游、Mongo、Redis 和远端文件证据'
  });
  let sequence = Promise.resolve();
  let program;
  let server;
  let redis;
  let minio;
  let closed = false;
  const auth = randomBytes(24).toString('hex');
  context.secrets.add(auth);

  /** 先脱敏再落盘；真实连接串、认证文件和环境原文从不进入证据。 */
  async function record(label, value) {
    const event = sanitize({ time: new Date().toISOString(), label, value }, context.secrets);
    c.record(label, event.value);
    sequence = sequence.then(() =>
      appendFile(path.join(context.directory, journal), JSON.stringify(event) + '\n')
    );
    await sequence;
  }

  async function http(params) {
    const request = { method: params.method ?? 'POST', route: params.route, body: params.body };
    await record('HTTP 请求', request);
    let result;
    try {
      result = await c.request(params);
    } catch (error) {
      await record('HTTP 传输失败', {
        request,
        error: { name: error.name, message: error.message }
      });
      throw error;
    }
    await record('HTTP', {
      method: params.method ?? 'POST',
      route: params.route,
      body: params.body,
      result
    });
    return result;
  }

  /** 只投影本轮精确应用、会话和成员，避免读取同团队的其他测试或真实业务。 */
  async function snapshot(app) {
    assert.ok(apps.includes(app), 'Mongo 查询必须属于本脚本创建的应用');
    const query = {
      teamId: new ObjectId(c.fixture.teamId),
      appId: new ObjectId(app.appId),
      tmbId: new ObjectId(c.actor('owner').tmbId),
      sourceType,
      chatId: app.chatId
    };
    const db = await c.database();
    const value = {
      query,
      chats: await db.collection('chats').find(query).toArray(),
      items: await db.collection('chatitems').find(query).sort({ _id: 1 }).toArray()
    };
    await record('Mongo 白名单快照', value);
    return value;
  }

  /** 候选只归档到聊天；持久化画布及发布版本应保持创建后的基线。 */
  async function savedWorkflow(app) {
    assert.ok(apps.includes(app));
    const db = await c.database();
    const query = { _id: new ObjectId(app.appId), teamId: new ObjectId(c.fixture.teamId) };
    const application = await db.collection('apps').findOne(query, {
      projection: { name: 1, intro: 1, type: 1, modules: 1, edges: 1, chatConfig: 1, versionId: 1 }
    });
    const versions = await db
      .collection('app_versions')
      .find({ appId: query._id })
      .sort({ _id: 1 })
      .toArray();
    const value = { application, versions };
    await record('Mongo 画布和发布版本', { query, ...value });
    return value;
  }

  /** 仅查询本轮会话租约和停止信号，不扫描 Redis，也不写测试标记。 */
  async function redisSnapshot(app) {
    assert.ok(apps.includes(app));
    const suffix = [sourceType, app.appId, app.chatId].join(':');
    const leaseKey = 'fastgpt:chat:generation:lease:' + suffix;
    const stopKey = 'fastgpt:agent_runtime_stopping:' + suffix;
    const lease = await redis.get(leaseKey);
    const stop = await redis.get(stopKey);
    const value = {
      leaseKey,
      leasePresent: lease !== null,
      leaseSha256: lease === null ? null : sha256(lease),
      leaseTtlMs: await redis.pttl(leaseKey),
      stopKey,
      stopPresent: stop !== null,
      stopTtlMs: await redis.pttl(stopKey)
    };
    await record('Redis 精确会话键', value);
    return value;
  }

  /** 只连接 Mongo 精确归属的已有 provider 资源，绝不创建/重启 provider 实例。 */
  async function remote(app) {
    if (remotes.has(app.appId)) return remotes.get(app.appId);
    const query = { sourceType, sourceId: app.appId, userId: c.actor('owner').tmbId };
    const instance = await (await c.database())
      .collection('agent_sandbox_instances_v3')
      .findOne(query);
    assert.ok(instance && instance.sandboxId, '缺少本轮真实 OpenSandbox 映射');
    const { Sandbox, SandboxManager, ConnectionConfig } = await import(
      pathToFileURL(sandboxRequire.resolve('@alibaba-group/opensandbox')).href
    );
    const connectionConfig = new ConnectionConfig({
      domain: required(env.AGENT_SANDBOX_OPENSANDBOX_BASEURL, 'OpenSandbox baseUrl'),
      apiKey: required(env.AGENT_SANDBOX_OPENSANDBOX_API_KEY, 'OpenSandbox apiKey'),
      useServerProxy: true,
      requestTimeoutSeconds: 30
    });
    const manager = SandboxManager.create({ connectionConfig });
    try {
      const list = await manager.listSandboxInfos({
        metadata: { sessionId: instance.sandboxId },
        page: 1,
        pageSize: 100
      });
      assert.equal(list.items.length, 1, '本轮 session 应只匹配一个物理 Sandbox');
      assert.ok(!list.pagination?.hasNextPage);
      const item = list.items[0];
      assert.equal(item.metadata?.sessionId, instance.sandboxId);
      const sandbox = await Sandbox.connect({ sandboxId: item.id, connectionConfig });
      const result = { sandbox, physicalId: item.id, logicalId: instance.sandboxId };
      remotes.set(app.appId, result);
      await record('Mongo → OpenSandbox 真实映射', { query, instance, physicalId: item.id });
      return result;
    } finally {
      await manager.close();
    }
  }

  /** provider 原生文件读取；限定本轮会话目录，记录内容、字节数和哈希。 */
  async function readRemote(app, relativePath) {
    const root = '/workspace/sessions/' + encodeURIComponent(app.chatId);
    const filename = path.posix.resolve(root, relativePath);
    assert.ok(filename.startsWith(root + '/'), '禁止读取本轮会话以外的文件');
    const { sandbox, physicalId } = await remote(app);
    const content = Buffer.from(await sandbox.files.readBytes(filename)).toString('utf8');
    // HMAC 本身不是授权凭证，也无需发布原文；保留摘要和实际 payload 即可复核。
    let json;
    try {
      json = JSON.parse(content);
      if (json.signature) context.secrets.add(json.signature);
    } catch {
      /* request.md、plan.md 是纯文本。 */
    }
    await record('OpenSandbox 实际文件', {
      physicalId,
      filename,
      bytes: Buffer.byteLength(content),
      sha256: sha256(content),
      content,
      json
    });
    return { content, json, filename, sha256: sha256(content) };
  }

  /** 使用独立 S3 客户端读取真实归档；仅接受本轮 app/member/chat 的 key。 */
  function storage() {
    if (minio) return minio;
    const { Client } = serviceRequire('minio');
    const url = new URL(required(env.STORAGE_S3_ENDPOINT, 'STORAGE_S3_ENDPOINT'));
    minio = new Client({
      endPoint: url.hostname,
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      useSSL: url.protocol === 'https:',
      accessKey: required(env.STORAGE_ACCESS_KEY_ID, 'STORAGE_ACCESS_KEY_ID'),
      secretKey: required(env.STORAGE_SECRET_ACCESS_KEY, 'STORAGE_SECRET_ACCESS_KEY'),
      region: env.STORAGE_REGION || 'us-east-1'
    });
    return minio;
  }

  function s3Prefix(app) {
    assert.ok(apps.includes(app));
    return ['chat', sourceType, app.appId, c.actor('owner').tmbId, app.chatId].join('/') + '/';
  }

  async function readArchive(app, version) {
    assert.ok(version.s3Key?.startsWith(s3Prefix(app)), '候选 S3 key 不属于本轮资源');
    const bucket = required(env.STORAGE_PRIVATE_BUCKET, 'STORAGE_PRIVATE_BUCKET');
    const stat = await storage().statObject(bucket, version.s3Key);
    const stream = await storage().getObject(bucket, version.s3Key);
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const content = Buffer.concat(chunks).toString('utf8');
    const document = JSON.parse(content);
    await record('S3 实际归档对象', {
      bucket,
      key: version.s3Key,
      stat,
      bytes: Buffer.byteLength(content),
      sha256: sha256(content),
      document
    });
    assert.equal(documentChecksum(document), version.checksum, '真实 S3 文档 checksum 不匹配');
    return document;
  }

  /** 自建应用先登记再断言，异常创建结果也保留 API 取证供人工排查。 */
  async function createApp(variant) {
    const name = 'FG-TEST-builder-' + context.run + '-' + context.itemId + '-' + variant;
    const document = baseline(name);
    const appId = success(
      await http({
        route: '/api/core/app/create',
        body: {
          name,
          type: 'advanced',
          intro: '',
          nodes: document.nodes,
          chatConfig: {},
          edges: [
            {
              source: 'Start',
              sourceHandle: 'Start-source-right',
              target: 'Reply',
              targetHandle: 'Reply-target-left'
            }
          ]
        }
      })
    );
    assert.match(appId, /^[a-f0-9]{24}$/i, '创建应用必须返回真实 ID');
    const app = { appId, name, document, chatId: 'FG-TEST-' + newDataId() };
    apps.push(app);
    document.app.appId = appId;
    app.checksum = documentChecksum(document);
    const query = { _id: new ObjectId(appId), teamId: new ObjectId(c.fixture.teamId) };
    const stored = await (await c.database())
      .collection('apps')
      .findOne(query, { projection: { name: 1, type: 1, modules: 1, edges: 1, chatConfig: 1 } });
    await record('Mongo 本轮应用基线', { query, stored, document, checksum: app.checksum });
    assert.equal(stored?.name, name);
    assert.equal(stored.type, 'advanced');
    app.savedWorkflow = await savedWorkflow(app);
    return app;
  }

  /** 一次完整真实 Builder SSE 请求；不重试写操作，保留原始事件和 Mongo 终态。 */
  async function chat({ app, modelId, content, nextProgram, expectError = false }) {
    program = nextProgram;
    const responseChatItemId = newDataId();
    const result = await http({
      route: chatRoute,
      signal: AbortSignal.timeout(config.requestTimeoutMs ?? 240000),
      body: {
        appId: app.appId,
        chatId: app.chatId,
        responseChatItemId,
        model: modelId,
        messages: [{ role: 'user', content }],
        workflowContext: { document: app.document, checksum: app.checksum }
      }
    });
    if (upstreamErrors.length) throw upstreamErrors[0];
    if (!expectError) {
      success(result);
      assert.ok(result.events.length, 'Builder 应返回 SSE');
      nextProgram.assertFinished();
    }
    await poll(async () => {
      const state = await redisSnapshot(app);
      assert.equal(state.leasePresent, false, 'HTTP 结束后生成租约未释放');
    }, 15000);
    return { result, responseChatItemId, snapshot: await snapshot(app) };
  }

  /** 清理始终执行，仅删除已登记的新应用、新模型及精确 S3 前缀；失败不能判通过。 */
  async function close() {
    if (closed) return;
    closed = true;
    const errors = [];
    const attempt = async (label, fn) => {
      try {
        await fn();
        await record(label, { cleaned: true });
      } catch (error) {
        errors.push({ label, name: error.name, message: error.message });
        await record(label, {
          cleaned: false,
          error: { name: error.name, message: error.message }
        });
      }
    };
    for (const app of [...apps].reverse()) {
      let idle = false;
      await attempt('确认本轮后台生成结束 ' + app.appId, async () => {
        const state = await redisSnapshot(app);
        if (state.leasePresent) {
          success(
            await http({
              route: '/api/v2/chat/stop',
              body: { sourceType, appId: app.appId, chatId: app.chatId }
            })
          );
          await poll(async () => {
            assert.equal(
              (await redisSnapshot(app)).leasePresent,
              false,
              '正常停止后后台生成未收尾'
            );
          }, 30000);
        }
        idle = true;
      });
      // 无法确认生成终止时保留精确资源 ID，禁止一边生成一边删应用/文件。
      if (!idle) continue;
      await attempt('清理本轮会话 ' + app.appId, async () => {
        success(
          await http({
            route: '/api/core/chat/history/batchDelete',
            body: { sourceType, appId: app.appId, chatIds: [app.chatId] }
          })
        );
        const value = await snapshot(app);
        assert.equal(value.items.length + value.chats.length, 0);
      });
      const bound = remotes.get(app.appId);
      if (bound) await attempt('关闭 provider 取证连接', () => bound.sandbox.close());
      await attempt('清理本轮应用 ' + app.appId, async () => {
        const db = await c.database();
        const query = {
          _id: new ObjectId(app.appId),
          teamId: new ObjectId(c.fixture.teamId),
          name: app.name
        };
        assert.ok(
          await db.collection('apps').findOne(query, { projection: { _id: 1 } }),
          '清理前归属核验失败'
        );
        const ids = success(
          await http({ method: 'DELETE', route: '/api/core/app/del?appId=' + app.appId })
        );
        assert.ok(ids.includes(app.appId));
        await poll(async () => {
          const remaining = {
            apps: await db.collection('apps').countDocuments({ _id: query._id }),
            sandboxes: await db
              .collection('agent_sandbox_instances_v3')
              .countDocuments({ sourceType, sourceId: app.appId })
          };
          await record('Mongo 清理核验', { appId: app.appId, remaining });
          assert.equal(remaining.apps + remaining.sandboxes, 0);
        }, 30000);
      });
      await attempt('清理本轮 S3 前缀 ' + app.appId, async () => {
        const bucket = required(env.STORAGE_PRIVATE_BUCKET, 'STORAGE_PRIVATE_BUCKET');
        const prefix = s3Prefix(app);
        const keys = [];
        for await (const item of storage().listObjectsV2(bucket, prefix, true)) {
          assert.ok(item.name?.startsWith(prefix));
          keys.push(item.name);
        }
        for (const key of keys) await storage().removeObject(bucket, key);
        const remaining = [];
        for await (const item of storage().listObjectsV2(bucket, prefix, true))
          remaining.push(item.name);
        await record('S3 精确清理核验', { bucket, prefix, deleted: keys, remaining });
        assert.deepEqual(remaining, []);
      });
    }
    for (const model of [...models].reverse()) {
      await attempt('清理本轮 system 模型 ' + model.modelId, async () => {
        const query = {
          _id: new ObjectId(model.modelId),
          name: model.name,
          scope: 'system',
          testMode: true
        };
        const db = await c.database();
        assert.ok(await db.collection('ai_models').findOne(query, { projection: { _id: 1 } }));
        success(
          await http({
            method: 'DELETE',
            route: '/api/core/ai/model/delete',
            body: { channelType: 'system', modelIds: [model.modelId] }
          })
        );
        assert.equal(await db.collection('ai_models').countDocuments({ _id: query._id }), 0);
      });
    }
    if (server)
      await attempt('关闭本轮受控 HTTP 上游', async () => {
        const done = new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
        server.closeIdleConnections();
        server.closeAllConnections();
        await done;
      });
    redis?.disconnect();
    await sequence;
    if (errors.length) throw new Error('本轮资源清理不完整：' + JSON.stringify(errors));
  }
  context.itemFinalizers.push(close);

  // 认证和连接均来自显式 fixture，不读浏览器配置或借用外部模型 Key。
  await record('本轮执行范围', {
    itemId: context.itemId,
    baseUrl: c.fixture.baseUrl,
    sourceType,
    controlledModelOnly: true,
    databaseWrites: 'HTTP only'
  });
  await c.sessionInfo('owner');
  await c.database();
  const Redis = dalRequire('ioredis');
  redis = new Redis(c.secret(required(c.fixture.redis?.uriEnv, 'redis.uriEnv')), {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    connectTimeout: 10000
  });
  redis.on('error', () => {});
  await redis.connect();
  assert.equal(await redis.ping(), 'PONG');

  server = createServer(async (request, response) => {
    try {
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.authorization, 'Bearer ' + auth);
      assert.match(request.url, /^\/v1\/chat\/completions\/?$/);
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        assert.ok(bytes <= 20 * 1024 * 1024, '受控上游请求超过 20 MiB');
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      await record('受控 OpenAI 实际请求', { route: request.url, body });
      assert.ok(program, '尚未登记受控程序却收到了模型请求');
      const message = await program.respond(body);
      await record('受控 OpenAI 实际响应', { message });
      writeCompletion({ response, body, message });
    } catch (error) {
      upstreamErrors.push(error);
      await record('受控上游断言失败', { name: error.name, message: error.message });
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          error: {
            message: 'FG-TEST controlled upstream assertion failed',
            type: 'test_upstream_error'
          }
        })
      );
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.upstreamPort ?? 0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const name = 'FG-TEST-builder-' + context.run + '-' + context.itemId;
  const modelData = {
    type: 'llm',
    provider: 'openai',
    scope: 'system',
    model: name,
    name,
    isActive: true,
    testMode: true,
    requestUrl: 'http://127.0.0.1:' + port + '/v1/chat/completions',
    requestAuth: auth,
    config: {
      maxContext: 1048576,
      maxResponse: 4096,
      quoteMaxToken: 4096,
      functionCall: true,
      toolChoice: true
    }
  };
  const created = success(
    await http({ route: '/api/core/ai/model/create', body: { channelType: 'system', modelData } })
  );
  assert.match(created?.modelId, /^[a-f0-9]{24}$/i, '必须使用 API 返回的真实模型 ID');
  models.push({ modelId: created.modelId, name });
  const query = { _id: new ObjectId(created.modelId), name, scope: 'system', testMode: true };
  const model = await (await c.database()).collection('ai_models').findOne(query, {
    projection: { model: 1, name: 1, type: 1, scope: 1, testMode: 1, requestUrl: 1, config: 1 }
  });
  await record('Mongo 临时 system 模型', { query, model });
  assert.ok(model, '创建模型未真实持久化');
  return {
    c,
    record,
    http,
    snapshot,
    savedWorkflow,
    redisSnapshot,
    readRemote,
    readArchive,
    createApp,
    chat,
    close,
    modelId: created.modelId
  };
}

/** 新预览任务也使用 v1；不从 schemaVersion 推断成旧版本兼容场景。 */
async function presentPreview({ h, app, expectedText }) {
  const preview = {
    task: { mode: 'new' },
    title: 'FG-TEST 确认后修复',
    summary: '接收用户输入，将指定回复内容改为 ' + expectedText + '；确认后执行。',
    mermaid: 'flowchart TD\n  Start[输入] --> Reply[指定回复]',
    sections: [
      {
        title: '执行方案',
        content: '保留 Start 到 Reply 的连线，只将 Reply.text 修改为 ' + expectedText + '。'
      }
    ]
  };
  const result = await h.chat({
    app,
    modelId: h.modelId,
    content: '将指定回复改为固定文本 ' + expectedText + '。请先展示方案，等我点击确认后再搭建。',
    nextProgram: createProgram({
      steps: [{ name: 'workflow_builder_present_preview', args: preview }],
      stopAtEnd: true
    })
  });
  const events = result.result.events.filter((event) => event.event === 'interactive');
  assert.equal(events.length, 1);
  const interactive = events[0].data.interactive;
  assert.equal(interactive.type, 'workflowBuilderPreview');
  const task = result.snapshot.chats[0]?.metadata?.workflowBuilderTask;
  assert.ok(task?.preview);
  assert.equal(task.schemaVersion, 1, '本轮新建预览任务应使用 v1');
  assert.equal(task.preview.previewId, interactive.params.toolCallId);
  assert.equal(task.delivery, undefined);
  const index = await h.readRemote(app, 'task-memory/index.json');
  assert.equal(index.json.payload.hasTasks, true);
  assert.equal(index.json.payload.currentTaskId, task.taskId);
  const entry = index.json.payload.tasks.find((entry) => entry.taskId === task.taskId);
  assert.ok(entry?.planFile, '预览必须存在完整方案文件');
  await h.readRemote(app, entry.path + '/request.md');
  await h.readRemote(app, entry.planFile);
  return { task, entry, preview };
}

/** 仅在真实错误可见后修复，验证唯一候选的 HTTP、Mongo、Sandbox 与 S3 完整证据。 */
async function runRepairVariants(context, capability) {
  const h = await createBuilderHarness(context);
  for (const variant of capabilities[capability].variants) {
    const app = await h.createApp(variant);
    const expectedText = 'FG-TEST-' + variant + '-' + newDataId();
    const { task } = await presentPreview({ h, app, expectedText });
    const finalText = 'FG-TEST 已交付候选 ' + expectedText;
    const malformed =
      variant === 'invalid-json'
        ? '{"action":"upsert","chunk":'
        : {
            action: 'upsert',
            chunk: {
              schemaVersion: 'fastgpt-workflow-chunk/v1',
              chunkId: 'repair-main',
              commands: 'invalid-command-type'
            }
          };
    const stage = {
      action: 'upsert',
      chunk: {
        schemaVersion: 'fastgpt-workflow-chunk/v1',
        chunkId: 'repair-main',
        commands: [{ type: 'input.set', nodeId: 'Reply', inputKey: 'text', value: expectedText }]
      }
    };
    const firstSteps = (() => {
      if (capability === 'domain-repair') {
        const invalidStage = structuredClone(stage);
        invalidStage.chunk.commands = [
          { type: 'config.set', path: 'FG_TEST_NOT_WRITABLE', value: expectedText }
        ];
        return [
          {
            name: 'workflow_cli_stage',
            args: invalidStage,
            verify: ({ json }) => {
              assert.equal(
                json?.ok,
                true,
                '合法领域命令应先进入草稿，不能用 schema 错误替代领域诊断'
              );
              assert.equal(json.state, 'staged');
            }
          },
          {
            name: 'workflow_cli_query',
            args: { action: 'validate', view: 'draft' },
            verify: ({ json, raw }) => {
              assert.equal(json?.ok, false, '不可写配置路径必须阻止有效草稿');
              assert.ok(
                raw.includes('WORKFLOW_CHAT_CONFIG_PATH_NOT_ALLOWED'),
                '缺少不可写路径的真实领域诊断'
              );
              assert.ok(raw.includes('FG_TEST_NOT_WRITABLE'), '诊断必须能定位失败路径');
            }
          }
        ];
      }
      return [
        {
          name: 'workflow_cli_stage',
          args: malformed,
          verify: ({ json, raw }) => {
            assert.ok(
              json?.ok === false || /error|invalid|failed|错误|失败/i.test(raw),
              '坏参数必须先产生真实工具错误'
            );
            assert.notEqual(json?.state, 'staged');
          }
        }
      ];
    })();
    const program = createProgram({
      steps: [
        ...firstSteps,
        {
          name: 'workflow_cli_stage',
          args: stage,
          verify: ({ json }) => {
            assert.equal(json?.ok, true);
            assert.equal(json.state, 'staged');
            assert.equal(json.taskId, task.taskId);
          }
        },
        {
          name: 'workflow_cli_query',
          args: { action: 'chunk_list', view: 'draft' },
          verify: ({ json }) => {
            assert.equal(json?.ok, true);
            assert.equal(json.result.chunkCount, 1);
            assert.deepEqual(
              json.result.chunks.map((chunk) => chunk.chunkId),
              ['repair-main'],
              '修复应替换同一分片，不能遗留失败或重复 chunk'
            );
          }
        },
        {
          name: 'workflow_cli_query',
          args: { action: 'validate', view: 'draft' },
          verify: ({ json }) => {
            assert.equal(json?.ok, true);
            assert.equal(json.command, 'draft validate');
            assert.equal(json.state, 'valid');
            assert.match(json.draftRevision, /^sha256:[a-f0-9]{64}$/);
          }
        },
        {
          name: 'workflow_cli_commit',
          args: ({ results }) => ({ draftRevision: results.at(-1).json.draftRevision }),
          verify: ({ json }) => {
            assert.equal(json?.ok, true);
            assert.equal(json.state, 'candidate_ready');
            assert.equal(json.taskComplete, true);
            assert.ok(json.version.s3Key, '未真实 S3 归档不能交付');
          }
        }
      ],
      finalText
    });
    const after = await h.chat({
      app,
      modelId: h.modelId,
      content: [{ type: 'select', select: { type: 'workflowBuilderPreview', action: 'confirm' } }],
      nextProgram: program
    });
    assert.equal(
      after.result.events.filter((event) => event.event === 'interactive').length,
      0,
      '修复不应追加 Ask/preview'
    );
    assert.ok(after.result.text.includes(finalText), '必须在候选交付后返回最终文本');
    const versions = after.result.events.filter(
      (event) => event.event === 'workflowBuilderVersion'
    );
    assert.equal(versions.length, 1, '每轮只允许交付一个版本');
    const version = versions[0].data.version;
    const candidateItems = after.snapshot.items.filter(
      (item) => item.obj === 'AI' && item.value.some((value) => value.workflowBuilderVersion)
    );
    assert.equal(candidateItems.length, 1, 'Mongo 必须只绑定唯一候选');
    const candidate = candidateItems[0];
    assert.equal(candidate.dataId, after.responseChatItemId);
    const storedVersion = candidate.value.find(
      (value) => value.workflowBuilderVersion
    ).workflowBuilderVersion;
    assert.deepEqual(storedVersion, version);
    const persisted = after.snapshot.chats[0].metadata.workflowBuilderTask;
    assert.equal(persisted.taskId, task.taskId);
    assert.equal(persisted.schemaVersion, 1);
    assert.deepEqual(persisted.delivery.version, version);
    assert.equal(persisted.delivery.responseChatItemId, after.responseChatItemId);
    const human = after.snapshot.items.find(
      (item) => item.obj === 'Human' && item.dataId === after.responseChatItemId
    );
    assert.ok(
      human?.value.some(
        (value) =>
          value.select?.type === 'workflowBuilderPreview' && value.select.action === 'confirm'
      ),
      '确认事实必须真实落库'
    );
    const loaded = success(
      await h.http({
        route: '/api/proApi/core/workflow/builder/version/load',
        body: { appId: app.appId, chatId: app.chatId, responseChatItemId: candidate.dataId }
      })
    );
    assert.equal(loaded.source, 's3');
    assert.equal(loaded.checksum, version.checksum);
    const archived = await h.readArchive(app, version);
    assert.deepEqual(archived, loaded.document);
    const expectedDocument = structuredClone(app.document);
    expectedDocument.nodes
      .find((node) => node.nodeId === 'Reply')
      .inputs.find((input) => input.key === 'text').value = expectedText;
    assert.deepEqual(
      archived,
      expectedDocument,
      '候选只允许修改 Reply.text，不能删除结构、修改配置或混入失败命令'
    );
    const index = await h.readRemote(app, 'task-memory/index.json');
    const entry = index.json.payload.tasks.find((entry) => entry.taskId === task.taskId);
    assert.equal(entry.active, false);
    const taskFile = await h.readRemote(app, entry.path + '/task.json');
    assert.deepEqual(taskFile.json.payload.task.delivery.version, version);
    assert.deepEqual(
      await h.savedWorkflow(app),
      app.savedWorkflow,
      '候选生成不能自动保存或发布到画布'
    );
    await h.record('完整变体通过', {
      variant,
      appId: app.appId,
      chatId: app.chatId,
      taskId: task.taskId,
      version,
      actualToolResults: program.results
    });
  }
  return (
    capabilities[capability].variants.join('、') +
    ' 均在真实确认后先取得错误/领域诊断，再修复 stage → draft validate → commit → 最终文本；无追加 Ask/preview；候选精确差集及 Mongo、OpenSandbox、S3 一致。仅覆盖确定工具协议，不覆盖真实 LLM 自然语言决策。'
  );
}

/** 052 C3：损坏 JSON 与 commands 参数类型两个独立变体。 */
export async function confirmedRepair(context) {
  return runRepairVariants(context, 'confirmed-repair');
}

/** 052 C4：已暂存的不可写配置路径由真实 CLI 返回领域诊断，再替换原分片交付。 */
export async function domainRepair(context) {
  return runRepairVariants(context, 'domain-repair');
}

/** 场景编号只接受主代理显式矩阵；未实现能力不会自动套用到任意 C 编号。 */
export function createHandlers(mapping) {
  const implemented = { 'confirmed-repair': confirmedRepair, 'domain-repair': domainRepair };
  return Object.fromEntries(
    Object.entries(mapping).map(([item, capability]) => [
      item,
      async (context) => {
        const handler = implemented[capability];
        if (!handler) throw new Blocked('未实现完整自动化能力：' + capability);
        return handler(context);
      }
    ])
  );
}

async function main() {
  if (process.argv.includes('--describe')) {
    console.log(
      JSON.stringify(
        {
          capabilities,
          fixture: {
            version: 1,
            isolated: true,
            baseUrl: 'http://127.0.0.1:3000',
            teamId: '<teamId>',
            actors: { owner: { tmbId: '<tmbId>', stateEnv: 'FG_BUILDER_STATE' } },
            env: { FG_BUILDER_STATE: '/tmp/fastgpt-builder-it-20261106/state.json' },
            secretEnv: '/tmp/fastgpt-builder-it-20261106/service-env.json',
            mongo: { uriEnv: 'MONGODB_URI' },
            redis: { uriEnv: 'REDIS_URL' },
            workflowBuilder: { report: '/本轮报告/report.html', scenarioMap: defaultScenarioMap }
          }
        },
        null,
        2
      )
    );
    return;
  }
  const fixture = await loadFixture();
  const caseId = required(process.env.FASTGPT_TEST_CASE_ID, 'FASTGPT_TEST_CASE_ID');
  const mapping = required(
    fixture.workflowBuilder?.scenarioMap?.[caseId] ?? defaultScenarioMap[caseId],
    'workflowBuilder.scenarioMap.' + caseId
  );
  await runNodeCase(caseId, createHandlers(mapping));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // 前置失败时也不输出夹具或异常中的连接串；业务结果由 runNodeCase 写证据。
    console.error('Workflow Builder integration entry failed: ' + error.name);
    process.exitCode = 1;
  });
}

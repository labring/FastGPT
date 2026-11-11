import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp, chmod } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createServer as netServer } from 'node:net';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRedisProxy } from './redis-proxy.mjs';
import { deriveIsolatedConnections } from './isolated-dependencies.mjs';
import { startWorkflowFixtureServer } from '../app/workflow/execution/workflow-fixture-server.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));

/** 为本轮主站与 Pro 使用远端独立数据库；禁止创建本地数据库或读取共享业务数据。 */
export async function startPrivateEnvironment({
  sourceEnv,
  proSourceEnv,
  port = 3100,
  proPort = 3101,
  redisDb = 11,
  directory,
  serverRoot = repo,
  seedHistory = true,
  webpack = false
}) {
  const req = createRequire(path.join(repo, 'package.json'));
  const appReq = createRequire(path.join(repo, 'projects/app/package.json'));
  const serviceReq = createRequire(path.join(repo, 'packages/service/package.json'));
  const { MongoClient, ObjectId } = createRequire(path.join(repo, 'packages/service/package.json'))(
    'mongoose'
  ).mongo;
  const { request } = req('@playwright/test');
  const dotenv = createRequire(appReq.resolve('next/package.json'))('dotenv');
  const inherited = dotenv.parse(await readFile(sourceEnv, 'utf8'));
  const proInherited = dotenv.parse(await readFile(proSourceEnv, 'utf8'));
  if (!inherited.PRO_TOKEN || inherited.PRO_TOKEN !== proInherited.PRO_TOKEN) {
    throw Error('主站与 Pro 的认证配置不一致');
  }
  const id = randomUUID().replaceAll('-', '');
  const {
    database,
    mongoUri: uri,
    mongoLogUri: logUri,
    redisUri,
    pgUri
  } = deriveIsolatedConnections({
    mongoUri: process.env.FASTGPT_TEST_MONGODB_URI,
    redisUri: process.env.SANDBOX_INTEGRATION_REDIS_URL,
    pgUri: inherited.PG_URL,
    runId: id,
    redisDb
  });
  const nonce = randomBytes(24).toString('hex');
  const rootPassword = randomBytes(18).toString('hex');
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  directory ??= await mkdtemp(path.join(tmpdir(), 'fastgpt-private-'));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const resources = [],
    ledger = {
      id,
      database,
      directory,
      port,
      proPort,
      redisDb,
      parentPid: process.pid,
      children: []
    };
  const save = () =>
    writeFile(path.join(directory, 'ledger.json'), JSON.stringify(ledger, null, 2), {
      mode: 0o600
    });
  await save();

  async function freePort() {
    const server = netServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const value = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    return value;
  }
  function child({ command, args, ...options }) {
    const stream = createWriteStream(path.join(directory, options.log ?? 'process.log'), {
      mode: 0o600
    });
    const process = spawn(command, args, {
      ...options,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    process.stdout.pipe(stream);
    process.stderr.pipe(stream);
    ledger.children.push({ pid: process.pid, command, args });
    resources.push(async () => {
      if (process.exitCode === null) {
        global.process.kill(-process.pid, 'SIGTERM');
        await Promise.race([
          once(process, 'exit'),
          new Promise((resolve) => setTimeout(resolve, 10000))
        ]);
        if (process.exitCode === null) global.process.kill(-process.pid, 'SIGKILL');
      }
      stream.end();
    });
    return process;
  }
  let closing;
  function close() {
    return (closing ??= (async () => {
      const errors = [];
      for (const cleanup of [...resources].reverse())
        await cleanup().catch((error) => errors.push(error.message));
      await writeFile(
        path.join(directory, 'environment-cleanup.json'),
        JSON.stringify({ id, errors, closedAt: new Date().toISOString() }, null, 2)
      );
      if (errors.length) throw Error('私有环境清理失败：' + errors.join(';'));
    })());
  }
  // 启动阶段也处理退出，避免首次编译中断后遗留本轮服务与隔离库。
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () =>
      close().then(
        () => process.exit(0),
        () => process.exit(1)
      )
    );
  try {
    // 只操作随机命名的远端库，创建前确认两个 Mongo 库均不存在数据。
    const admin = await new MongoClient(uri, { serverSelectionTimeoutMS: 10000 }).connect();
    resources.push(async () => admin.close());
    const db = admin.db(database);
    const logDb = admin.db(`${database}_log`);
    if ((await db.listCollections().hasNext()) || (await logDb.listCollections().hasNext())) {
      throw Error('随机 Mongo 测试库已存在，拒绝复用');
    }
    await db.collection('fg_test_environment').insertOne({ _id: id, nonce });
    resources.push(async () => {
      const marker = await db.collection('fg_test_environment').findOne({ _id: id, nonce });
      if (!marker) throw Error('Mongo 测试库归属标记缺失，拒绝清理');
      await logDb.dropDatabase();
      await db.dropDatabase();
    });

    // 独立 PostgreSQL 数据库比复用 public schema 更安全；只清理由本轮创建的精确名称。
    const { Client: PgClient } = serviceReq('pg');
    const pg = new PgClient({ connectionString: inherited.PG_URL, connectionTimeoutMillis: 10000 });
    await pg.connect();
    resources.push(() => pg.end());
    const existingPg = await pg.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (existingPg.rowCount) throw Error('随机 PostgreSQL 测试库已存在，拒绝复用');
    await pg.query(`CREATE DATABASE "${database}"`);
    resources.push(() => pg.query(`DROP DATABASE "${database}" WITH (FORCE)`));

    const teamId = new ObjectId(),
      now = new Date();
    const actors = {};
    for (const role of ['owner', 'A', 'B', 'N']) {
      const userId = new ObjectId(),
        tmbId = new ObjectId();
      const username =
        role === 'owner' ? 'root' : 'fgtest-' + role.toLowerCase() + '-' + id.slice(0, 8);
      await db.collection('users').insertOne({
        _id: userId,
        username,
        password: hash(hash(rootPassword)),
        status: 'active',
        language: 'zh-CN',
        timezone: 'Asia/Shanghai',
        lastLoginTmbId: tmbId,
        createTime: now
      });
      await db.collection('team_members').insertOne({
        _id: tmbId,
        userId,
        teamId,
        name: 'FG-TEST-' + role,
        isSetMemberName: true,
        status: 'active',
        role: role === 'owner' ? 'owner' : 'member',
        defaultTeam: role === 'owner',
        createTime: now,
        avatar: '/icon/logo.svg'
      });
      actors[role] = {
        username,
        tmbId: String(tmbId),
        userId: String(userId),
        name: 'FG-TEST-' + role
      };
    }
    await db.collection('teams').insertOne({
      _id: teamId,
      ownerId: new ObjectId(actors.owner.userId),
      name: 'FG-TEST private team',
      avatar: '/icon/logo.svg',
      balance: 1000000,
      createTime: now
    });
    // Redis DB 必须为空且由本轮抢占；绝不 FLUSHDB 或删除不属于本轮的键。
    const Redis = createRequire(path.join(repo, 'packages/dal/package.json'))('ioredis');
    const redis = new Redis(redisUri, { maxRetriesPerRequest: 0, connectTimeout: 10000 });
    resources.push(async () => redis.quit());
    if ((await redis.dbsize()) !== 0) throw Error('指定 Redis 测试 DB 非空，拒绝复用');
    const lockKey = 'fgtest:environment:owner';
    if ((await redis.set(lockKey, nonce, 'EX', 43200, 'NX')) !== 'OK') {
      throw Error('指定 Redis 测试 DB 已被占用');
    }
    resources.push(async () => {
      const release =
        'if redis.call("GET",KEYS[1]) == ARGV[1] then return redis.call("DEL",KEYS[1]) end return 0';
      await redis.eval(release, 1, lockKey, nonce);
      await redis.eval(release, 1, 'fgtest:environment:' + id, nonce);
    });
    if ((await redis.dbsize()) !== 1) throw Error('Redis 测试 DB 被并发占用');
    await redis.set('fgtest:environment:' + id, nonce, 'EX', 43200);

    const proxy = await createRedisProxy({ upstream: redisUri });
    resources.push(() => proxy.close());
    const proxyUri = new URL(redisUri);
    const proxyAddress = new URL(proxy.url);
    proxyUri.hostname = proxyAddress.hostname;
    proxyUri.port = proxyAddress.port;
    const workflowGate = await startWorkflowFixtureServer();
    resources.push(() => workflowGate.close());
    const gatePort = await freePort();
    const control = createServer(async (req, res) => {
      if (req.method !== 'POST' || req.headers.authorization !== 'Bearer ' + nonce) {
        res.writeHead(403).end();
        return;
      }
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks));
        if (body.action === 'rule') proxy.setRule(body.rule);
        if (body.action === 'clear') proxy.setRule(undefined);
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ observations: proxy.observations.slice(body.after ?? 0) }));
      } catch {
        res.writeHead(400).end();
      }
    });
    control.listen(0, '127.0.0.1');
    await once(control, 'listening');
    resources.push(async () => {
      control.closeAllConnections();
      await new Promise((resolve) => control.close(resolve));
    });
    const isolatedEnv = {
      NODE_ENV: 'development',
      MONGODB_URI: uri,
      MONGODB_LOG_URI: logUri,
      REDIS_URL: proxyUri.toString(),
      PG_URL: pgUri,
      // 上传和预览链接必须回到本轮主站，不能沿用共享 Dev 的 3000 端口。
      FE_DOMAIN: `http://127.0.0.1:${port}`,
      AGENT_USERS: '',
      SYNC_INDEX: 'false',
      STREAM_RESUME_TTL_SECONDS: '30',
      STREAM_RESUME_POST_COMPLETE_TTL_SECONDS: '4',
      STREAM_RESUME_REDIS_MEMORY_CHECK_INTERVAL_MS: '20',
      STREAM_RESUME_REDIS_MAXMEMORY_RATIO: '0.5'
    };
    const env = {
      ...process.env,
      ...inherited,
      ...isolatedEnv,
      PRO_URL: `http://127.0.0.1:${proPort}`
    };
    const proEnv = { ...process.env, ...proInherited, ...isolatedEnv };
    await writeFile(path.join(directory, 'service-env.json'), JSON.stringify(env), { mode: 0o600 });
    // 使用各项目 dev 脚本及各自工作树依赖；两个进程均只指向上面的隔离数据库。
    const pro = child({
      command: 'pnpm',
      args: ['--dir', 'pro/admin', 'dev', '--hostname', '127.0.0.1', '--port', String(proPort)],
      cwd: serverRoot,
      env: proEnv,
      log: 'pro.log'
    });
    const app = child({
      command: 'pnpm',
      args: [
        '--dir',
        'projects/app',
        'dev',
        ...(webpack ? ['--webpack'] : []),
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port)
      ],
      cwd: serverRoot,
      env,
      log: 'app.log'
    });
    const baseUrl = 'http://127.0.0.1:' + port;
    const proUrl = 'http://127.0.0.1:' + proPort;
    for (let index = 0; index < 180; index++) {
      if (app.exitCode !== null) throw Error('私有主站已退出，见 app.log');
      if (pro.exitCode !== null) throw Error('私有 Pro 已退出，见 pro.log');
      try {
        const [appHealth, proHealth] = await Promise.all([
          fetch(baseUrl + '/api/support/user/account/preLogin?username=root', {
            signal: AbortSignal.timeout(3000)
          }),
          fetch(proUrl + '/api/health', {
            headers: { 'x-fastgpt-pro-token': inherited.PRO_TOKEN },
            signal: AbortSignal.timeout(3000)
          })
        ]);
        const proResult = await proHealth.json();
        if (appHealth.status === 200 && proHealth.status === 200 && proResult.data?.auth) break;
      } catch {}
      if (index === 179) throw Error('私有主站或 Pro 启动超时，见进程日志');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const secrets = {
      FASTGPT_TEST_SERVICE_ENV: path.join(directory, 'service-env.json'),
      FASTGPT_TEST_MONGO_URI: uri,
      FASTGPT_TEST_MONGO_LOG_URI: logUri,
      FASTGPT_TEST_MONGO_WRITE_URI: uri,
      FASTGPT_TEST_REDIS_URI: redisUri,
      FASTGPT_TEST_PRIVATE_NONCE: nonce,
      FASTGPT_TEST_GATE_TOKEN: nonce
    };
    for (const [role, actor] of Object.entries(actors)) {
      const context = await request.newContext({
        baseURL: baseUrl,
        extraHTTPHeaders: { 'fastgpt-web-request': '1' },
        timeout: 120000
      });
      try {
        const pre = await (
          await context.get('/api/support/user/account/preLogin?username=' + actor.username)
        ).json();
        const login = await (
          await context.post('/api/support/user/account/loginByPassword', {
            data: {
              username: actor.username,
              password: hash(rootPassword),
              code: pre.data?.code,
              language: 'zh-CN'
            }
          })
        ).json();
        if (login.code !== 200 || !login.data?.user)
          throw Error(role + ' 私有登录失败，业务码 ' + login.code);
        actor.stateEnv = 'FASTGPT_TEST_' + role.toUpperCase() + '_STATE';
        secrets[actor.stateEnv] = path.join(directory, role + '-state.json');
        await context.storageState({ path: secrets[actor.stateEnv] });
        await chmod(secrets[actor.stateEnv], 0o600);
      } finally {
        await context.dispose();
      }
    }
    const owner = await request.newContext({
      baseURL: baseUrl,
      storageState: secrets.FASTGPT_TEST_OWNER_STATE,
      extraHTTPHeaders: { 'fastgpt-web-request': '1' },
      timeout: 120000
    });
    resources.push(() => owner.dispose());
    const tsx = appReq('tsx/cjs/api'),
      load = (file) =>
        tsx.require(path.join(repo, file), path.join(repo, 'projects/app/probe.cjs'));
    const { WorkflowStart } = load(
      'packages/global/core/workflow/template/system/workflowStart.ts'
    );
    const { AssignedAnswerModule } = load(
      'packages/global/core/workflow/template/system/assignedAnswer.ts'
    );
    const { HttpNode468 } = load('packages/global/core/workflow/template/system/http468.ts');
    const { NodeInputKeyEnum } = load('packages/global/core/workflow/constants.ts');
    const { ReadRoleVal, OwnerRoleVal } = load('packages/global/support/permission/constant.ts');
    const edge = (source, target) => ({
      source,
      sourceHandle: source + '-source-right',
      target,
      targetHandle: target + '-target-left'
    });
    function graph({ stages = false, pieces = 1, legacyVariables = false } = {}) {
      const nodes = [
        {
          ...structuredClone(WorkflowStart),
          nodeId: 'Start',
          name: 'Start',
          position: { x: 0, y: 0 }
        }
      ];
      function answer(id, text) {
        const node = {
          ...structuredClone(AssignedAnswerModule),
          nodeId: id,
          name: id,
          position: { x: nodes.length * 300, y: 0 }
        };
        node.inputs.find((input) => input.key === NodeInputKeyEnum.answerText).value = text;
        nodes.push(node);
      }
      if (stages) {
        for (let index = 0; index < pieces; index++)
          answer('Prefix' + index, '{{$Start.userChatInput$}}|P' + String(index).padStart(2, '0'));
        const gate = {
          ...structuredClone(HttpNode468),
          nodeId: 'Gate',
          name: 'Gate',
          position: { x: nodes.length * 300, y: 0 }
        };
        for (const [key, value] of [
          [NodeInputKeyEnum.httpReqUrl, `http://127.0.0.1:${gatePort}/wait`],
          [NodeInputKeyEnum.httpTimeout, 100],
          [NodeInputKeyEnum.httpHeaders, [{ key: 'x-fastgpt-test-token', value: nonce }]],
          [NodeInputKeyEnum.httpJsonBody, JSON.stringify({ runId: '{{$Start.userChatInput$}}' })]
        ])
          gate.inputs.find((input) => input.key === key).value = value;
        nodes.push(gate);
        answer('Tail', '{{$Start.userChatInput$}}|TAIL');
      } else answer('Reply', '{{$Start.userChatInput$}}|{{$VARIABLE_NODE_ID.userId$}}');
      return {
        nodes,
        edges: nodes.slice(1).map((node, index) => edge(nodes[index].nodeId, node.nodeId)),
        chatConfig: legacyVariables
          ? {
              variables: [
                {
                  key: 'fgFixture',
                  label: '历史测试变量',
                  type: 'input',
                  valueType: 'string',
                  description: '独立库历史变量保留验证',
                  required: false,
                  defaultValue: ''
                }
              ]
            }
          : {}
      };
    }
    const apps = {};
    async function publish(appId, value) {
      const r = await (
        await owner.post('/api/core/app/version/publish?appId=' + appId, {
          data: { ...value, isPublish: true, versionName: 'FG-TEST private' }
        })
      ).json();
      if (r.code !== 200) throw Error('私有发布失败 ' + r.code);
    }
    // 工作流运行回归自行生成图，不额外创建历史列表回归的应用与 201 轮对话。
    for (const name of seedHistory
      ? ['resume', 'history', 'historySwitch', 'database', 'other', 'empty']
      : []) {
      const g = graph({
        stages: ['resume', 'historySwitch', 'database'].includes(name),
        pieces: name === 'resume' ? 55 : 1,
        legacyVariables: name === 'database'
      });
      const r = await (
        await owner.post('/api/core/app/create', {
          data: { type: 'advanced', name: 'FG-TEST-' + id + '-' + name, ...g }
        })
      ).json();
      if (r.code !== 200) throw Error('私有应用创建失败 ' + r.code);
      apps[name] = r.data;
      await publish(r.data, g);
      await db
        .collection('apps')
        .updateOne(
          { _id: new ObjectId(r.data) },
          { $set: { tmbId: new ObjectId(actors[name === 'other' ? 'B' : 'A'].tmbId) } }
        );
      // 原生夹具转移 owner 后同步其 ACL，保持列表查询与详情鉴权一致。
      await db.collection('resource_permissions').updateOne(
        {
          teamId,
          resourceId: new ObjectId(r.data),
          resourceType: 'app',
          tmbId: new ObjectId(actors[name === 'other' ? 'B' : 'A'].tmbId)
        },
        { $set: { permission: OwnerRoleVal } },
        { upsert: true }
      );
      if (name !== 'other')
        await db.collection('resource_permissions').insertOne({
          teamId,
          resourceId: new ObjectId(r.data),
          resourceType: 'app',
          tmbId: new ObjectId(actors.B.tmbId),
          permission: ReadRoleVal
        });
    }
    for (const role of seedHistory ? ['A', 'B', 'N'] : []) {
      const r = await (
        await owner.post('/api/support/openapi/create', {
          data: { name: 'FG-TEST-' + id + '-' + role }
        })
      ).json();
      if (r.code !== 200) throw Error('私有 Key 创建失败 ' + r.code);
      await db
        .collection('openapis')
        .updateOne({ apiKey: r.data }, { $set: { tmbId: new ObjectId(actors[role].tmbId) } });
      actors[role].keyEnv = 'FASTGPT_TEST_' + role + '_KEY';
      secrets[actors[role].keyEnv] = r.data;
    }
    const a = await request.newContext({
      baseURL: baseUrl,
      storageState: secrets.FASTGPT_TEST_A_STATE,
      extraHTTPHeaders: { 'fastgpt-web-request': '1' },
      timeout: 120000
    });
    resources.push(() => a.dispose());
    const records = [];
    for (let index = 0; index < (seedHistory ? 201 : 0); index++) {
      const chatId = 'fgfixture-' + id + '-' + String(index).padStart(3, '0');
      const r = await (
        await a.post('/api/v2/chat/completions', {
          data: {
            appId: apps.history,
            chatId,
            stream: false,
            messages: [
              { role: 'user', content: 'FG-TEST history ' + String(index).padStart(3, '0') }
            ]
          }
        })
      ).json();
      if (!r.choices)
        throw Error(
          '私有历史准备失败 ' + JSON.stringify({ code: r.code, statusText: r.statusText })
        );
      records.push(chatId);
    }
    if (seedHistory) await publish(apps.history, graph({ stages: true }));
    const shared = seedHistory
      ? await (
          await owner.post('/api/support/outLink/create', {
            data: {
              appId: apps.history,
              type: 'share',
              name: 'FG-TEST history visitors',
              allowAnonymous: true,
              app: {}
            }
          })
        ).json()
      : undefined;
    if (shared && shared.code !== 200) throw Error('私有分享创建失败 ' + shared.code);
    const fixture = {
      version: 1,
      isolated: true,
      baseUrl,
      teamId: String(teamId),
      actors,
      apps: { ...apps, gate: apps.database, identity: apps.database },
      lifecycle: { disposeApps: Object.values(apps) },
      echoTemplate: '\n{{question}}|{{userId}}',
      mongo: {
        uriEnv: 'FASTGPT_TEST_MONGO_URI',
        logUriEnv: 'FASTGPT_TEST_MONGO_LOG_URI',
        writeUriEnv: 'FASTGPT_TEST_MONGO_WRITE_URI'
      },
      redis: { uriEnv: 'FASTGPT_TEST_REDIS_URI' },
      gate: { port: gatePort, bindHost: '127.0.0.1', tokenEnv: 'FASTGPT_TEST_GATE_TOKEN' },
      workflowRuntime: {
        gateUrl: workflowGate.baseUrl,
        commit: execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: serverRoot,
          encoding: 'utf8'
        }).trim()
      },
      privateEnvironment: {
        id,
        database,
        nonceEnv: 'FASTGPT_TEST_PRIVATE_NONCE',
        serviceEnvFileEnv: 'FASTGPT_TEST_SERVICE_ENV',
        controlUrl: `http://127.0.0.1:${control.address().port}`
      },
      stream: { prefixPieces: 55, postCompleteTtl: 4, streamTtl: 30 },
      history: {
        appId: apps.history,
        switchAppId: apps.historySwitch,
        otherAppId: apps.other,
        chatIds: records,
        url: '/chat?appId=' + apps.history
      }
    };
    if (shared) {
      fixture.history.shareId = shared.data;
      fixture.history.url += '&pane=ra';
    } else {
      delete fixture.history;
    }
    const fixturePath = path.join(directory, 'fixture.json');
    secrets.FASTGPT_TEST_FIXTURE = fixturePath;
    await writeFile(fixturePath, JSON.stringify(fixture, null, 2), { mode: 0o600 });
    await writeFile(path.join(directory, 'secrets.json'), JSON.stringify(secrets), { mode: 0o600 });
    await save();
    return { fixture, secrets, directory, close };
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index]?.slice(2),
      value = process.argv[index + 1];
    if (
      ![
        'source-env',
        'pro-source-env',
        'port',
        'pro-port',
        'redis-db',
        'directory',
        'app-root'
      ].includes(key) ||
      !value
    )
      throw Error('无效环境参数');
    args[key] = value;
  }
  const environment = await startPrivateEnvironment({
    sourceEnv: args['source-env'],
    proSourceEnv: args['pro-source-env'],
    port: Number(args.port ?? 3100),
    proPort: Number(args['pro-port'] ?? 3101),
    redisDb: Number(args['redis-db'] ?? 11),
    directory: args.directory,
    serverRoot: args['app-root'],
    seedHistory: false
  });
  console.log(
    JSON.stringify({
      prepared: true,
      directory: environment.directory,
      baseUrl: environment.fixture.baseUrl
    })
  );
}

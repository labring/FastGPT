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

const repo = fileURLToPath(new URL('../../../', import.meta.url));

/** 启动本轮专用 Mongo replica set、Redis 和主站；只复制显式环境文件的连接配置，不复制业务数据。 */
export async function startPrivateEnvironment({
  sourceEnv,
  port = 3100,
  mongoBinary,
  directory,
  serverRoot = repo,
  profile = 'history'
}) {
  if (!['history', 'app-key'].includes(profile)) throw Error('未知测试环境 profile');
  const req = createRequire(path.join(repo, 'package.json'));
  const appReq = createRequire(path.join(repo, 'projects/app/package.json'));
  const { MongoClient, ObjectId } = createRequire(path.join(repo, 'packages/service/package.json'))(
    'mongoose'
  ).mongo;
  const { request } = req('@playwright/test');
  const envText = await readFile(sourceEnv, 'utf8');
  const { processEnv } = createRequire(appReq.resolve('next/package.json'))('@next/env');
  const [, inherited] = processEnv(
    [{ path: path.basename(sourceEnv), contents: envText, env: {} }],
    path.dirname(sourceEnv),
    {
      info() {},
      error() {
        throw Error('环境文件解析失败');
      }
    },
    true
  );
  const id = randomUUID().replaceAll('-', '');
  const database = 'fg_it_' + id,
    nonce = randomBytes(24).toString('hex');
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
      parentPid: process.pid,
      children: [],
      container: 'fg-it-' + id
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
    const process = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    process.stdout.pipe(stream);
    process.stderr.pipe(stream);
    ledger.children.push({ pid: process.pid, command, args });
    resources.push(async () => {
      if (process.exitCode === null) {
        process.kill('SIGTERM');
        await Promise.race([
          once(process, 'exit'),
          new Promise((resolve) => setTimeout(resolve, 10000))
        ]);
        if (process.exitCode === null) process.kill('SIGKILL');
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
  // 启动阶段也处理退出，避免首次编译时中断遗留本轮 mongod/容器。
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () =>
      close().then(
        () => process.exit(0),
        () => process.exit(1)
      )
    );
  try {
    // 所有进程由本次 ledger 所有，禁止复用或终止共享服务。
    const mongoPort = await freePort();
    await mkdir(path.join(directory, 'mongo'));
    child({
      command: mongoBinary,
      args: [
        '--dbpath',
        path.join(directory, 'mongo'),
        '--bind_ip',
        '127.0.0.1',
        '--port',
        String(mongoPort),
        '--replSet',
        'fgtest',
        '--setParameter',
        'enableTestCommands=1'
      ],
      log: 'mongo.log'
    });
    const mongoAddress = `mongodb://127.0.0.1:${mongoPort}`;
    let admin;
    for (let index = 0; index < 100; index++) {
      try {
        admin = await new MongoClient(mongoAddress + '/?directConnection=true', {
          serverSelectionTimeoutMS: 300
        }).connect();
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    if (!admin) throw Error('私有 Mongo 未启动');
    resources.push(async () => admin.close());
    await admin.db('admin').command({
      replSetInitiate: { _id: 'fgtest', members: [{ _id: 0, host: `127.0.0.1:${mongoPort}` }] }
    });
    while (!(await admin.db('admin').command({ hello: 1 })).isWritablePrimary)
      await new Promise((resolve) => setTimeout(resolve, 200));
    const uri = `${mongoAddress}/${database}?replicaSet=fgtest`,
      logUri = `${mongoAddress}/${database}_log?replicaSet=fgtest`;
    const db = admin.db(database);
    await db.collection('fg_test_environment').insertOne({ _id: id, nonce });
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
    execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '-d',
        '--name',
        ledger.container,
        '-p',
        '127.0.0.1::6379',
        'redis:7.2-alpine',
        'redis-server',
        '--save',
        '',
        '--appendonly',
        'no'
      ],
      { stdio: 'pipe' }
    );
    resources.push(async () => {
      execFileSync('docker', ['stop', ledger.container], { stdio: 'pipe' });
    });
    const publishedPort = execFileSync('docker', ['port', ledger.container, '6379/tcp'], {
      encoding: 'utf8'
    })
      .trim()
      .split(':')
      .at(-1);
    const redisUri = 'redis://127.0.0.1:' + publishedPort;
    const proxy = await createRedisProxy({ upstream: redisUri });
    resources.push(() => proxy.close());
    const Redis = createRequire(path.join(repo, 'packages/dal/package.json'))('ioredis');
    const redis = new Redis(redisUri);
    resources.push(async () => redis.disconnect());
    await redis.set('fgtest:environment:' + id, nonce);
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
    const env = {
      ...process.env,
      ...inherited,
      NODE_ENV: 'development',
      MONGODB_URI: uri,
      MONGODB_LOG_URI: logUri,
      REDIS_URL: proxy.url,
      AGENT_USERS: '',
      SYNC_INDEX: 'false',
      STREAM_RESUME_TTL_SECONDS: '30',
      STREAM_RESUME_POST_COMPLETE_TTL_SECONDS: '4',
      STREAM_RESUME_REDIS_MEMORY_CHECK_INTERVAL_MS: '20',
      STREAM_RESUME_REDIS_MAXMEMORY_RATIO: '0.5',
      ...(profile === 'app-key' ? { OPENAPI_KEY_MAX_COUNT: '3' } : {})
    };
    await writeFile(path.join(directory, 'service-env.json'), JSON.stringify(env), { mode: 0o600 });
    const app = child({
      command: process.execPath,
      args: [appReq.resolve('next/dist/bin/next'), 'dev', '--port', String(port)],
      cwd: path.join(serverRoot, 'projects/app'),
      env,
      log: 'app.log'
    });
    const baseUrl = 'http://127.0.0.1:' + port;
    for (let index = 0; index < 180; index++) {
      if (app.exitCode !== null) throw Error('私有主站已退出，见 app.log');
      try {
        const r = await fetch(baseUrl + '/api/support/user/account/preLogin?username=root', {
          signal: AbortSignal.timeout(1500)
        });
        if (r.status === 200) break;
      } catch {}
      if (index === 179) throw Error('私有主站启动超时，见 app.log');
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
    for (const name of profile === 'app-key'
      ? ['history', 'historySwitch', 'other', 'empty']
      : ['resume', 'history', 'historySwitch', 'database', 'other', 'empty']) {
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
    for (const role of ['A', 'B', 'N']) {
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
    for (let index = 0; index < (profile === 'app-key' ? 0 : 201); index++) {
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
    await publish(apps.history, graph({ stages: true }));
    const shared = await (
      await owner.post('/api/support/outLink/create', {
        data: {
          appId: apps.history,
          type: 'share',
          name: 'FG-TEST history visitors',
          allowAnonymous: true,
          app: {}
        }
      })
    ).json();
    if (shared.code !== 200) throw Error('私有分享创建失败 ' + shared.code);
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
    if (profile === 'app-key')
      fixture.appKeys = { templateAppId: apps.empty, maxKeyCount: 3, commercial: false };
    fixture.history.shareId = shared.data;
    fixture.history.url += '&pane=ra';
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
      !['source-env', 'mongo-binary', 'port', 'directory', 'app-root', 'profile'].includes(key) ||
      !value
    )
      throw Error('无效环境参数');
    args[key] = value;
  }
  const environment = await startPrivateEnvironment({
    sourceEnv: args['source-env'],
    mongoBinary: args['mongo-binary'],
    port: Number(args.port ?? 3100),
    directory: args.directory,
    serverRoot: args['app-root'],
    profile: args.profile ?? 'history'
  });
  console.log(
    JSON.stringify({
      prepared: true,
      directory: environment.directory,
      baseUrl: environment.fixture.baseUrl
    })
  );
}

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp, chmod, rm } from 'node:fs/promises';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { poll } from './scenario.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));

/** 只读取显式指定的 dev 配置，连接值仅进入私有夹具文件，不输出到报告或命令行。 */
export async function readDevEnvironment(sourceEnv) {
  const req = createRequire(path.join(repo, 'projects/app/package.json'));
  const { processEnv } = createRequire(req.resolve('next/package.json'))('@next/env');
  const previous = { ...process.env };
  try {
    const [, env] = processEnv(
      [{ path: path.basename(sourceEnv), contents: await readFile(sourceEnv, 'utf8'), env: {} }],
      path.dirname(sourceEnv),
      {
        info() {},
        error() {
          throw Error('dev 环境文件解析失败');
        }
      },
      true
    );
    return { ...previous, ...env };
  } finally {
    // @next/env 会改当前进程环境；解析完成即恢复，保留执行器协议与前一资源副本的凭证引用。
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
}

/**
 * 在现有本地 dev 中准备可回收的团队、账号和回显模板，不启动应用、数据库或 Redis。
 * 仅回收本函数记录的 ID；成员交接场景可逐项创建资源副本，共享 dev 配置保持不变。
 */
export async function prepareDevEnvironment({
  sourceEnv,
  baseUrl = 'http://localhost:3000',
  directory,
  roles = ['owner', 'A', 'B', 'N', 'C', 'M']
}) {
  assert.ok(
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname),
    '使用本地 dev 入口'
  );
  const env = await readDevEnvironment(sourceEnv);
  assert.ok(env.MONGODB_URI, 'dev 需要已有 Mongo 配置');
  const req = createRequire(path.join(repo, 'package.json'));
  const appReq = createRequire(path.join(repo, 'projects/app/package.json'));
  const { MongoClient, ObjectId } = createRequire(path.join(repo, 'packages/service/package.json'))(
    'mongoose'
  ).mongo;
  const { request } = req('@playwright/test');
  const client = await new MongoClient(env.MONGODB_URI).connect();
  const db = client.db();
  const id = randomUUID().replaceAll('-', '');
  const prefix = 'fgtest' + id;
  directory ??= await mkdtemp(path.join(tmpdir(), 'fastgpt-dev-'));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const password = randomBytes(18).toString('hex');
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const teamId = new ObjectId();
  const actors = {},
    secrets = {},
    sessions = new Map(),
    appIds = [];
  let closed = false;
  const ledger = {
    id,
    parentPid: process.pid,
    teamIds: [String(teamId)],
    userIds: [],
    memberIds: [],
    appIds
  };
  const save = () =>
    writeFile(path.join(directory, 'resources.json'), JSON.stringify(ledger, null, 2), {
      mode: 0o600
    });
  const context = (role) => sessions.get(role);
  const business = async (session, route, body, method = 'post') => {
    const response = await session[method](route, body === undefined ? {} : { data: body });
    const result = await response.json();
    assert.equal(result.code, 200, route + ': ' + (result.statusText ?? result.code));
    return result.data;
  };
  /** 先经正常应用删除入口回收业务资源，再精确回收本轮账号和团队夹具。 */
  async function close() {
    if (closed) return;
    closed = true;
    const errors = [];
    try {
      for (const appId of [...appIds].reverse()) {
        const app = await db.collection('apps').findOne({ _id: new ObjectId(appId), teamId });
        if (app && !app.deleteTime) {
          try {
            await business(
              context('owner'),
              '/api/core/app/del?appId=' + appId,
              undefined,
              'delete'
            );
          } catch (error) {
            errors.push(error.message);
          }
        }
        try {
          await poll(async () => {
            assert.equal(
              await db.collection('apps').countDocuments({ _id: new ObjectId(appId), teamId }),
              0
            );
          }, 60000);
        } catch (error) {
          errors.push('template cleanup: ' + error.message);
        }
      }
      // 这些用户由本轮新建；登出只影响各自唯一的测试 session。
      for (const [role, session] of sessions) {
        try {
          await session.get('/api/support/user/account/loginout');
        } catch (error) {
          errors.push(role + ': ' + error.name);
        }
      }
      const userIds = ledger.userIds.map((value) => new ObjectId(value));
      const foreignMemberships = await db
        .collection('team_members')
        .countDocuments({ userId: { $in: userIds }, teamId: { $ne: teamId } });
      assert.equal(foreignMemberships, 0, '不删除已产生清单外成员关系的用户');
      for (const name of [
        'resource_permissions',
        'team_members',
        'openapis',
        'outlinks',
        'usages',
        'usage_items',
        'team_subscriptions',
        'team_member_groups',
        'team_org_members',
        'team_orgs'
      ])
        await db.collection(name).deleteMany({ teamId });
      await db
        .collection('team_group_members')
        .deleteMany({ tmbId: { $in: ledger.memberIds.map((value) => new ObjectId(value)) } });
      const logClient = await new MongoClient(env.MONGODB_LOG_URI ?? env.MONGODB_URI).connect();
      try {
        await logClient.db().collection('operationlogs').deleteMany({ teamId });
      } finally {
        await logClient.close();
      }
      await db.collection('teams').deleteOne({ _id: teamId });
      await db
        .collection('users')
        .deleteMany({ _id: { $in: userIds }, username: { $regex: '^' + prefix + '-' } });
      assert.equal(await db.collection('openapis').countDocuments({ teamId }), 0);
      assert.equal(await db.collection('team_members').countDocuments({ teamId }), 0);
      assert.equal(await db.collection('users').countDocuments({ _id: { $in: userIds } }), 0);
    } finally {
      for (const session of sessions.values()) await session.dispose().catch(() => {});
      await client.close();
      await writeFile(
        path.join(directory, 'cleanup.json'),
        JSON.stringify({ id, errors, closedAt: new Date().toISOString() }, null, 2),
        { mode: 0o600 }
      );
    }
    assert.deepEqual(errors, [], '本轮 dev 资源必须清理完成');
    return { teamId: String(teamId), users: ledger.userIds.length, cleaned: true };
  }
  try {
    const now = new Date();
    for (const role of roles) {
      const userId = new ObjectId(),
        tmbId = new ObjectId(),
        username = prefix + '-' + role.toLowerCase();
      await db.collection('users').insertOne({
        _id: userId,
        username,
        password: hash(hash(password)),
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
        ...(role === 'owner' ? { role: 'owner' } : {}),
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
      ledger.userIds.push(String(userId));
      ledger.memberIds.push(String(tmbId));
      await save();
    }
    await db.collection('teams').insertOne({
      _id: teamId,
      ownerId: new ObjectId(actors.owner.userId),
      name: 'FG-TEST-' + id,
      avatar: '/icon/logo.svg',
      balance: 1000000,
      createTime: now
    });
    for (const [role, actor] of Object.entries(actors)) {
      const session = await request.newContext({
        baseURL: baseUrl,
        extraHTTPHeaders: { 'fastgpt-web-request': '1' },
        timeout: 120000
      });
      sessions.set(role, session);
      const pre = await business(
        session,
        '/api/support/user/account/preLogin?username=' + actor.username,
        undefined,
        'get'
      );
      await business(session, '/api/support/user/account/loginByPassword', {
        username: actor.username,
        password: hash(password),
        code: pre?.code,
        language: 'zh-CN'
      });
      actor.stateEnv = 'FASTGPT_TEST_' + id.toUpperCase() + '_' + role + '_STATE';
      secrets[actor.stateEnv] = path.join(directory, role + '-state.json');
      await session.storageState({ path: secrets[actor.stateEnv] });
      await chmod(secrets[actor.stateEnv], 0o600);
    }
    process.env.TSX_TSCONFIG_PATH = path.join(repo, 'projects/app/tsconfig.json');
    const tsx = appReq('tsx/cjs/api');
    const load = (file) =>
      tsx.require(path.join(repo, file), path.join(repo, 'projects/app/probe.cjs'));
    const { WorkflowStart } = load(
      'packages/global/core/workflow/template/system/workflowStart.ts'
    );
    const { AssignedAnswerModule } = load(
      'packages/global/core/workflow/template/system/assignedAnswer.ts'
    );
    const { NodeInputKeyEnum } = load('packages/global/core/workflow/constants.ts');
    const answer = structuredClone(AssignedAnswerModule);
    answer.nodeId = 'Reply';
    answer.position = { x: 300, y: 0 };
    answer.inputs.find((input) => input.key === NodeInputKeyEnum.answerText).value =
      '{{$Start.userChatInput$}}|{{$VARIABLE_NODE_ID.userId$}}';
    const graph = {
      nodes: [
        { ...structuredClone(WorkflowStart), nodeId: 'Start', position: { x: 0, y: 0 } },
        answer
      ],
      edges: [
        {
          source: 'Start',
          sourceHandle: 'Start-source-right',
          target: 'Reply',
          targetHandle: 'Reply-target-left'
        }
      ],
      chatConfig: {
        fileSelectConfig: { canSelectFile: true, canSelectImg: true, maxFiles: 5, maxFileSize: 5 }
      }
    };
    const templateAppId = await business(context('owner'), '/api/core/app/create', {
      type: 'advanced',
      name: 'FG-TEST-' + id + '-template',
      ...graph
    });
    appIds.push(templateAppId);
    await save();
    await business(context('owner'), '/api/core/app/version/publish?appId=' + templateAppId, {
      ...graph,
      isPublish: true,
      versionName: 'FG-TEST dev'
    });
    for (const role of ['A', 'B']) {
      const permission = {
        teamId,
        resourceType: 'team',
        resourceId: null,
        tmbId: new ObjectId(actors[role].tmbId)
      };
      await db
        .collection('resource_permissions')
        .updateOne(permission, { $set: { permission: 32 } }, { upsert: true });
      const value = await business(context(role), '/api/support/openapi/create', {
        name: 'FG-TEST-' + id + '-' + role
      });
      actors[role].keyEnv = 'FASTGPT_TEST_' + id.toUpperCase() + '_' + role + '_KEY';
      secrets[actors[role].keyEnv] = value;
      await db.collection('resource_permissions').deleteMany(permission);
    }
    secrets.FASTGPT_TEST_SERVICE_ENV = path.join(directory, 'service-env.json');
    secrets.FASTGPT_TEST_MONGO_URI = env.MONGODB_URI;
    secrets.FASTGPT_TEST_MONGO_WRITE_URI = env.MONGODB_URI;
    secrets.FASTGPT_TEST_MONGO_LOG_URI = env.MONGODB_LOG_URI ?? env.MONGODB_URI;
    secrets.FASTGPT_TEST_REDIS_URI = env.REDIS_URL;
    await writeFile(secrets.FASTGPT_TEST_SERVICE_ENV, JSON.stringify(env), { mode: 0o600 });
    const fixture = {
      version: 1,
      environment: 'local-dev',
      baseUrl,
      teamId: String(teamId),
      actors,
      echoTemplate: '\n{{question}}|{{userId}}',
      apps: { empty: templateAppId, identity: templateAppId },
      lifecycle: { disposeApps: appIds },
      ownedResources: ledger,
      mongo: {
        uriEnv: 'FASTGPT_TEST_MONGO_URI',
        logUriEnv: 'FASTGPT_TEST_MONGO_LOG_URI',
        writeUriEnv: 'FASTGPT_TEST_MONGO_WRITE_URI'
      },
      redis: { uriEnv: 'FASTGPT_TEST_REDIS_URI' },
      serviceEnvFileEnv: 'FASTGPT_TEST_SERVICE_ENV',
      appKeys: {
        templateAppId,
        maxKeyCount: Number(env.OPENAPI_KEY_MAX_COUNT || 100),
        commercial: false
      },
      devSourceEnv: sourceEnv
    };
    secrets.FASTGPT_TEST_FIXTURE = path.join(directory, 'fixture.json');
    await writeFile(secrets.FASTGPT_TEST_FIXTURE, JSON.stringify(fixture, null, 2), {
      mode: 0o600
    });
    await writeFile(path.join(directory, 'secrets.json'), JSON.stringify(secrets), { mode: 0o600 });
    return {
      fixture,
      secrets,
      directory,
      close,
      async relogin(role) {
        const actor = actors[role],
          session = context(role);
        const pre = await business(
          session,
          '/api/support/user/account/preLogin?username=' + actor.username,
          undefined,
          'get'
        );
        await business(session, '/api/support/user/account/loginByPassword', {
          username: actor.username,
          password: hash(password),
          code: pre?.code,
          language: 'zh-CN'
        });
        await session.storageState({ path: secrets[actor.stateEnv] });
      },
      async dispose() {
        const result = await close();
        await rm(directory, { recursive: true });
        return result;
      }
    };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'dev 准备失败且清理未完成，资源清单：' + path.join(directory, 'resources.json')
      );
    }
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index].slice(2),
      value = process.argv[index + 1];
    assert.ok(['source-env', 'base-url', 'directory'].includes(key) && value, '无效 dev 配置参数');
    args[key] = value;
  }
  const prepared = await prepareDevEnvironment({
    sourceEnv: args['source-env'],
    baseUrl: args['base-url'],
    directory: args.directory
  });
  console.log(
    JSON.stringify({
      prepared: true,
      environment: 'local-dev',
      directory: prepared.directory,
      baseUrl: prepared.fixture.baseUrl
    })
  );
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, async () => {
      if (stopping) return;
      stopping = true;
      try {
        await prepared.dispose();
        process.exit(0);
      } catch (error) {
        console.error('dev 测试资源未完全清理：' + error.name);
        process.exit(1);
      }
    });
}

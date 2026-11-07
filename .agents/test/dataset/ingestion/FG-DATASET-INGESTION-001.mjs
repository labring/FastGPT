import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdtemp, rm, chmod } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const repo = path.resolve(import.meta.dirname, '../../../..');
const pro = path.resolve(process.env.FASTGPT_TEST_PRO_ROOT || path.join(repo, 'pro'));
const directory = process.env.FASTGPT_TEST_RUN_DIR;
const resultFile = process.env.FASTGPT_TEST_RESULTS_FILE;
const selected = JSON.parse(process.env.FASTGPT_TEST_ITEMS || '[]');
assert.equal(process.env.FASTGPT_TEST_CASE_ID, 'FG-DATASET-INGESTION-001');
assert.ok(directory && resultFile && selected.length, '请通过 pnpm test:cases 执行');
const privateDirectory = await mkdtemp(path.join(tmpdir(), 'fastgpt-crawlee-private-'));
await chmod(privateDirectory, 0o700);
const appRequire = createRequire(path.join(repo, 'projects/app/package.json'));
const { processEnv } = createRequire(appRequire.resolve('next/package.json'))('@next/env');
const { MongoClient, ObjectId } = createRequire(path.join(repo, 'packages/service/package.json'))(
  'mongoose'
).mongo;
const runId = randomUUID().replaceAll('-', '');
const database = 'fg_crawlee_it_' + runId;
const container = 'fg-crawlee-it-' + runId.slice(0, 12);
let client, child, stream;
let redisStarted = false;
let prepared = false;
let interrupted = false;
let setupError;
const cleanup = {
  database,
  container,
  databaseDropped: false,
  logDatabaseDropped: false,
  redisStopped: false,
  errors: []
};

/** 中断只处理本次子进程；finally 会逐项清理，不停止共享 dev 服务。 */
const interrupt = () => {
  interrupted = true;
  child?.kill('SIGTERM');
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);

try {
  const sources = [
    process.env.FASTGPT_TEST_SOURCE_APP_ENV,
    process.env.FASTGPT_TEST_SOURCE_ADMIN_ENV
  ];
  assert.ok(
    sources.every(Boolean),
    '显式提供 FASTGPT_TEST_SOURCE_APP_ENV 和 FASTGPT_TEST_SOURCE_ADMIN_ENV'
  );
  const env = { ...process.env };
  for (const source of sources) {
    const [, values] = processEnv(
      [{ path: source, contents: await readFile(source, 'utf8'), env: {} }],
      path.dirname(source),
      {
        info() {},
        error() {
          throw Error('Dev 环境文件无法解析');
        }
      },
      true
    );
    Object.assign(env, values);
  }
  // 只允许本机 dev 依赖，防止错把生产连接用于数据库故障注入。
  const sourceUrl = new URL(env.MONGODB_URI);
  for (const value of [env.MONGODB_URI, env.PG_URL]) {
    assert.ok(
      value && ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname),
      '仅支持本机 Mongo/PG'
    );
  }
  client = await new MongoClient(sourceUrl.href, { serverSelectionTimeoutMS: 10000 }).connect();
  const db = client.db(database);
  const sourceDb = client.db(sourceUrl.pathname.slice(1));
  for (const name of ['ai_models', 'ai_default_models']) {
    const docs = await sourceDb.collection(name).find({ scope: 'system' }).toArray();
    if (docs.length) await db.collection(name).insertMany(docs);
  }
  const models = await db.collection('ai_models').find({ isActive: true }).toArray();
  const embedding = models.find((model) => model.type === 'embedding');
  const llm = models.find((model) => model.type === 'llm');
  assert.ok(embedding && llm, 'Dev 系统目录需有启用的 embedding 和 llm 模型');
  const teamId = new ObjectId(),
    tmbId = new ObjectId(),
    userId = new ObjectId();
  await db.collection('teams').insertOne({
    _id: teamId,
    name: 'FG-TEST-Crawlee-' + runId,
    ownerId: userId,
    balance: 1000000,
    createTime: new Date()
  });
  await db.collection('team_members').insertOne({
    _id: tmbId,
    userId,
    teamId,
    name: 'FG-TEST owner',
    role: 'owner',
    status: 'active',
    defaultTeam: true,
    createTime: new Date()
  });
  await db.collection('users').insertOne({
    _id: userId,
    username: 'fg-crawlee-' + runId,
    status: 'active',
    lastLoginTmbId: tmbId,
    createTime: new Date()
  });
  execFileSync(
    'docker',
    [
      'run',
      '--pull=never',
      '--rm',
      '-d',
      '--name',
      container,
      '-p',
      '127.0.0.1::6379',
      'redis:7.2-alpine',
      'redis-server',
      '--save',
      '',
      '--appendonly',
      'no'
    ],
    { stdio: 'pipe', timeout: 30000 }
  );
  redisStarted = true;
  const port = execFileSync('docker', ['port', container, '6379/tcp'], { encoding: 'utf8' })
    .trim()
    .split(':')
    .at(-1);
  const targetUrl = new URL(sourceUrl);
  targetUrl.pathname = '/' + database;
  const targetLogUrl = new URL(sourceUrl);
  targetLogUrl.pathname = '/' + database + '_log';
  Object.assign(env, {
    NODE_ENV: 'development',
    MONGODB_URI: targetUrl.href,
    MONGODB_LOG_URI: targetLogUrl.href,
    REDIS_URL: 'redis://127.0.0.1:' + port,
    MAX_CRAWL_PAGE: '3',
    LOG_ENABLE_OTEL: 'false',
    SYNC_INDEX: 'false',
    NEXT_PHASE: ''
  });
  delete env.LOG_OTEL_URL;
  const fixture = {
    runId,
    database,
    container,
    pro,
    evidenceDirectory: directory,
    proCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: pro, encoding: 'utf8' }).trim(),
    teamId: String(teamId),
    tmbId: String(tmbId),
    userId: String(userId),
    embeddingModelId: String(embedding._id),
    agentModelId: String(llm._id)
  };
  await writeFile(path.join(privateDirectory, 'fixture.json'), JSON.stringify(fixture), {
    mode: 0o600
  });
  const paths = {
    '@/*': [path.join(pro, 'admin/src/*')],
    '@fastgpt/*': [path.join(repo, 'packages/*')],
    '@fastgpt/workflow-core': [path.join(repo, 'packages/workflow-core/src')]
  };
  for (const name of ['storage', 'otel'])
    paths['@fastgpt-sdk/' + name] = [path.join(repo, 'sdk', name, 'src/index.ts')];
  paths['@fastgpt-sdk/storage/access-link'] = [
    path.join(repo, 'sdk/storage/src/access-link/index.ts')
  ];
  for (const name of ['logger', 'metrics', 'tracing'])
    paths['@fastgpt-sdk/otel/' + name] = [path.join(repo, 'sdk/otel/src', name + '-entry.ts')];
  paths['@fastgpt-plugin/sdk-client'] = [
    path.join(repo, 'packages/global/node_modules/@fastgpt-plugin/sdk-client/dist/index.js')
  ];
  const configPath = path.join(privateDirectory, 'tsconfig.json');
  await writeFile(
    configPath,
    JSON.stringify({ extends: path.join(pro, 'admin/tsconfig.json'), compilerOptions: { paths } })
  );
  stream = createWriteStream(path.join(privateDirectory, 'worker.log'), { mode: 0o600 });
  child = spawn(
    path.join(pro, 'admin/node_modules/.bin/tsx'),
    [
      '--tsconfig',
      configPath,
      path.join(import.meta.dirname, 'FG-DATASET-INGESTION-001.runner.mts'),
      privateDirectory
    ],
    { cwd: path.join(pro, 'admin'), env, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  const timer = setTimeout(
    () => {
      interrupted = true;
      child.kill('SIGKILL');
    },
    5 * 60 * 1000
  );
  const status = await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  }).finally(() => clearTimeout(timer));
  prepared = status === 0 && !interrupted;
  if (!prepared) throw Error('集成子进程未正常结束，已清理本轮私有库和 Redis；需复核业务清理结果');
} catch (error) {
  // 只记录诊断类型，避免依赖异常消息包含连接凭据。业务断言错误由 runner 写脱敏证据。
  setupError = `${error.name}: ${error.code || (error.name === 'AssertionError' ? error.message : '初始化或子进程失败')}`;
} finally {
  if (child && child.exitCode === null) child.kill('SIGKILL');
  stream?.end();
  for (const [name, operation] of [
    [
      'databaseDropped',
      async () => {
        if (client) await client.db(database).dropDatabase();
      }
    ],
    [
      'logDatabaseDropped',
      async () => {
        if (client) await client.db(database + '_log').dropDatabase();
      }
    ],
    [
      'redisStopped',
      async () => {
        if (redisStarted)
          execFileSync('docker', ['stop', container], { stdio: 'pipe', timeout: 15000 });
      }
    ]
  ]) {
    try {
      await operation();
      cleanup[name] = true;
    } catch (error) {
      cleanup.errors.push({ step: name, error: error.name });
    }
  }
  await client?.close();
  await writeFile(
    path.join(directory, 'environment-cleanup.json'),
    JSON.stringify(cleanup, null, 2)
  );
  // 私有日志不进入报告；失败时保留在 0700 目录供本机诊断，成功才删除。
  if (prepared && cleanup.errors.length === 0)
    await rm(privateDirectory, { recursive: true, force: true });
  else {
    cleanup.privateDiagnostics = privateDirectory;
    await writeFile(
      path.join(directory, 'environment-cleanup.json'),
      JSON.stringify(cleanup, null, 2)
    );
  }
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
}

let records = await readFile(resultFile, 'utf8')
  .then(JSON.parse)
  .catch(() => []);
if (!prepared || cleanup.errors.length) {
  const evidence = 'environment-cleanup.json';
  records = selected.map((itemId) => {
    const previous = records.find((record) => record.itemId === itemId);
    return {
      caseId: 'FG-DATASET-INGESTION-001',
      itemId,
      // 清理/进程错误可使成功项降为阻塞，但不能覆盖已观察到的业务失败。
      result: previous?.result === 'failed' ? 'failed' : 'blocked',
      note: [previous?.note, setupError || '环境清理失败'].filter(Boolean).join('；'),
      evidence: [...(previous?.evidence || []), { path: evidence, label: '环境准备与清理结果' }]
    };
  });
}
await writeFile(resultFile, JSON.stringify(records, null, 2));

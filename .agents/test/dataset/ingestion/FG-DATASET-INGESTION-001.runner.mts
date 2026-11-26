import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';

const stateDirectory = process.argv[2];
const attemptId = Date.now();
const repo = path.resolve(import.meta.dirname, '../../../..');
const fixture = JSON.parse(await readFile(path.join(stateDirectory, 'fixture.json'), 'utf8'));
const directory: string = fixture.evidenceDirectory;
const proRequire = createRequire(path.join(fixture.pro, 'admin/package.json'));
type CapturedLog = {
  time: number;
  message: string;
  level: string;
  properties: Record<string, unknown>;
};
type Collection = { _id: string; rawLink: string; hashRawText: string; name: string };
type DataSnapshot = {
  collections: Collection[];
  data: { _id: string; collectionId: string }[];
  training: { _id: string; collectionId: string }[];
};
type Observation = DataSnapshot & {
  jobId?: string;
  datasetId: string;
  visits: string[];
  maxActive: number;
  logs: CapturedLog[];
};
type ScenarioResult = {
  id: string;
  result: 'passed' | 'failed' | 'blocked';
  note: string;
  evidence: string;
  durationMs?: number;
};
const logs: CapturedLog[] = [];
const logtape = createRequire(path.join(repo, 'sdk/otel/package.json'))('@logtape/logtape');
await logtape.configure({
  sinks: {
    evidence: (r: {
      timestamp: number;
      rawMessage: string;
      level: string;
      properties: Record<string, unknown>;
    }) =>
      logs.push({
        time: r.timestamp,
        message: r.rawMessage,
        level: r.level,
        properties: r.properties
      })
  },
  loggers: [{ category: [], lowestLevel: 'debug', sinks: ['evidence'] }]
});
const mongo = await import('../../../../packages/service/common/mongo');
const { connectMongo } = await import('../../../../packages/service/common/mongo/init');
await connectMongo({ db: mongo.connectionMongo, url: process.env.MONGODB_URI! });
await connectMongo({ db: mongo.connectionLogMongo, url: process.env.MONGODB_LOG_URI! });
const db = mongo.connectionMongo.connection.db!;
const { configureRedisRuntime, closeRedisRuntime } =
  await import('../../../../packages/dal/redis/runtime');
configureRedisRuntime({ redisUrl: process.env.REDIS_URL! });
const { loadSystemModels } =
  await import('../../../../packages/service/core/ai/model/catalog/service');
Object.assign(global, { feConfigs: { isPlus: true }, systemEnv: {}, agentUserTmbIds: new Set() });
await loadSystemModels();
const { MongoDataset } = await import('../../../../packages/service/core/dataset/schema');
const { MongoDatasetCollection } =
  await import('../../../../packages/service/core/dataset/collection/schema');
const { MongoDatasetData } = await import('../../../../packages/service/core/dataset/data/schema');
const { MongoDatasetTraining } =
  await import('../../../../packages/service/core/dataset/training/schema');
const { cheerioToHtml } = await import('../../../../packages/service/common/string/cheerio');
const { htmlToMarkdown } = await import('../../../../packages/service/common/string/utils');
const { load } = proRequire('cheerio');
const { delCollection } =
  await import('../../../../packages/service/core/dataset/collection/controller');
const { mongoSessionRun } = await import('../../../../packages/service/common/mongo/sessionRun');
const { datasetSyncMQService } =
  await import('../../../../packages/service/core/dataset/datasetSync');
const { getConfiguredRedisBullMQRuntime } = await import('../../../../packages/dal/redis/bullmq');
const { initDatasetSyncWorker } = await import(
  path.join(fixture.pro, 'admin/src/service/core/dataset/dataset/sync.ts')
);
const datasetIds: string[] = [];
const worker = initDatasetSyncWorker();
await worker.waitUntilReady();
const pages = new Map<string, { body: string; status?: number }>();
const visits: string[] = [];
let active = 0,
  maxActive = 0;
const server = createServer((req, res) => {
  const route = new URL(req.url ?? '/', 'http://localhost').pathname;
  visits.push(route);
  active++;
  maxActive = Math.max(maxActive, active);
  const page = pages.get(route);
  setTimeout(() => {
    active--;
    res.writeHead(page?.status ?? (page ? 200 : 404), {
      'content-type': 'text/html; charset=utf-8'
    });
    res.end(page?.body ?? 'not found');
  }, 40);
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = 'http://127.0.0.1:' + address.port;
/** 固定短正文与重复导航，避免模型随机输出影响断言。 */
const content = (title: string, links: string[] = []) =>
  `<html><head><title>${title}</title></head><body><nav>${links.map((v) => `<a href="${v}">${v}</a>`).join('')}</nav><main><p>${'FastGPT crawler deterministic integration content. '.repeat(4)}</p></main></body></html>`;
const routeSet = (urls = ['/', '/a', '/b']) => {
  pages.clear();
  for (const url of urls)
    pages.set(url, {
      body: content(
        url,
        urls.flatMap((v) => [v, v + '#one', v + '#two'])
      )
    });
};
/** 所有业务数据查询仅覆盖本例 datasetId。 */
const snapshot = async (id: string) => ({
  collections: await MongoDatasetCollection.find({ datasetId: id })
    .select('_id rawLink hashRawText name')
    .sort({ rawLink: 1 })
    .lean(),
  data: await MongoDatasetData.find({ datasetId: id })
    .select('_id collectionId')
    .sort({ _id: 1 })
    .lean(),
  training: await MongoDatasetTraining.find({ datasetId: id })
    .select('_id collectionId')
    .sort({ _id: 1 })
    .lean()
});
const serialize = (value: unknown) => JSON.parse(JSON.stringify(value));
const records: ScenarioResult[] = [];
/** 输出调度器协议，场景状态由 test:cases 统一维护；临时材料始终在本轮目录内。 */
async function saveResults() {
  const output = records.map((record) => ({
    caseId: 'FG-DATASET-INGESTION-001',
    itemId: record.id,
    result: record.result,
    note: record.note,
    evidence: [{ path: record.evidence, label: '真实队列、Mongo 与 worker 日志' }]
  }));
  await writeFile(process.env.FASTGPT_TEST_RESULTS_FILE!, JSON.stringify(output, null, 2));
}
/** 通过真实 BullMQ 处理同步任务，等待终态并获取限定 datasetId 的数据库和日志证据。 */
async function sync(id: string): Promise<Observation> {
  visits.length = 0;
  maxActive = 0;
  const start = logs.length;
  const job = await datasetSyncMQService.addJob({ datasetId: id });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Dataset sync exceeded 120 seconds')), 120000);
    const done = (j: { id?: string }) => {
      if (String(j.id) === String(job.id)) finish();
    };
    const failed = (j: { id?: string } | undefined, error: Error) => {
      if (String(j?.id) === String(job.id)) finish(error);
    };
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.off('completed', done);
      worker.off('failed', failed);
      if (error) reject(error);
      else resolve();
    };
    worker.on('completed', done);
    worker.on('failed', failed);
  });
  const observed = {
    jobId: job.id,
    datasetId: id,
    visits: [...visits],
    maxActive,
    logs: serialize(logs.slice(start)),
    ...(serialize(await snapshot(id)) as DataSnapshot)
  };
  assert.equal(maxActive, 1, '实际抓取必须单并发');
  return observed;
}
/** 新建本轮独占 website dataset，登记 ID 供最终清理。 */
async function create() {
  const d = await MongoDataset.create({
    teamId: fixture.teamId,
    tmbId: fixture.tmbId,
    name: 'FG-TEST-Crawlee-' + fixture.runId,
    type: 'websiteDataset',
    intro: 'isolated dev integration',
    vectorModelId: fixture.embeddingModelId,
    agentModelId: fixture.agentModelId,
    websiteConfig: { url: origin + '/', selector: 'main' },
    chunkSettings: {
      trainingType: 'chunk',
      chunkSettingMode: 'custom',
      chunkSplitMode: 'size',
      chunkSize: 1024,
      indexSize: 512,
      autoIndexes: false,
      imageIndex: false
    },
    autoSync: false
  });
  const id = String(d._id);
  datasetIds.push(id);
  return id;
}
const signature = (rows: Collection[]) =>
  rows.map(({ _id, rawLink, hashRawText }) => ({ _id: String(_id), rawLink, hashRawText }));
const endLog = (r: Observation) =>
  r.logs.findLast((l) => l.message.startsWith('Dataset web crawler finished'))?.properties;
const skipLog = (r: Observation) =>
  r.logs.findLast((l) => l.message.startsWith('Dataset web crawler delete skipped'))?.properties;
/** 断言目标集合实际存在，避免后续字段比较掩盖基线准备失败。 */
function collectionAt(observation: Observation, route: string) {
  const collection = observation.collections.find((item) => item.rawLink === origin + route);
  assert.ok(collection, `缺少集合 ${route}`);
  return collection;
}
/** 用真实 worker 准备根/A/B 三页基线，每个独立场景重新创建。 */
async function baseline() {
  routeSet();
  const id = await create();
  const r = await sync(id);
  assert.equal(r.collections.length, 3, '基线必须真实创建三页');
  assert.equal(endLog(r)?.crawlCompleted, true, '基线必须完整同步');
  return { id, r };
}
const handlers: Record<string, () => Promise<unknown>> = {
  C1: async () => {
    const { r } = await baseline();
    assert.equal(new Set(r.collections.map((x) => x.rawLink)).size, 3);
    for (const u of ['/', '/a', '/b'])
      assert.equal(r.visits.filter((x: string) => x === u).length, 1);
    assert.ok(r.collections.every((x) => x.hashRawText));
    assert.ok(r.data.length >= 3);
    assert.ok(r.training.length >= 3);
    return r;
  },
  C2: async () => {
    const { id, r: before } = await baseline();
    const repeat = await sync(id);
    assert.deepEqual(signature(repeat.collections), signature(before.collections));
    assert.deepEqual(repeat.training, before.training);
    pages.set('/a', { body: content('A renamed', ['/', '/a', '/b']) });
    const renamed = await sync(id);
    assert.deepEqual(signature(renamed.collections), signature(before.collections));
    assert.equal(collectionAt(renamed, '/a').name, 'A renamed');
    assert.equal(endLog(renamed)?.crawlCompleted, true);
    return { before, repeat, renamed };
  },
  C3: async () => {
    const { id, r: before } = await baseline();
    const old = collectionAt(before, '/b');
    routeSet(['/', '/a']);
    const after = await sync(id);
    assert.equal(after.collections.length, 2);
    assert.ok(!after.collections.some((x) => String(x._id) === String(old._id)));
    assert.ok(!after.data.some((x) => String(x.collectionId) === String(old._id)));
    assert.ok(!after.training.some((x) => String(x.collectionId) === String(old._id)));
    assert.equal(endLog(after)?.crawlCompleted, true);
    return { before, after };
  },
  C4: async () => {
    const { id, r: before } = await baseline();
    pages.set('/b', { status: 500, body: 'deliberate fixture failure' });
    const after = await sync(id);
    assert.deepEqual(signature(after.collections), signature(before.collections));
    assert.equal(endLog(after)?.crawlCompleted, false);
    assert.equal(endLog(after)?.failedCount, 1);
    assert.equal(skipLog(after)?.reason, 'crawl-incomplete');
    return { before, after };
  },
  C5: async () => {
    pages.clear();
    const body =
      '<html><head><title>Empty directory</title></head><body><nav><a href="/a">go</a></nav><main></main></body></html>';
    pages.set('/', { body });
    pages.set('/a', { body: content('A') });
    const extracted = cheerioToHtml({ fetchUrl: origin + '/', $: load(body), selector: 'main' });
    const rootMarkdown = await htmlToMarkdown(extracted.html);
    assert.equal(rootMarkdown.length, 0, '目录页正文前置条件必须由真实转换器确认');
    const id = await create();
    const r = await sync(id);
    assert.equal(r.collections.length, 1);
    assert.equal(r.collections[0].rawLink, origin + '/a');
    assert.ok(r.visits.includes('/a'));
    assert.equal(endLog(r)?.crawlCompleted, false);
    assert.equal(endLog(r)?.failedCount, 1);
    assert.equal(skipLog(r)?.reason, 'crawl-incomplete');
    return { rootMarkdownLength: rootMarkdown.length, ...r };
  },
  C6: async () => {
    const { id, r: before } = await baseline();
    const old = collectionAt(before, '/b');
    routeSet(['/', '/a', '/n']);
    const collectionName = MongoDatasetCollection.collection.name;
    await db.command({
      collMod: collectionName,
      validator: { rawLink: { $ne: origin + '/n' } },
      validationLevel: 'strict',
      validationAction: 'error'
    });
    let after;
    try {
      after = await sync(id);
    } finally {
      await db.command({ collMod: collectionName, validator: {}, validationLevel: 'strict' });
    }
    assert.ok(!after.collections.some((x) => x.rawLink === origin + '/n'));
    assert.ok(after.collections.some((x) => String(x._id) === String(old._id)));
    assert.equal(endLog(after)?.pageSyncFailed, true);
    assert.equal(skipLog(after)?.reason, 'page-sync-failed');
    return { before, after };
  },
  C7: async () => {
    const { id, r: before } = await baseline();
    const old = collectionAt(before, '/b');
    routeSet(['/', '/a', '/n', '/x']);
    const after = await sync(id);
    assert.equal(after.visits.length, 3);
    assert.ok(after.collections.some((x) => String(x._id) === String(old._id)));
    assert.equal(endLog(after)?.crawlCompleted, false);
    assert.equal(skipLog(after)?.reason, 'crawl-incomplete');
    return { before, after };
  }
};
await writeFile(
  path.join(directory, 'runtime-version-' + attemptId + '.json'),
  JSON.stringify(
    {
      proCommit: fixture.proCommit,
      crawlee: proRequire('crawlee/package.json').version,
      source: path.join(fixture.pro, 'admin/src/service/core/dataset/dataset/sync.ts'),
      node: process.version,
      mode: process.env.NODE_ENV,
      rootCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repo,
        encoding: 'utf8'
      }).trim(),
      database: fixture.database,
      fixtureOrigin: origin
    },
    null,
    2
  )
);
try {
  const selected = process.env.FASTGPT_TEST_ITEMS
    ? JSON.parse(process.env.FASTGPT_TEST_ITEMS)
    : Object.keys(handlers);
  for (const [id, handler] of Object.entries(handlers).filter(([id]) => selected.includes(id))) {
    const start = Date.now();
    let result: ScenarioResult;
    try {
      const observations = await handler();
      const filename = id + '-' + attemptId + '-observations.json';
      await writeFile(path.join(directory, filename), JSON.stringify(observations, null, 2));
      result = {
        id,
        result: 'passed',
        note: '真实队列、集合/数据/训练记录、HTTP 请求与日志断言通过',
        evidence: filename
      };
    } catch (error) {
      const filename = id + '-' + attemptId + '-failure.json';
      await writeFile(
        path.join(directory, filename),
        JSON.stringify(
          { error: String(error), stack: (error as Error).stack, logs: serialize(logs.slice(-50)) },
          null,
          2
        )
      );
      result = { id, result: 'failed', note: String(error), evidence: filename };
    }
    result.durationMs = Date.now() - start;
    records.push(result);
    await saveResults();
    await writeFile(
      path.join(directory, 'scenario-results.json'),
      JSON.stringify(records, null, 2)
    );
  }
} finally {
  const cleanup: { datasetIds: string[]; errors: { datasetId: string; error: string }[] } = {
    datasetIds,
    errors: []
  };
  await worker.close();
  for (const id of datasetIds) {
    try {
      const collections = await MongoDatasetCollection.find({ datasetId: id });
      await mongoSessionRun(async (session) =>
        delCollection({ collections, session, delFile: true, delImg: true })
      );
    } catch (error) {
      cleanup.errors.push({ datasetId: id, error: String(error) });
    }
  }
  await getConfiguredRedisBullMQRuntime()?.close();
  await closeRedisRuntime();
  await mongo.connectionMongo.disconnect();
  await mongo.connectionLogMongo.disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await writeFile(path.join(directory, 'service-cleanup.json'), JSON.stringify(cleanup, null, 2));
  if (cleanup.errors.length) {
    for (const record of records) {
      record.result = record.result === 'failed' ? 'failed' : 'blocked';
      record.note += '；业务数据清理失败，见 service-cleanup.json';
    }
    await saveResults();
  }
}
process.exit(0);

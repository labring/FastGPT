import { describe, expect, it } from 'vitest';
import { getRootUser } from '@test/datas/users';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetCollectionTagsV2 } from '@fastgpt/service/core/dataset/tag/schemaV2';
import { filterCollectionByKeyValueTags } from '@fastgpt/service/core/dataset/search/defaultRecall/collectionFilter';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

/**
 * dataset_collections 两个标签索引性能对比（真实 MongoDB）
 *
 * 对比索引：
 *   1. { teamId: 1, datasetId: 1, tags: 1 }           —— 旧格式 string[] 标签，查询 `tags: { $all }`
 *   2. { teamId: 1, datasetId: 1, 'tags.tagId': 1 }   —— 新格式 { tagId, value }[] 标签，查询 `tags.tagId: { $all }`
 *
 * 对每个索引分别测「有索引」与「无索引」两个场景：
 *   - explain('executionStats')：断言有索引时使用被测索引（IXSCAN）且扫描量远小于全表；
 *     索引缺失时扫描量接近全表（优化器退到其他复合索引前缀或 COLLSCAN）
 *   - 服务端执行时间：多次 explain 采样 executionTimeMillis，取平均与中位（避免单次噪声）
 *   - 墙钟延迟：预热 + 多次迭代取中位数，对比索引带来的加速
 *
 * 运行方式：
 *   pnpm test:benchmark -- collectionTagIndex.benchmark.ts
 *   使用真实 MongoDB：FASTGPT_TEST_MONGODB_URI=mongodb://localhost:27017 \
 *     pnpm test:benchmark -- collectionTagIndex.benchmark.ts
 *
 * 注意：test/setup.ts 会在每个用例结束后清空所有集合文档（保留索引），
 * 因此数据准备必须在单个 it 内完成，不能跨用例复用 beforeAll 数据。
 */

const COLLECTION_COUNT = 30_000;
const TAG_COUNT = 10;
/** 命中 5% 的 collection 携带查询目标 tags（index % 20 === 0） */
const HIT_EVERY = 20;
const INSERT_BATCH = 5_000;
const MEASURE_ITERATIONS = 20;
const MEASURE_WARMUPS = 5;

/** 目标两个复合索引（用 key spec 控制创建/删除，避免依赖自动生成的索引名） */
const TAGS_INDEX_KEY: Record<string, 1 | -1> = { teamId: 1, datasetId: 1, tags: 1 };
const TAGS_TAGID_INDEX_KEY: Record<string, 1 | -1> = { teamId: 1, datasetId: 1, 'tags.tagId': 1 };
/** MongoDB 自动生成的索引名（key 字段名_方向 拼接） */
const TAGS_INDEX_NAME = 'teamId_1_datasetId_1_tags_1';
const TAGS_TAGID_INDEX_NAME = 'teamId_1_datasetId_1_tags.tagId_1';

type RootUser = Awaited<ReturnType<typeof getRootUser>>;

interface MeasureResult {
  avg: number;
  min: number;
  max: number;
  median: number;
  times: number[];
}

/* ========== 计时辅助 ========== */

async function measure(
  name: string,
  fn: () => Promise<unknown>,
  iterations = MEASURE_ITERATIONS,
  warmups = MEASURE_WARMUPS
): Promise<MeasureResult> {
  // 预热避开 JIT / 首次查询缓存抖动
  for (let i = 0; i < warmups; i++) await fn();

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const sorted = [...times].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  console.log(
    `    ${name.padEnd(26)}  平均: ${avg.toFixed(2).padStart(8)}ms  中位: ${median
      .toFixed(2)
      .padStart(8)}ms  最小: ${min.toFixed(2).padStart(8)}ms  最大: ${max.toFixed(2).padStart(8)}ms`
  );
  return { avg, min, max, median, times };
}

/* ========== explain 辅助 ========== */

interface ExplainStats {
  stages: string[];
  /** 若走 IXSCAN，命中的索引名 */
  indexName: string;
  totalDocsExamined: number;
  totalKeysExamined: number;
  executionTimeMillis: number;
  nReturned: number;
}

/** 递归收集 stage 树上的所有 stage 名（不同 MongoDB 版本嵌套深度不同） */
function collectStages(stage: any): string[] {
  if (!stage) return [];
  const result = [stage.stage];
  if (stage.inputStage) result.push(...collectStages(stage.inputStage));
  if (Array.isArray(stage.inputStages)) {
    for (const s of stage.inputStages) result.push(...collectStages(s));
  }
  return result;
}

/** 在 stage 树中查找指定名称的 stage */
function findStage(stage: any, name: string): any | undefined {
  if (!stage) return undefined;
  if (stage.stage === name) return stage;
  if (stage.inputStage) {
    const found = findStage(stage.inputStage, name);
    if (found) return found;
  }
  if (Array.isArray(stage.inputStages)) {
    for (const sub of stage.inputStages) {
      const found = findStage(sub, name);
      if (found) return found;
    }
  }
  return undefined;
}

interface ExplainTimeResult {
  avg: number;
  median: number;
}

/** 多次 explain 采样服务端 executionTimeMillis，取平均与中位（避免单次测量噪声） */
async function measureExplainTime(
  query: Record<string, unknown>,
  iterations = 10,
  warmups = 3
): Promise<ExplainTimeResult> {
  for (let i = 0; i < warmups; i++) {
    await MongoDatasetCollection.find(query, '_id').explain('executionStats');
  }

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const raw = (await MongoDatasetCollection.find(query, '_id')
      .explain('executionStats')
      .then((res: any) => res[0] ?? res)) as any;
    times.push(raw?.executionStats?.executionTimeMillis ?? 0);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const sorted = [...times].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return { avg, median };
}

async function explainQuery(
  query: Record<string, unknown>,
  hint?: Record<string, 1 | -1>
): Promise<ExplainStats> {
  let findQuery = MongoDatasetCollection.find(query, '_id');
  if (hint) findQuery = findQuery.hint(hint);
  const raw = (await findQuery.explain('executionStats').then((res: any) => res[0] ?? res)) as any;
  // debug: 打印完整 explain 结果（executionStages 树可能较大）
  // console.log(
  //   `explain raw: query=${JSON.stringify(query)}, executionStats=${JSON.stringify(raw)}`
  // );

  const winningPlan = raw?.queryPlanner?.winningPlan;
  const execStats = raw?.executionStats;
  const ixscan = findStage(winningPlan, 'IXSCAN');

  // executionStats 顶层字段优先，回退到 executionStages 树上的同名字段
  const totalDocsExamined =
    execStats?.totalDocsExamined ?? execStats?.executionStages?.totalDocsExamined ?? 0;
  const totalKeysExamined =
    execStats?.totalKeysExamined ?? execStats?.executionStages?.totalKeysExamined ?? 0;
  const executionTimeMillis = execStats?.executionTimeMillis ?? 0;
  const nReturned = execStats?.nReturned ?? execStats?.executionStages?.nReturned ?? 0;

  return {
    stages: collectStages(winningPlan),
    indexName: ixscan?.indexName ?? '',
    totalDocsExamined,
    totalKeysExamined,
    executionTimeMillis,
    nReturned
  };
}

/* ========== 数据准备 ========== */

function buildOldTags(index: number, isHit: boolean, tagIds: string[]): string[] {
  if (isHit) {
    // 命中：同时携带 tagIds[0] 与 tagIds[1]，再加一个干扰 tag
    return [tagIds[0], tagIds[1], tagIds[(index + 2) % TAG_COUNT]];
  }
  // 非命中：只携带一个 tag，单个元素永远不满足 $all [tagIds[0], tagIds[1]]
  return [tagIds[(index + 1) % TAG_COUNT]];
}

function buildNewTags(
  index: number,
  isHit: boolean,
  tagIds: string[]
): Array<{ tagId: string; value: string }> {
  if (isHit) {
    return [
      { tagId: tagIds[0], value: 'A' },
      { tagId: tagIds[1], value: 'B' },
      { tagId: tagIds[(index + 2) % TAG_COUNT], value: 'noise' }
    ];
  }
  return [{ tagId: tagIds[(index + 1) % TAG_COUNT], value: 'noise' }];
}

async function seedTagIndexData({ root, format }: { root: RootUser; format: 'old' | 'new' }) {
  const suffix = `${format}-${Date.now()}`;
  const dataset = await MongoDataset.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    name: `tag-index-${suffix}`,
    type: DatasetTypeEnum.dataset,
    vectorModel: 'text-embedding-3-small',
    agentModel: 'gpt-4o-mini'
  });

  const datasetId = String(dataset._id);
  const tagIds = Array.from({ length: TAG_COUNT }, () => new Types.ObjectId().toString());

  // 分批插入，避免堆尖峰
  for (let start = 0; start < COLLECTION_COUNT; start += INSERT_BATCH) {
    const batchSize = Math.min(INSERT_BATCH, COLLECTION_COUNT - start);
    const docs = Array.from({ length: batchSize }, (_, k) => {
      const i = start + k;
      const isHit = i % HIT_EVERY === 0;
      return {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId,
        type: DatasetCollectionTypeEnum.file,
        name: `col-${suffix}-${i}`,
        tags: format === 'old' ? buildOldTags(i, isHit, tagIds) : buildNewTags(i, isHit, tagIds)
      };
    });
    await MongoDatasetCollection.insertMany(docs);
  }

  return { datasetId, tagIds };
}

/** 确保两个标签索引都存在（createIndex 幂等；显式指定 name 保证与删除/断言一致） */
async function ensureTagIndexes() {
  await MongoDatasetCollection.collection.createIndex(TAGS_INDEX_KEY, { name: TAGS_INDEX_NAME });
  await MongoDatasetCollection.collection.createIndex(TAGS_TAGID_INDEX_KEY, {
    name: TAGS_TAGID_INDEX_NAME
  });
}

/* ========== 断言场景 ========== */

async function assertIndexed(
  query: Record<string, unknown>,
  expectedIndexName: string,
  label: string
) {
  const exp = await explainQuery(query);
  // 必须使用被测标签索引，且索引扫描的文档数远小于全表
  expect(exp.stages).toContain('IXSCAN');
  expect(exp.indexName).toBe(expectedIndexName);
  expect(exp.totalDocsExamined).toBeLessThan(COLLECTION_COUNT * 0.2);
  // 索引场景的服务端执行时间：多次 explain 取中位，避免单次噪声（内存 mongo / CI 波动大，取宽松值）
  const time = await measureExplainTime(query);
  expect(time.median).toBeLessThan(300);
  console.log(
    `    [${label} 有索引 explain] stage=${exp.stages.join('->')}  index=${exp.indexName}  examined=${exp.totalDocsExamined}  keys=${exp.totalKeysExamined}  returned=${exp.nReturned}  time(avg/median)=${time.avg.toFixed(1)}/${time.median.toFixed(1)}ms`
  );
  return { ...exp, time };
}

async function assertUnindexed(query: Record<string, unknown>, label: string) {
  const exp = await explainQuery(query);
  // 标签索引被删除后，优化器只能退到其他复合索引的前缀（teamId+datasetId）扫描全部文档，
  // 因此扫描量接近全表（此处可能表现为 IXSCAN on createTime/fileId 索引或 COLLSCAN，
  // 不强制 COLLSCAN）
  expect(exp.totalDocsExamined).toBeGreaterThanOrEqual(COLLECTION_COUNT * 0.9);
  expect(exp.indexName).not.toMatch(/tags/i);
  const time = await measureExplainTime(query);
  console.log(
    `    [${label} 无索引 explain] stage=${exp.stages.join('->')}  index=${exp.indexName || 'N/A'}  examined=${exp.totalDocsExamined}  keys=${exp.totalKeysExamined}  returned=${exp.nReturned}  time(avg/median)=${time.avg.toFixed(1)}/${time.median.toFixed(1)}ms`
  );
  return { ...exp, time };
}

/* ========== 测试 ========== */

describe('dataset_collections 标签索引性能对比（真实 MongoDB）', () => {
  it('旧格式：tags 复合索引 vs 无索引', async () => {
    const root = await getRootUser();
    const { datasetId, tagIds } = await seedTagIndexData({ root, format: 'old' });
    const query = {
      teamId: root.teamId,
      datasetId,
      tags: { $all: [tagIds[0], tagIds[1]] }
    };
    const runQuery = () => MongoDatasetCollection.find(query, '_id').lean();

    try {
      // 有索引：只保留 tags 复合索引，避免优化器误选 tags.tagId 索引（后者会导致 FETCH 全表）
      await ensureTagIndexes();
      await MongoDatasetCollection.collection.dropIndex(TAGS_TAGID_INDEX_NAME);
      const expIndexed = await assertIndexed(query, TAGS_INDEX_NAME, '旧格式 tags');
      const mIndexed = await measure('旧格式 + tags 索引', runQuery);

      // 无索引：删掉 tags 复合索引
      await MongoDatasetCollection.collection.dropIndex(TAGS_INDEX_NAME);
      const expUnindexed = await assertUnindexed(query, '旧格式 tags');
      const mUnindexed = await measure('旧格式 + 无索引', runQuery);

      // 断言：无索引扫描量/耗时明显大于有索引
      expect(expUnindexed.totalDocsExamined).toBeGreaterThan(expIndexed.totalDocsExamined * 5);
      expect(expUnindexed.time.median).toBeGreaterThan(expIndexed.time.median);
      expect(mUnindexed.median).toBeGreaterThan(mIndexed.median);

      console.log(
        `  [旧格式 tags] examined 倍率: ${(expUnindexed.totalDocsExamined / expIndexed.totalDocsExamined).toFixed(1)}x  执行时间倍率(median): ${(expUnindexed.time.median / expIndexed.time.median).toFixed(1)}x  中位延迟倍率: ${(mUnindexed.median / mIndexed.median).toFixed(1)}x`
      );
    } finally {
      // 恢复全部索引，避免影响下一个用例
      await ensureTagIndexes();
    }
  }, 300_000);

  it('新格式：tags.tagId 复合索引 vs 无索引', async () => {
    const root = await getRootUser();
    const { datasetId, tagIds } = await seedTagIndexData({ root, format: 'new' });
    const query = {
      teamId: root.teamId,
      datasetId,
      'tags.tagId': { $all: [tagIds[0], tagIds[1]] }
    };
    const runQuery = () => MongoDatasetCollection.find(query, '_id').lean();

    try {
      // 有索引：只保留 tags.tagId 复合索引，避免优化器误选 tags 索引（后者会导致 FETCH 全表）
      await ensureTagIndexes();
      await MongoDatasetCollection.collection.dropIndex(TAGS_INDEX_NAME);
      const expIndexed = await assertIndexed(query, TAGS_TAGID_INDEX_NAME, '新格式 tags.tagId');
      const mIndexed = await measure('新格式 + tags.tagId 索引', runQuery);

      // 无索引：删掉 tags.tagId 复合索引
      await MongoDatasetCollection.collection.dropIndex(TAGS_TAGID_INDEX_NAME);
      const expUnindexed = await assertUnindexed(query, '新格式 tags.tagId');
      const mUnindexed = await measure('新格式 + 无索引', runQuery);

      // 断言：无索引扫描量/耗时明显大于有索引
      expect(expUnindexed.totalDocsExamined).toBeGreaterThan(expIndexed.totalDocsExamined * 5);
      expect(expUnindexed.time.median).toBeGreaterThan(expIndexed.time.median);
      expect(mUnindexed.median).toBeGreaterThan(mIndexed.median);

      console.log(
        `  [新格式 tags.tagId] examined 倍率: ${(expUnindexed.totalDocsExamined / expIndexed.totalDocsExamined).toFixed(1)}x  执行时间倍率(median): ${(expUnindexed.time.median / expIndexed.time.median).toFixed(1)}x  中位延迟倍率: ${(mUnindexed.median / mIndexed.median).toFixed(1)}x`
      );
    } finally {
      // 恢复全部索引，避免影响下一个用例
      await ensureTagIndexes();
    }
  }, 300_000);

  it('新格式：hint 强制走 tags.tagId 索引（生产两索引并存）', async () => {
    const root = await getRootUser();
    const { datasetId, tagIds } = await seedTagIndexData({ root, format: 'new' });
    const query = {
      teamId: root.teamId,
      datasetId,
      'tags.tagId': { $all: [tagIds[0], tagIds[1]] }
    };

    try {
      // 生产状态：两个标签索引并存
      await ensureTagIndexes();

      // 不加 hint：记录规划器自由选择的索引（优化器行为随环境/数据分布可能不同，不强断言）
      const noHint = await explainQuery(query);
      // 加 hint：必须强制走 tags.tagId 索引（修复的核心保证）
      const hinted = await explainQuery(query, TAGS_TAGID_INDEX_KEY);
      expect(hinted.indexName).toBe(TAGS_TAGID_INDEX_NAME);
      expect(hinted.totalDocsExamined).toBeLessThan(COLLECTION_COUNT * 0.2);
      // hint 后的扫描量不应比规划器自选更大
      expect(hinted.totalDocsExamined).toBeLessThanOrEqual(noHint.totalDocsExamined);

      console.log(
        `  [新格式 hint 验证] 无 hint: ${noHint.indexName} (examined=${noHint.totalDocsExamined}) -> 有 hint: ${hinted.indexName} (examined=${hinted.totalDocsExamined})`
      );
    } finally {
      await ensureTagIndexes();
    }
  }, 300_000);

  it('旧格式：两索引并存时查询仍走 tags 索引（不受 tags.tagId 索引影响）', async () => {
    const root = await getRootUser();
    const { datasetId, tagIds } = await seedTagIndexData({ root, format: 'old' });
    const query = {
      teamId: root.teamId,
      datasetId,
      tags: { $all: [tagIds[0], tagIds[1]] }
    };

    try {
      // 生产状态：两个标签索引并存
      await ensureTagIndexes();

      // 不加 hint：旧格式查询按 tags 字段匹配，tags.tagId 索引无法精准服务该查询，
      // 规划器应仍选择 tags 索引（否则会像新格式一样退到前缀索引导致全表 FETCH）
      const noHint = await explainQuery(query);
      expect(noHint.indexName).toBe(TAGS_INDEX_NAME);
      expect(noHint.totalDocsExamined).toBeLessThan(COLLECTION_COUNT * 0.2);

      // 加 hint 强制 tags 索引：结果应同样高效
      const hinted = await explainQuery(query, TAGS_INDEX_KEY);
      expect(hinted.indexName).toBe(TAGS_INDEX_NAME);
      expect(hinted.totalDocsExamined).toBeLessThan(COLLECTION_COUNT * 0.2);

      console.log(
        `  [旧格式两索引并存] 无 hint: ${noHint.indexName} (examined=${noHint.totalDocsExamined}) -> 有 hint: ${hinted.indexName} (examined=${hinted.totalDocsExamined})`
      );
    } finally {
      await ensureTagIndexes();
    }
  }, 300_000);

  it('端到端：filterCollectionByKeyValueTags 应用层比较成本（真实数据）', async () => {
    const root = await getRootUser();
    const { datasetId, tagIds } = await seedTagIndexData({ root, format: 'new' });

    // 同步真实 v2 标签表，供 filter 按标签名解析 tagId（_id 与集合 tags.tagId 一致）
    await MongoDatasetCollectionTagsV2.collection.createIndex(
      { teamId: 1, datasetId: 1, tag: 1 },
      { unique: true }
    );
    await MongoDatasetCollectionTagsV2.insertMany(
      tagIds.map((id, i) => ({
        teamId: root.teamId,
        datasetId,
        tag: `tag-${i}`,
        tagType: 'string',
        _id: new Types.ObjectId(id)
      }))
    );

    // 生产状态：两个标签索引并存，filter 内部 hint 强制走 tags.tagId 索引
    await ensureTagIndexes();

    const filter = () =>
      filterCollectionByKeyValueTags({
        $and: [{ 'tag-0': { $eq: 'A' } }, { 'tag-1': { $eq: 'B' } }],
        $or: [],
        teamId: root.teamId,
        datasetIds: [datasetId]
      });

    // 命中 5% 的 collection（index % 20 === 0）同时携带 tagIds[0]('A') 与 tagIds[1]('B')
    const hit = await filter();
    expect(hit?.length).toBe(Math.floor(COLLECTION_COUNT / HIT_EVERY));
    console.log(`  [端到端] 命中集合数: ${hit?.length}`);

    const full = await measure('端到端 filterCollectionByKeyValueTags', filter);

    // 对照纯 tags.tagId 索引查询，量化应用层 checkValue 比较增量
    const query = {
      teamId: root.teamId,
      datasetId,
      'tags.tagId': { $all: [tagIds[0], tagIds[1]] }
    };
    const raw = await measure('纯 tags.tagId 索引查询', () =>
      MongoDatasetCollection.find(query, '_id').hint(TAGS_TAGID_INDEX_KEY).lean()
    );
    console.log(
      `  [端到端] 应用层比较增量: ${(full.median - raw.median).toFixed(2)}ms（filter 中位 ${full.median.toFixed(2)}ms - 索引查询中位 ${raw.median.toFixed(2)}ms）`
    );
  }, 300_000);
});

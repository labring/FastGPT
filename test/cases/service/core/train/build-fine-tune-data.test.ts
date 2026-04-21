/**
 * build-fine-tune-data.test.ts
 *
 * 测试 buildFineTuneDataStream（AsyncGenerator）的内存优化重构版本。
 * 使用真实 MongoDB（via setup.ts 基础设施），不 mock DB。
 *
 * T-B1:  基本流式输出 - N 个有 default index 的 doc → yield N 个 FineTuneSample
 * T-B2:  query = cleanText(target indexType 的 index text)
 * T-B3a: A 非空时 positive = [Q + "\n" + A]
 * T-B3b: A 为空时 positive = [Q]
 * T-B4:  无 target indexType 的 source doc 被跳过
 * T-B5:  strategy=1 → negatives 来自同知识库同 collection
 * T-B6:  strategy=2 → negatives 来自同知识库其他 collection
 * T-B7:  strategy=3 → negatives 来自其他知识库
 * T-B8:  strategy=4 → negatives 混合三个来源
 * T-B9:  negatives 不包含自身 sourceId 的 qaText
 * T-B10: negatives dataId 无重复（通过文本去重验证）
 * T-B11: minNeg/maxNeg 约束生效
 * T-B12: 空 sampledItems → generator 直接结束（无 yield）
 */

import { describe, test, expect, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { buildFineTuneDataStream } from '@fastgpt/service/core/train/common/synthesize/buildFineTuneData';
import type { SampledDataItem } from '@fastgpt/service/core/train/common/utils';

// ─── Mock ─────────────────────────────────────────────────────────────────────
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

/** 收集 AsyncGenerator 所有结果 */
async function collectStream<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of gen) {
    results.push(item);
  }
  return results;
}

/** 插入单个 doc，返回 SampledDataItem */
async function insertDocAndGetItem(doc: {
  teamId: Types.ObjectId;
  tmbId: Types.ObjectId;
  datasetId: Types.ObjectId;
  collectionId: Types.ObjectId;
  q: string;
  a?: string;
  indexes: { type: string; dataId: string; text: string }[];
}): Promise<SampledDataItem> {
  const [inserted] = await MongoDatasetData.insertMany([doc]);
  return {
    dataId: inserted._id.toString(),
    datasetId: doc.datasetId.toString(),
    collectionId: doc.collectionId.toString()
  };
}

/** 批量插入 docs，返回 SampledDataItem[] */
async function insertDocsAndGetItems(
  docs: {
    teamId: Types.ObjectId;
    tmbId: Types.ObjectId;
    datasetId: Types.ObjectId;
    collectionId: Types.ObjectId;
    q: string;
    a?: string;
    indexes: { type: string; dataId: string; text: string }[];
  }[]
): Promise<SampledDataItem[]> {
  const inserted = await MongoDatasetData.insertMany(docs);
  return inserted.map((doc, i) => ({
    dataId: doc._id.toString(),
    datasetId: docs[i].datasetId.toString(),
    collectionId: docs[i].collectionId.toString()
  }));
}

/** 生成 question index（与 buildFineTuneDataStream 默认 indexType 对齐） */
function defaultIndex(text: string) {
  return { type: 'question', dataId: new Types.ObjectId().toString(), text };
}

/** 生成 non-default index（用于测试 target indexType 过滤） */
function otherIndex(text: string) {
  return { type: 'custom', dataId: new Types.ObjectId().toString(), text };
}

// ─── T-B1 ─────────────────────────────────────────────────────────────────────
describe('T-B1: 基本流式输出', () => {
  test('3 个有 default index 的 doc → yield 3 个 FineTuneSample', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const collectionId = new Types.ObjectId();

    const docs = Array.from({ length: 3 }, (_, i) => ({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: `question_${i}`,
      a: `answer_${i}`,
      indexes: [defaultIndex(`idx_text_${i}`)]
    }));

    const sampledItems = await insertDocsAndGetItems(docs);

    const gen = buildFineTuneDataStream({ sampledItems, indexType: 'question' });
    const results = await collectStream(gen);

    expect(results.length).toBe(3);
  });
});

// ─── T-B2 ─────────────────────────────────────────────────────────────────────
describe('T-B2: query = cleanText(target indexType 的 index text)', () => {
  test('index text 不含特殊字符时 query 与 text 相同', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const collectionId = new Types.ObjectId();

    const indexText = 'query text for testing purposes';

    const item = await insertDocAndGetItem({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: 'some question',
      a: 'some answer',
      indexes: [defaultIndex(indexText)]
    });

    const gen = buildFineTuneDataStream({ sampledItems: [item], indexType: 'question' });
    const results = await collectStream(gen);

    expect(results.length).toBe(1);
    expect(results[0].query).toBe(indexText);
  });
});

// ─── T-B3 ─────────────────────────────────────────────────────────────────────
describe('T-B3: positive 构建规则', () => {
  test('T-B3a: A 非空时 positive = [Q + "\\n" + A]', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const collectionId = new Types.ObjectId();

    const item = await insertDocAndGetItem({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: 'q_text here',
      a: 'a_text answer',
      indexes: [defaultIndex('idx_text')]
    });

    const gen = buildFineTuneDataStream({ sampledItems: [item], indexType: 'question' });
    const results = await collectStream(gen);

    expect(results.length).toBe(1);
    expect(results[0].positive).toEqual(['q_text here\na_text answer']);
  });

  test('T-B3b: A 为空字符串时 positive = [Q]', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const collectionId = new Types.ObjectId();

    const item = await insertDocAndGetItem({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: 'only_question_text',
      a: '',
      indexes: [defaultIndex('idx_text')]
    });

    const gen = buildFineTuneDataStream({ sampledItems: [item], indexType: 'question' });
    const results = await collectStream(gen);

    expect(results.length).toBe(1);
    expect(results[0].positive).toEqual(['only_question_text']);
  });
});

// ─── T-B4 ─────────────────────────────────────────────────────────────────────
describe('T-B4: 无 target indexType 的 source doc 被跳过', () => {
  test('只有 type=other 的 index 的 doc 被跳过，只 yield 有 default index 的', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const collectionId = new Types.ObjectId();

    const [docWithOther, docWithDefault] = await insertDocsAndGetItems([
      {
        teamId,
        tmbId,
        datasetId,
        collectionId,
        q: 'question_other',
        a: 'answer_other',
        indexes: [otherIndex('other_idx')]
      },
      {
        teamId,
        tmbId,
        datasetId,
        collectionId,
        q: 'question_default',
        a: 'answer_default',
        indexes: [defaultIndex('default_idx')]
      }
    ]);

    const gen = buildFineTuneDataStream({
      sampledItems: [docWithOther, docWithDefault],
      indexType: 'question'
    });
    const results = await collectStream(gen);

    expect(results.length).toBe(1);
    expect(results[0].query).toBe('default_idx');
  });
});

// ─── T-B5 ─────────────────────────────────────────────────────────────────────
describe('T-B5: strategy=1 → negatives 来自同知识库同 collection', () => {
  test('ds1/coll1 的 result 的 negatives 都在 ds1/coll1 的 qaText 集合中', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const ds1 = new Types.ObjectId();
    const coll1 = new Types.ObjectId();
    const coll2 = new Types.ObjectId();
    const ds2 = new Types.ObjectId();

    // ds1/coll1: 20 docs
    const ds1c1Docs = Array.from({ length: 20 }, (_, i) => ({
      teamId,
      tmbId,
      datasetId: ds1,
      collectionId: coll1,
      q: `q_ds1c1_${i}`,
      a: `a_ds1c1_${i}`,
      indexes: [defaultIndex(`idx_ds1c1_${i}`)]
    }));
    // ds1/coll2: 5 docs
    const ds1c2Docs = Array.from({ length: 5 }, (_, i) => ({
      teamId,
      tmbId,
      datasetId: ds1,
      collectionId: coll2,
      q: `q_ds1c2_${i}`,
      a: `a_ds1c2_${i}`,
      indexes: [defaultIndex(`idx_ds1c2_${i}`)]
    }));
    // ds2: 5 docs
    const ds2Docs = Array.from({ length: 5 }, (_, i) => ({
      teamId,
      tmbId,
      datasetId: ds2,
      collectionId: new Types.ObjectId(),
      q: `q_ds2_${i}`,
      a: `a_ds2_${i}`,
      indexes: [defaultIndex(`idx_ds2_${i}`)]
    }));

    const allDocs = [...ds1c1Docs, ...ds1c2Docs, ...ds2Docs];
    const sampledItems = await insertDocsAndGetItems(allDocs);

    const gen = buildFineTuneDataStream({
      sampledItems,
      indexType: 'question',
      negativeStrategy: 1,
      minNegativeSamples: 1,
      maxNegativeSamples: 5
    });
    const results = await collectStream(gen);

    // ds1/coll1 的 qaText 集合
    const ds1c1QASet = new Set(Array.from({ length: 20 }, (_, i) => `q_ds1c1_${i}\na_ds1c1_${i}`));

    // 过滤出 ds1/coll1 的 results
    const ds1c1SampledIds = new Set(sampledItems.slice(0, 20).map((item) => item.dataId));
    const ds1c1Results = results.filter((r) => ds1c1SampledIds.has(r.sourceId));

    expect(ds1c1Results.length).toBeGreaterThan(0);

    // 验证 negatives 都来自 ds1/coll1
    for (const result of ds1c1Results) {
      expect(result.negatives.length).toBeGreaterThan(0);
      for (const neg of result.negatives) {
        expect(ds1c1QASet.has(neg)).toBe(true);
      }
    }
  });
});

// ─── T-B6 ─────────────────────────────────────────────────────────────────────
describe('T-B6: strategy=2 → negatives 来自同知识库其他 collection', () => {
  test('ds1/coll1 的 negatives 都在 ds1/coll2 的 qaText 集合中', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const ds1 = new Types.ObjectId();
    const coll1 = new Types.ObjectId();
    const coll2 = new Types.ObjectId();
    const ds2 = new Types.ObjectId();

    // ds1/coll1: 10 docs
    const ds1c1Docs = Array.from({ length: 10 }, (_, i) => ({
      teamId,
      tmbId,
      datasetId: ds1,
      collectionId: coll1,
      q: `q_ds1c1_${i}`,
      a: `a_ds1c1_${i}`,
      indexes: [defaultIndex(`idx_ds1c1_${i}`)]
    }));
    // ds1/coll2: 10 docs
    const ds1c2Docs = Array.from({ length: 10 }, (_, i) => ({
      teamId,
      tmbId,
      datasetId: ds1,
      collectionId: coll2,
      q: `q_ds1c2_${i}`,
      a: `a_ds1c2_${i}`,
      indexes: [defaultIndex(`idx_ds1c2_${i}`)]
    }));
    // ds2: 5 docs
    const ds2Docs = Array.from({ length: 5 }, (_, i) => ({
      teamId,
      tmbId,
      datasetId: ds2,
      collectionId: new Types.ObjectId(),
      q: `q_ds2_${i}`,
      a: `a_ds2_${i}`,
      indexes: [defaultIndex(`idx_ds2_${i}`)]
    }));

    const allDocs = [...ds1c1Docs, ...ds1c2Docs, ...ds2Docs];
    const sampledItems = await insertDocsAndGetItems(allDocs);

    const gen = buildFineTuneDataStream({
      sampledItems,
      indexType: 'question',
      negativeStrategy: 2,
      minNegativeSamples: 1,
      maxNegativeSamples: 5
    });
    const results = await collectStream(gen);

    // ds1/coll2 的 qaText 集合
    const ds1c2QASet = new Set(Array.from({ length: 10 }, (_, i) => `q_ds1c2_${i}\na_ds1c2_${i}`));

    const ds1c1SampledIds = new Set(sampledItems.slice(0, 10).map((item) => item.dataId));
    const ds1c1Results = results.filter((r) => ds1c1SampledIds.has(r.sourceId));

    expect(ds1c1Results.length).toBeGreaterThan(0);

    for (const result of ds1c1Results) {
      expect(result.negatives.length).toBeGreaterThan(0);
      for (const neg of result.negatives) {
        expect(ds1c2QASet.has(neg)).toBe(true);
      }
    }
  });
});

// ─── T-B7 ─────────────────────────────────────────────────────────────────────
describe('T-B7: strategy=3 → negatives 来自其他知识库', () => {
  test('ds1 的 negatives 都在 ds2 的 qaText 集合中', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const ds1 = new Types.ObjectId();
    const ds2 = new Types.ObjectId();
    const coll1 = new Types.ObjectId();
    const coll2 = new Types.ObjectId();

    // ds1: 10 docs
    const ds1Docs = Array.from({ length: 10 }, (_, i) => ({
      teamId,
      tmbId,
      datasetId: ds1,
      collectionId: coll1,
      q: `q_ds1_${i}`,
      a: `a_ds1_${i}`,
      indexes: [defaultIndex(`idx_ds1_${i}`)]
    }));
    // ds2: 10 docs
    const ds2Docs = Array.from({ length: 10 }, (_, i) => ({
      teamId,
      tmbId,
      datasetId: ds2,
      collectionId: coll2,
      q: `q_ds2_${i}`,
      a: `a_ds2_${i}`,
      indexes: [defaultIndex(`idx_ds2_${i}`)]
    }));

    const sampledItems = await insertDocsAndGetItems([...ds1Docs, ...ds2Docs]);

    const gen = buildFineTuneDataStream({
      sampledItems,
      indexType: 'question',
      negativeStrategy: 3,
      minNegativeSamples: 1,
      maxNegativeSamples: 5
    });
    const results = await collectStream(gen);

    // ds2 的 qaText 集合
    const ds2QASet = new Set(Array.from({ length: 10 }, (_, i) => `q_ds2_${i}\na_ds2_${i}`));

    const ds1SampledIds = new Set(sampledItems.slice(0, 10).map((item) => item.dataId));
    const ds1Results = results.filter((r) => ds1SampledIds.has(r.sourceId));

    expect(ds1Results.length).toBeGreaterThan(0);

    for (const result of ds1Results) {
      expect(result.negatives.length).toBeGreaterThan(0);
      for (const neg of result.negatives) {
        expect(ds2QASet.has(neg)).toBe(true);
      }
    }
  });
});

// ─── T-B8 ─────────────────────────────────────────────────────────────────────
describe('T-B8: strategy=4 → negatives 混合三个来源', () => {
  test('ds1/coll1 的第一个 result 的 negatives 包含来自三个来源的文本', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const ds1 = new Types.ObjectId();
    const ds2 = new Types.ObjectId();
    const coll1 = new Types.ObjectId();
    const coll2 = new Types.ObjectId();
    const coll3 = new Types.ObjectId();

    // ds1/coll1: 20 docs
    const ds1c1Docs = Array.from({ length: 20 }, (_, i) => ({
      teamId,
      tmbId,
      datasetId: ds1,
      collectionId: coll1,
      q: `q_ds1c1_${i}`,
      a: `a_ds1c1_${i}`,
      indexes: [defaultIndex(`idx_ds1c1_${i}`)]
    }));
    // ds1/coll2: 20 docs
    const ds1c2Docs = Array.from({ length: 20 }, (_, i) => ({
      teamId,
      tmbId,
      datasetId: ds1,
      collectionId: coll2,
      q: `q_ds1c2_${i}`,
      a: `a_ds1c2_${i}`,
      indexes: [defaultIndex(`idx_ds1c2_${i}`)]
    }));
    // ds2: 20 docs
    const ds2Docs = Array.from({ length: 20 }, (_, i) => ({
      teamId,
      tmbId,
      datasetId: ds2,
      collectionId: coll3,
      q: `q_ds2_${i}`,
      a: `a_ds2_${i}`,
      indexes: [defaultIndex(`idx_ds2_${i}`)]
    }));

    const allDocs = [...ds1c1Docs, ...ds1c2Docs, ...ds2Docs];
    const sampledItems = await insertDocsAndGetItems(allDocs);

    const gen = buildFineTuneDataStream({
      sampledItems,
      indexType: 'question',
      negativeStrategy: 4,
      minNegativeSamples: 3,
      maxNegativeSamples: 9
    });
    const results = await collectStream(gen);

    const ds1c1QA = new Set(Array.from({ length: 20 }, (_, i) => `q_ds1c1_${i}\na_ds1c1_${i}`));
    const ds1c2QA = new Set(Array.from({ length: 20 }, (_, i) => `q_ds1c2_${i}\na_ds1c2_${i}`));
    const ds2QA = new Set(Array.from({ length: 20 }, (_, i) => `q_ds2_${i}\na_ds2_${i}`));

    // 找 query 包含 "ds1c1_0" 的 result（对应 ds1/coll1 的第 0 个 doc）
    const testResult = results.find((r) => r.query.includes('ds1c1_0'));
    expect(testResult).toBeDefined();

    let fromColl1 = 0;
    let fromColl2 = 0;
    let fromDs2 = 0;
    for (const neg of testResult!.negatives) {
      if (ds1c1QA.has(neg)) fromColl1++;
      if (ds1c2QA.has(neg)) fromColl2++;
      if (ds2QA.has(neg)) fromDs2++;
    }

    // strategy=4 应从三个来源均有贡献
    expect(fromColl1).toBeGreaterThan(0);
    expect(fromColl2).toBeGreaterThan(0);
    expect(fromDs2).toBeGreaterThan(0);
  });
});

// ─── T-B9 ─────────────────────────────────────────────────────────────────────
describe('T-B9: negatives 不包含自身 sourceId 的 qaText', () => {
  test('每个 result 的 negatives 不包含自身的 positive[0]', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const collectionId = new Types.ObjectId();

    const docs = Array.from({ length: 5 }, (_, i) => ({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: `q_item_${i}`,
      a: `a_item_${i}`,
      indexes: [defaultIndex(`idx_${i}`)]
    }));
    const sampledItems = await insertDocsAndGetItems(docs);

    const gen = buildFineTuneDataStream({
      sampledItems,
      indexType: 'question',
      minNegativeSamples: 1,
      maxNegativeSamples: 3
    });
    const results = await collectStream(gen);

    for (const result of results) {
      expect(result.negatives).not.toContain(result.positive[0]);
    }
  });
});

// ─── T-B10 ────────────────────────────────────────────────────────────────────
describe('T-B10: negatives 无重复文本', () => {
  test('每个 result 的 negatives 不含重复文本', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const collectionId = new Types.ObjectId();

    const docs = Array.from({ length: 30 }, (_, i) => ({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: `q_item_${i}`,
      a: `a_item_${i}`,
      indexes: [defaultIndex(`idx_${i}`)]
    }));
    const sampledItems = await insertDocsAndGetItems(docs);

    const gen = buildFineTuneDataStream({
      sampledItems,
      indexType: 'question',
      minNegativeSamples: 3,
      maxNegativeSamples: 10
    });
    const results = await collectStream(gen);

    for (const result of results) {
      const unique = new Set(result.negatives);
      expect(unique.size).toBe(result.negatives.length);
    }
  });
});

// ─── T-B11 ────────────────────────────────────────────────────────────────────
describe('T-B11: minNeg/maxNeg 约束生效', () => {
  test('50 个 doc，min=2，max=5 → 所有 result.negatives.length 在 [2, 5]', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const collectionId = new Types.ObjectId();

    const docs = Array.from({ length: 50 }, (_, i) => ({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: `q_item_${i}`,
      a: `a_item_${i}`,
      indexes: [defaultIndex(`idx_${i}`)]
    }));
    const sampledItems = await insertDocsAndGetItems(docs);

    const gen = buildFineTuneDataStream({
      sampledItems,
      indexType: 'question',
      minNegativeSamples: 2,
      maxNegativeSamples: 5
    });
    const results = await collectStream(gen);

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.negatives.length).toBeGreaterThanOrEqual(2);
      expect(result.negatives.length).toBeLessThanOrEqual(5);
    }
  });
});

// ─── T-B12 ────────────────────────────────────────────────────────────────────
describe('T-B12: 空 sampledItems → generator 直接结束（无 yield）', () => {
  test('空 sampledItems 收集结果为空数组', async () => {
    const gen = buildFineTuneDataStream({ sampledItems: [], indexType: 'question' });
    const results = await collectStream(gen);

    expect(results).toEqual([]);
  });
});

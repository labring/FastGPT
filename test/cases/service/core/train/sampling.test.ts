/**
 * sampling.test.ts
 *
 * 测试 sampleDataFromDataset 的内存优化重构版本（返回 SampledDataItem[]）。
 * 使用真实 MongoDB（via setup.ts 基础设施），不 mock DB。
 *
 * T-S1: 返回 SampledDataItem（只含 dataId/datasetId/collectionId，无 q/a/indexes）
 * T-S2: 低质量 q 文档被过滤
 * T-S3: indexes 为空的文档被 DB 查询排除
 * T-S4: train/eval 分割确定性且不重叠，合并覆盖 100%
 * T-S5: sampleSize 配额等权分配
 * T-S6: 空 KB 不报错，其他 KB 正常返回
 */

import { describe, test, expect, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { sampleDataFromDataset } from '@fastgpt/service/core/train/common/utils';

// ─── Mock ─────────────────────────────────────────────────────────────────────
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

// ─── 常量 ─────────────────────────────────────────────────────────────────────

/**
 * 有效的 q 字符串——必然通过质量过滤（长度、词数、熵等均满足要求）。
 */
const VALID_Q =
  'This is a well-formed training document that has sufficient length and word count to pass the quality filter requirements for the machine learning training pipeline.';

/** 构造测试用 MongoDB doc 所需的固定 IDs */
function makeIds() {
  return {
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId(),
    datasetId: new Types.ObjectId(),
    collectionId: new Types.ObjectId()
  };
}

/** 构造一个包含 default index 的有效 doc */
function makeValidDoc(overrides: {
  teamId: Types.ObjectId;
  tmbId: Types.ObjectId;
  datasetId: Types.ObjectId;
  collectionId: Types.ObjectId;
  q?: string;
}) {
  return {
    teamId: overrides.teamId,
    tmbId: overrides.tmbId,
    datasetId: overrides.datasetId,
    collectionId: overrides.collectionId,
    q: overrides.q ?? VALID_Q,
    a: 'some answer',
    indexes: [
      {
        type: 'default',
        dataId: new Types.ObjectId().toString(),
        text: 'index text for the document'
      }
    ]
  };
}

// ─── T-S1 ─────────────────────────────────────────────────────────────────────
describe('T-S1: 返回 SampledDataItem（只含 dataId/datasetId/collectionId）', () => {
  test('返回项只有 dataId/datasetId/collectionId，无 q/a/indexes 字段', async () => {
    const { teamId, tmbId, datasetId, collectionId } = makeIds();

    await MongoDatasetData.insertMany([makeValidDoc({ teamId, tmbId, datasetId, collectionId })]);

    const result = await sampleDataFromDataset([datasetId.toString()], { datasetType: 'random' });

    expect(result.length).toBe(1);

    const item = result[0];
    // 必须有的三个字段
    expect(typeof item.dataId).toBe('string');
    expect(typeof item.datasetId).toBe('string');
    expect(typeof item.collectionId).toBe('string');

    // datasetId/collectionId 与插入数据一致
    expect(item.datasetId).toBe(datasetId.toString());
    expect(item.collectionId).toBe(collectionId.toString());

    // 不应包含 q/a/indexes（优化后只返回 ID 信息）
    expect((item as any).q).toBeUndefined();
    expect((item as any).a).toBeUndefined();
    expect((item as any).indexes).toBeUndefined();
  });
});

// ─── T-S2 ─────────────────────────────────────────────────────────────────────
describe('T-S2: 低质量 q 文档被过滤', () => {
  test('太短和高重复的 q 被过滤，只有效文档被返回', async () => {
    const { teamId, tmbId, datasetId, collectionId } = makeIds();

    const invalidIndex = {
      type: 'default',
      dataId: new Types.ObjectId().toString(),
      text: 'index text'
    };

    await MongoDatasetData.insertMany([
      // 太短（不满足 minLength: 50）
      {
        teamId,
        tmbId,
        datasetId,
        collectionId,
        q: 'short',
        indexes: [{ ...invalidIndex, dataId: new Types.ObjectId().toString() }]
      },
      // 高重复（maxRepetitionRatio: 0.5）
      {
        teamId,
        tmbId,
        datasetId,
        collectionId,
        q: 'a'.repeat(200),
        indexes: [{ ...invalidIndex, dataId: new Types.ObjectId().toString() }]
      },
      // 有效文档
      makeValidDoc({ teamId, tmbId, datasetId, collectionId })
    ]);

    const result = await sampleDataFromDataset([datasetId.toString()], { datasetType: 'random' });

    expect(result.length).toBe(1);
  });
});

// ─── T-S3 ─────────────────────────────────────────────────────────────────────
describe('T-S3: indexes 为空的文档被 DB 查询排除', () => {
  test('indexes 为空数组的文档不出现在结果中', async () => {
    const { teamId, tmbId, datasetId, collectionId } = makeIds();

    await MongoDatasetData.insertMany([
      // indexes 为空——应被 DB 查询的 $exists 条件排除
      {
        teamId,
        tmbId,
        datasetId,
        collectionId,
        q: VALID_Q,
        indexes: []
      },
      // 有 indexes 的有效文档
      makeValidDoc({ teamId, tmbId, datasetId, collectionId })
    ]);

    const result = await sampleDataFromDataset([datasetId.toString()], { datasetType: 'random' });

    expect(result.length).toBe(1);
  });
});

// ─── T-S4 ─────────────────────────────────────────────────────────────────────
describe('T-S4: train/eval 分割确定性且不重叠，合并覆盖 100%', () => {
  test('trainIds 和 evalIds 无交集，合并恰好 10 个 ID', async () => {
    const { teamId, tmbId, datasetId, collectionId } = makeIds();

    // 插入 10 个有效 doc，q 略有不同使每个 doc 唯一
    const docs = Array.from({ length: 10 }, (_, i) =>
      makeValidDoc({
        teamId,
        tmbId,
        datasetId,
        collectionId,
        q: VALID_Q + ` doc${i}`
      })
    );
    await MongoDatasetData.insertMany(docs);

    const dsId = datasetId.toString();

    const trainResult = await sampleDataFromDataset([dsId], { datasetType: 'train' });
    const evalResult = await sampleDataFromDataset([dsId], { datasetType: 'eval' });

    // 应有 8 个 train，2 个 eval（80%/20% 分割）
    expect(trainResult.length).toBe(8);
    expect(evalResult.length).toBe(2);

    const trainIds = new Set(trainResult.map((r) => r.dataId));
    const evalIds = new Set(evalResult.map((r) => r.dataId));

    // 无交集
    for (const id of evalIds) {
      expect(trainIds.has(id)).toBe(false);
    }

    // 合并刚好 10 个不重复 ID
    const allIds = new Set([...trainIds, ...evalIds]);
    expect(allIds.size).toBe(10);
  });
});

// ─── T-S5 ─────────────────────────────────────────────────────────────────────
describe('T-S5: sampleSize 配额等权分配', () => {
  test('两个 KB 各 20 doc，sampleSize=10 → 各采 5 个', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId1 = new Types.ObjectId();
    const datasetId2 = new Types.ObjectId();
    const collectionId = new Types.ObjectId();

    const docs1 = Array.from({ length: 20 }, () =>
      makeValidDoc({ teamId, tmbId, datasetId: datasetId1, collectionId })
    );
    const docs2 = Array.from({ length: 20 }, () =>
      makeValidDoc({ teamId, tmbId, datasetId: datasetId2, collectionId })
    );

    await MongoDatasetData.insertMany([...docs1, ...docs2]);

    const result = await sampleDataFromDataset([datasetId1.toString(), datasetId2.toString()], {
      sampleSize: 10
    });

    expect(result.length).toBe(10);

    const fromDs1 = result.filter((r) => r.datasetId === datasetId1.toString());
    const fromDs2 = result.filter((r) => r.datasetId === datasetId2.toString());

    expect(fromDs1.length).toBe(5);
    expect(fromDs2.length).toBe(5);
  });
});

// ─── T-S6 ─────────────────────────────────────────────────────────────────────
describe('T-S6: 空 KB 不报错，其他 KB 正常返回', () => {
  test('emptyDatasetId 无数据，validDatasetId 有1个 → 返回1个来自 validDatasetId', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const emptyDatasetId = new Types.ObjectId();
    const validDatasetId = new Types.ObjectId();
    const collectionId = new Types.ObjectId();

    // 只往 validDatasetId 插入数据
    await MongoDatasetData.insertMany([
      makeValidDoc({ teamId, tmbId, datasetId: validDatasetId, collectionId })
    ]);

    // 不应抛错
    const result = await sampleDataFromDataset(
      [emptyDatasetId.toString(), validDatasetId.toString()],
      { datasetType: 'random' }
    );

    expect(result.length).toBe(1);
    expect(result[0].datasetId).toBe(validDatasetId.toString());
  });
});

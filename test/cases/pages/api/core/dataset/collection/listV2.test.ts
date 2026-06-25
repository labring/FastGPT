/**
 * dataset/collection/listV2 单元测试
 *
 * 测试范围：
 *   1. getFileStatus 纯函数 — 覆盖所有 CollectionStatusEnum 状态分支
 *   2. Worker stats 计算 — 真实 MongoDB 数据，验证预计算字段正确性
 *   3. 性能测试 — 1w+ 数据场景下 stats 计算耗时
 *
 * 运行方式（从项目根目录）：
 *   MONGODB_TEST_URI=<uri> node_modules/.bin/vitest run test/cases/pages/api/core/dataset/collection/listV2.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { CollectionStatusEnum, TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';

// ============================================================
// 纯函数测试 — getFileStatus
// ============================================================
const getFileStatus = (item: {
  dataAmount: number;
  trainingAmount: number;
  hasError?: boolean;
  tableSchemaExist?: boolean;
  hasActive?: boolean;
  allParse?: boolean;
  parseStartTime?: Date;
  processedCount?: number;
}): CollectionStatusEnum => {
  if (item.tableSchemaExist === false) return CollectionStatusEnum.notExist;
  if (item.hasError) return CollectionStatusEnum.error;
  if (item.trainingAmount > 0) {
    if (item.allParse && !item.parseStartTime) return CollectionStatusEnum.queued;
    if (item.allParse) return CollectionStatusEnum.parsing;
    return CollectionStatusEnum.indexing;
  }
  if (item.dataAmount > 0 && (item.processedCount ?? 0) < item.dataAmount) {
    return (item.processedCount ?? 0) === 0
      ? CollectionStatusEnum.queued
      : CollectionStatusEnum.indexing;
  }
  return CollectionStatusEnum.ready;
};

describe('getFileStatus', () => {
  it('tableSchemaExist=false → notExist', () => {
    expect(getFileStatus({ dataAmount: 100, trainingAmount: 0, tableSchemaExist: false })).toBe(
      CollectionStatusEnum.notExist
    );
  });

  it('hasError=true → error', () => {
    expect(getFileStatus({ dataAmount: 100, trainingAmount: 5, hasError: true })).toBe(
      CollectionStatusEnum.error
    );
  });

  it('notExist 优先于 hasError（tableSchemaExist=false 先检查）', () => {
    expect(
      getFileStatus({
        dataAmount: 100,
        trainingAmount: 5,
        hasError: true,
        tableSchemaExist: false
      })
    ).toBe(CollectionStatusEnum.notExist);
  });

  it('trainingAmount>0 + allParse + 无 parseStartTime → queued', () => {
    expect(getFileStatus({ dataAmount: 100, trainingAmount: 3, allParse: true })).toBe(
      CollectionStatusEnum.queued
    );
  });

  it('trainingAmount>0 + allParse + 有 parseStartTime → parsing', () => {
    expect(
      getFileStatus({
        dataAmount: 100,
        trainingAmount: 3,
        allParse: true,
        parseStartTime: new Date()
      })
    ).toBe(CollectionStatusEnum.parsing);
  });

  it('trainingAmount>0 + !allParse → indexing', () => {
    expect(getFileStatus({ dataAmount: 100, trainingAmount: 3, allParse: false })).toBe(
      CollectionStatusEnum.indexing
    );
  });

  it('trainingAmount=0 + data >0 + processedCount=0 → queued（未开始处理）', () => {
    expect(getFileStatus({ dataAmount: 100, trainingAmount: 0, processedCount: 0 })).toBe(
      CollectionStatusEnum.queued
    );
  });

  it('trainingAmount=0 + 0 < processedCount < dataAmount → indexing（处理中断）', () => {
    expect(getFileStatus({ dataAmount: 100, trainingAmount: 0, processedCount: 50 })).toBe(
      CollectionStatusEnum.indexing
    );
  });

  it('trainingAmount=0 + data >0 + processedCount=dataAmount → ready（已全部完成）', () => {
    expect(getFileStatus({ dataAmount: 100, trainingAmount: 0, processedCount: 100 })).toBe(
      CollectionStatusEnum.ready
    );
  });

  it('trainingAmount=0 + data=0 → ready（空文档）', () => {
    expect(getFileStatus({ dataAmount: 0, trainingAmount: 0 })).toBe(CollectionStatusEnum.ready);
  });
});

// ============================================================
// MongoDB 集成测试 — Worker stats 计算
// ============================================================

/** 生成随机 ObjectId */
const newId = () => String(new Types.ObjectId());

describe('Worker stats computation (real MongoDB)', () => {
  let teamId: string;
  let tmbId: string;
  let datasetId: string;
  let collectionId: string;

  beforeEach(async () => {
    teamId = newId();
    tmbId = newId();
  });

  async function setupDataset() {
    const dataset = await MongoDataset.create({
      teamId,
      tmbId,
      name: 'test-dataset',
      type: 'dataset',
      vectorModelId: 'text-embedding-3-small',
      agentModelId: 'gpt-4o-mini'
    });
    datasetId = String(dataset._id);
    return datasetId;
  }

  async function setupCollection() {
    const col = await MongoDatasetCollection.create({
      teamId,
      tmbId,
      datasetId,
      parentId: null,
      name: 'test-collection',
      type: 'file',
      trainingType: 'chunk'
    });
    collectionId = String(col._id);
    return collectionId;
  }

  it('dataAmount=0 + trainingAmount=0 → stats 全部为 0/false', async () => {
    await setupDataset();
    await setupCollection();

    // 聚合计算 stats（模拟 worker 逻辑）
    const [dataResult] = await MongoDatasetData.aggregate([
      {
        $match: {
          teamId: new Types.ObjectId(teamId),
          datasetId: new Types.ObjectId(datasetId),
          collectionId: new Types.ObjectId(collectionId)
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          processedCount: { $sum: { $cond: [{ $ifNull: ['$indexingCompleteTime', false] }, 1, 0] } }
        }
      }
    ]);
    const [trainingResult] = await MongoDatasetTraining.aggregate([
      {
        $match: {
          teamId: new Types.ObjectId(teamId),
          datasetId: new Types.ObjectId(datasetId),
          collectionId: new Types.ObjectId(collectionId)
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          hasError: { $max: { $cond: [{ $ifNull: ['$errorMsg', false] }, true, false] } },
          allParse: { $min: { $eq: ['$mode', TrainingModeEnum.parse] } }
        }
      }
    ]);

    const dataCount = dataResult?.count || 0;
    const processedCount = dataResult?.processedCount || 0;

    expect(dataCount).toBe(0);
    expect(processedCount).toBe(0);
    expect(trainingResult?.count || 0).toBe(0);
    expect(trainingResult?.hasError || false).toBe(false);
    expect(trainingResult ? trainingResult.allParse : true).toBe(true);
  });

  it('插入 100 条 data + 5 条 training → stats 正确计算', async () => {
    await setupDataset();
    await setupCollection();

    const teamIdObj = new Types.ObjectId(teamId);
    const datasetIdObj = new Types.ObjectId(datasetId);
    const collectionIdObj = new Types.ObjectId(collectionId);

    // 插入 100 条 data（其中 30 条已完成索引）
    const dataDocs: any[] = [];
    for (let i = 0; i < 100; i++) {
      dataDocs.push({
        teamId: teamIdObj,
        tmbId: new Types.ObjectId(),
        datasetId: datasetIdObj,
        collectionId: collectionIdObj,
        q: `question-${i}`,
        a: `answer-${i}`,
        indexes: [],
        chunkIndex: i,
        ...(i < 30 ? { indexingCompleteTime: new Date() } : {})
      });
    }
    await MongoDatasetData.insertMany(dataDocs);

    // 插入 5 条 training（3 条 parse, 2 条 chunk，1 条有 error）
    const trainingDocs: any[] = [
      {
        teamId: teamIdObj,
        tmbId: new Types.ObjectId(),
        datasetId: datasetIdObj,
        collectionId: collectionIdObj,
        billId: 'bill-1',
        mode: TrainingModeEnum.parse
      },
      {
        teamId: teamIdObj,
        tmbId: new Types.ObjectId(),
        datasetId: datasetIdObj,
        collectionId: collectionIdObj,
        billId: 'bill-2',
        mode: TrainingModeEnum.parse
      },
      {
        teamId: teamIdObj,
        tmbId: new Types.ObjectId(),
        datasetId: datasetIdObj,
        collectionId: collectionIdObj,
        billId: 'bill-3',
        mode: TrainingModeEnum.parse
      },
      {
        teamId: teamIdObj,
        tmbId: new Types.ObjectId(),
        datasetId: datasetIdObj,
        collectionId: collectionIdObj,
        billId: 'bill-4',
        mode: TrainingModeEnum.chunk
      },
      {
        teamId: teamIdObj,
        tmbId: new Types.ObjectId(),
        datasetId: datasetIdObj,
        collectionId: collectionIdObj,
        billId: 'bill-5',
        mode: TrainingModeEnum.chunk,
        errorMsg: 'some error'
      }
    ];
    await MongoDatasetTraining.insertMany(trainingDocs);

    // Aggregation（模拟 worker 逻辑）
    const [dataResult] = await MongoDatasetData.aggregate([
      { $match: { teamId: teamIdObj, datasetId: datasetIdObj, collectionId: collectionIdObj } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          processedCount: { $sum: { $cond: [{ $ifNull: ['$indexingCompleteTime', false] }, 1, 0] } }
        }
      }
    ]);
    const [trainingResult] = await MongoDatasetTraining.aggregate([
      { $match: { teamId: teamIdObj, datasetId: datasetIdObj, collectionId: collectionIdObj } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          hasError: { $max: { $cond: [{ $ifNull: ['$errorMsg', false] }, true, false] } },
          allParse: { $min: { $eq: ['$mode', TrainingModeEnum.parse] } }
        }
      }
    ]);

    expect(dataResult!.count).toBe(100);
    expect(dataResult!.processedCount).toBe(30);
    expect(trainingResult!.count).toBe(5);
    expect(trainingResult!.hasError).toBe(true);
    expect(trainingResult!.allParse).toBe(false); // 混合了 chunk 模式
  });

  it('全部 parse 模式 → allParse=true', async () => {
    await setupDataset();
    await setupCollection();

    const teamIdObj = new Types.ObjectId(teamId);
    const datasetIdObj = new Types.ObjectId(datasetId);
    const collectionIdObj = new Types.ObjectId(collectionId);

    const trainingDocs = [
      {
        teamId: teamIdObj,
        tmbId: new Types.ObjectId(),
        datasetId: datasetIdObj,
        collectionId: collectionIdObj,
        billId: 'bill-1',
        mode: TrainingModeEnum.parse
      },
      {
        teamId: teamIdObj,
        tmbId: new Types.ObjectId(),
        datasetId: datasetIdObj,
        collectionId: collectionIdObj,
        billId: 'bill-2',
        mode: TrainingModeEnum.parse
      }
    ];
    await MongoDatasetTraining.insertMany(trainingDocs);

    const [trainingResult] = await MongoDatasetTraining.aggregate([
      { $match: { teamId: teamIdObj, datasetId: datasetIdObj, collectionId: collectionIdObj } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          allParse: { $min: { $eq: ['$mode', TrainingModeEnum.parse] } }
        }
      }
    ]);

    expect(trainingResult!.count).toBe(2);
    expect(trainingResult!.allParse).toBe(true);
  });
});

// ============================================================
// 性能测试 — 1w+ 数据 stats 计算耗时
// ============================================================
describe('Stats computation performance (10k+ data)', () => {
  it('10,000 条 data 的 stats 聚合应在 500ms 内完成', async () => {
    const teamId = newId();
    const tmbId = newId();

    const dataset = await MongoDataset.create({
      teamId,
      tmbId,
      name: 'perf-dataset',
      type: 'dataset',
      vectorModelId: 'text-embedding-3-small',
      agentModelId: 'gpt-4o-mini'
    });

    const col = await MongoDatasetCollection.create({
      teamId,
      tmbId,
      datasetId: String(dataset._id),
      parentId: null,
      name: 'perf-collection',
      type: 'file',
      trainingType: 'chunk'
    });

    const teamIdObj = new Types.ObjectId(teamId);
    const datasetIdObj = new Types.ObjectId(String(dataset._id));
    const collectionIdObj = new Types.ObjectId(String(col._id));

    // 批量插入 10,000 条 data（分批插入避免单批次过大）
    const BATCH = 500;
    for (let offset = 0; offset < 10000; offset += BATCH) {
      const batch = [];
      for (let i = offset; i < Math.min(offset + BATCH, 10000); i++) {
        batch.push({
          teamId: teamIdObj,
          tmbId: new Types.ObjectId(),
          datasetId: datasetIdObj,
          collectionId: collectionIdObj,
          q: `question-${i}`,
          a: `answer-${i}`,
          indexes: [],
          chunkIndex: i,
          ...(i < 3000 ? { indexingCompleteTime: new Date() } : {})
        });
      }
      await MongoDatasetData.insertMany(batch, { ordered: false });
    }

    // 插入 training records
    const trainingDocs: any[] = [];
    for (let i = 0; i < 10; i++) {
      trainingDocs.push({
        teamId: teamIdObj,
        tmbId: new Types.ObjectId(),
        datasetId: datasetIdObj,
        collectionId: collectionIdObj,
        billId: `bill-${i}`,
        mode: TrainingModeEnum.chunk
      });
    }
    await MongoDatasetTraining.insertMany(trainingDocs);

    // 预热：先跑一次查询确保索引载入
    await MongoDatasetData.findOne({ collectionId: collectionIdObj }).lean();

    // 计时：data aggregation
    const dataStart = Date.now();
    const [dataResult] = await MongoDatasetData.aggregate([
      { $match: { teamId: teamIdObj, datasetId: datasetIdObj, collectionId: collectionIdObj } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          processedCount: { $sum: { $cond: [{ $ifNull: ['$indexingCompleteTime', false] }, 1, 0] } }
        }
      }
    ]);
    const dataElapsed = Date.now() - dataStart;

    // 计时：training aggregation
    const trainingStart = Date.now();
    const [trainingResult] = await MongoDatasetTraining.aggregate([
      { $match: { teamId: teamIdObj, datasetId: datasetIdObj, collectionId: collectionIdObj } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          hasError: { $max: { $cond: [{ $ifNull: ['$errorMsg', false] }, true, false] } }
        }
      }
    ]);
    const trainingElapsed = Date.now() - trainingStart;

    const totalElapsed = Date.now() - dataStart;

    // 验证数据正确性
    expect(dataResult!.count).toBe(10000);
    expect(dataResult!.processedCount).toBe(3000);
    expect(trainingResult!.count).toBe(10);

    // 性能断言：单次聚合应在阈值内
    console.log(`[Perf] 10k data aggregation: ${dataElapsed}ms`);
    console.log(`[Perf] 10 training aggregation: ${trainingElapsed}ms`);
    console.log(`[Perf] Total aggregation time: ${totalElapsed}ms`);

    // 500ms 阈值对索引查询是合理的
    expect(dataElapsed).toBeLessThan(500);
    expect(trainingElapsed).toBeLessThan(200);
    expect(totalElapsed).toBeLessThan(500);
  }, 60000); // 60s 超时，因为需要插入 10k 数据
});

// ============================================================
// 对比测试 — 预计算字段 vs 聚合查询
// ============================================================
describe('Precomputed fields vs aggregation comparison', () => {
  it('预计算字段应能替代聚合查询结果', async () => {
    const teamId = newId();
    const tmbId = newId();

    const dataset = await MongoDataset.create({
      teamId,
      tmbId,
      name: 'comp-dataset',
      type: 'dataset',
      vectorModelId: 'text-embedding-3-small',
      agentModelId: 'gpt-4o-mini'
    });
    const datasetId = String(dataset._id);

    const col = await MongoDatasetCollection.create({
      teamId,
      tmbId,
      datasetId,
      parentId: null,
      name: 'comp-collection',
      type: 'file',
      trainingType: 'chunk'
    });
    const collectionId = String(col._id);

    const teamIdObj = new Types.ObjectId(teamId);
    const datasetIdObj = new Types.ObjectId(datasetId);
    const collectionIdObj = new Types.ObjectId(collectionId);

    // 插入 data
    const dataDocs: any[] = [];
    for (let i = 0; i < 200; i++) {
      dataDocs.push({
        teamId: teamIdObj,
        tmbId: new Types.ObjectId(),
        datasetId: datasetIdObj,
        collectionId: collectionIdObj,
        q: `q-${i}`,
        a: `a-${i}`,
        indexes: [],
        chunkIndex: i,
        ...(i % 3 === 0 ? { indexingCompleteTime: new Date() } : {})
      });
    }
    await MongoDatasetData.insertMany(dataDocs);

    // 插入 training（混合 parse + chunk + error）
    const trainingDocs: any[] = [
      {
        teamId: teamIdObj,
        tmbId: new Types.ObjectId(),
        datasetId: datasetIdObj,
        collectionId: collectionIdObj,
        billId: 'b1',
        mode: TrainingModeEnum.parse
      },
      {
        teamId: teamIdObj,
        tmbId: new Types.ObjectId(),
        datasetId: datasetIdObj,
        collectionId: collectionIdObj,
        billId: 'b2',
        mode: TrainingModeEnum.parse
      },
      {
        teamId: teamIdObj,
        tmbId: new Types.ObjectId(),
        datasetId: datasetIdObj,
        collectionId: collectionIdObj,
        billId: 'b3',
        mode: TrainingModeEnum.chunk
      },
      {
        teamId: teamIdObj,
        tmbId: new Types.ObjectId(),
        datasetId: datasetIdObj,
        collectionId: collectionIdObj,
        billId: 'b4',
        mode: TrainingModeEnum.chunk,
        errorMsg: 'failed'
      }
    ];
    await MongoDatasetTraining.insertMany(trainingDocs);

    // 1. 聚合查询（旧方式）
    const aggStart = Date.now();
    const [dataResult] = await MongoDatasetData.aggregate([
      { $match: { teamId: teamIdObj, datasetId: datasetIdObj, collectionId: collectionIdObj } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          processedCount: { $sum: { $cond: [{ $ifNull: ['$indexingCompleteTime', false] }, 1, 0] } }
        }
      }
    ]);
    const [trainingResult] = await MongoDatasetTraining.aggregate([
      { $match: { teamId: teamIdObj, datasetId: datasetIdObj, collectionId: collectionIdObj } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          hasError: { $max: { $cond: [{ $ifNull: ['$errorMsg', false] }, true, false] } },
          allParse: { $min: { $eq: ['$mode', TrainingModeEnum.parse] } }
        }
      }
    ]);

    const dataCount = dataResult?.count || 0;
    const processedCount = dataResult?.processedCount || 0;
    const aggElapsed = Date.now() - aggStart;

    // 2. 写入预计算字段到 collection（模拟 worker 行为）
    await MongoDatasetCollection.updateOne(
      { _id: collectionId },
      {
        $set: {
          dataAmount: dataCount,
          trainingAmount: trainingResult?.count || 0,
          processedCount,
          remainingCount: dataCount - processedCount,
          hasError: trainingResult?.hasError || false,
          allParse: trainingResult ? trainingResult.allParse : true,
          statsUpdatedAt: new Date(),
          updateTime: new Date()
        }
      }
    );

    // 3. 从预计算字段读取（新方式）
    const readStart = Date.now();
    const cachedCol = await MongoDatasetCollection.findById(collectionId).lean();
    const readElapsed = Date.now() - readStart;

    // 4. 对比一致性
    expect(cachedCol!.dataAmount).toBe(dataCount);
    expect(cachedCol!.trainingAmount).toBe(trainingResult?.count || 0);
    expect(cachedCol!.processedCount).toBe(processedCount);
    expect(cachedCol!.remainingCount).toBe(dataCount - processedCount);
    expect(cachedCol!.hasError).toBe(trainingResult?.hasError || false);
    expect(cachedCol!.allParse).toBe(trainingResult ? trainingResult.allParse : true);

    // 5. 验证读取与聚合同数量级（大数据量下读取远快于聚合）
    console.log(`[Compare] Aggregation: ${aggElapsed}ms, Cached read: ${readElapsed}ms`);
    // 缓存读取应该在极短时间内完成；小数据量下聚合也很快，大数据量差异明显
    expect(readElapsed).toBeLessThanOrEqual(aggElapsed + 1);
  });
});

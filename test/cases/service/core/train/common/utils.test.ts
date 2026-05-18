/**
 * packages/service/core/train/common/utils.ts 单元测试
 *
 * 覆盖函数：
 *   - findMissingIndexType
 *   - countValidChunksForDatasets
 *   - validateDatasetReadiness
 *
 * 使用真实 MongoDB（由 test/setup.ts 全局配置），每个测试在独立数据库中运行。
 *
 * 运行方式（从项目根目录）：
 *   MONGODB_TEST_URI=mongodb://myusername:mypassword@127.0.0.1:30017/fastgpt?authSource=admin&directConnection=true pnpm test test/cases/service/core/train/common/utils.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  findMissingIndexType,
  countValidChunksForDatasets,
  validateDatasetReadiness
} from '@fastgpt/service/core/train/common/utils';
import { EmbeddingTrainErrEnum, RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';

// ============================================================
// 辅助函数
// ============================================================

/** 生成随机 ObjectId 字符串 */
const newId = () => String(new Types.ObjectId());

/**
 * 在真实 MongoDB 中创建一个 dataset 文档
 */
async function createDataset(teamId: string, name: string) {
  return MongoDataset.create({
    teamId: new Types.ObjectId(teamId),
    tmbId: new Types.ObjectId(),
    name,
    type: DatasetTypeEnum.dataset,
    vectorModelId: 'text-embedding-3-small',
    agentModelId: 'gpt-4o-mini'
  });
}

/**
 * 在真实 MongoDB 中创建一个 dataset collection 文档
 */
async function createCollection(teamId: string, datasetId: string, name: string) {
  return MongoDatasetCollection.create({
    teamId: new Types.ObjectId(teamId),
    tmbId: new Types.ObjectId(),
    datasetId: new Types.ObjectId(datasetId),
    type: 'file',
    name
  });
}

/**
 * 在真实 MongoDB 中创建 dataset data 文档
 */
async function createDatasetData(
  teamId: string,
  datasetId: string,
  collectionId: string,
  q: string,
  indexes: Array<{ type: string; dataId: string; text: string; synId?: number }>
) {
  return MongoDatasetData.create({
    teamId: new Types.ObjectId(teamId),
    tmbId: new Types.ObjectId(),
    datasetId: new Types.ObjectId(datasetId),
    collectionId: new Types.ObjectId(collectionId),
    q,
    a: '',
    indexes
  });
}

// ============================================================
// findMissingIndexType
// ============================================================
describe('findMissingIndexType', () => {
  let teamId: string;
  let datasetId: string;
  let collectionId: string;

  beforeEach(async () => {
    teamId = newId();
    const dataset = await createDataset(teamId, 'test-dataset');
    datasetId = String(dataset._id);
    const collection = await createCollection(teamId, datasetId, 'test-collection');
    collectionId = String(collection._id);
  });

  it('数据集存在目标 index type 时应返回 null', async () => {
    await createDatasetData(teamId, datasetId, collectionId, 'q1', [
      { type: DatasetDataIndexTypeEnum.question, dataId: '1', text: 'question text', synId: 0 }
    ]);

    const result = await findMissingIndexType(datasetId, DatasetDataIndexTypeEnum.question);

    expect(result).toBeNull();
  });

  it('数据集缺少目标 index type 时应返回该类型', async () => {
    await createDatasetData(teamId, datasetId, collectionId, 'q1', [
      { type: DatasetDataIndexTypeEnum.default, dataId: '1', text: 'default text' }
    ]);

    const result = await findMissingIndexType(datasetId, DatasetDataIndexTypeEnum.question);

    expect(result).toBe(DatasetDataIndexTypeEnum.question);
  });

  it('空 indexes 数组时应返回目标类型', async () => {
    await createDatasetData(teamId, datasetId, collectionId, 'q1', []);

    const result = await findMissingIndexType(datasetId, DatasetDataIndexTypeEnum.question);

    expect(result).toBe(DatasetDataIndexTypeEnum.question);
  });

  it('多个文档分别包含不同 index types 时，存在目标类型应返回 null', async () => {
    await createDatasetData(teamId, datasetId, collectionId, 'q1', [
      { type: DatasetDataIndexTypeEnum.question, dataId: '1', text: 'question text', synId: 0 }
    ]);
    await createDatasetData(teamId, datasetId, collectionId, 'q2', [
      { type: DatasetDataIndexTypeEnum.default, dataId: '2', text: 'default text' }
    ]);

    const result = await findMissingIndexType(datasetId, DatasetDataIndexTypeEnum.question);

    expect(result).toBeNull();
  });
});

// ============================================================
// countValidChunksForDatasets
// ============================================================
describe('countValidChunksForDatasets', () => {
  let teamId: string;

  beforeEach(() => {
    teamId = newId();
  });

  it('多个数据集，每个有多个带 indexes 的文档时应返回正确总数', async () => {
    const dataset1 = await createDataset(teamId, 'ds1');
    const col1 = await createCollection(teamId, String(dataset1._id), 'col1');
    const dataset2 = await createDataset(teamId, 'ds2');
    const col2 = await createCollection(teamId, String(dataset2._id), 'col2');

    // dataset1: 3 个有效文档
    await createDatasetData(teamId, String(dataset1._id), String(col1._id), 'q1', [
      { type: DatasetDataIndexTypeEnum.question, dataId: '1', text: 't1', synId: 0 }
    ]);
    await createDatasetData(teamId, String(dataset1._id), String(col1._id), 'q2', [
      { type: DatasetDataIndexTypeEnum.default, dataId: '2', text: 't2' }
    ]);
    await createDatasetData(teamId, String(dataset1._id), String(col1._id), 'q3', [
      { type: DatasetDataIndexTypeEnum.question, dataId: '3', text: 't3', synId: 0 }
    ]);

    // dataset2: 2 个有效文档
    await createDatasetData(teamId, String(dataset2._id), String(col2._id), 'q4', [
      { type: DatasetDataIndexTypeEnum.question, dataId: '4', text: 't4', synId: 0 }
    ]);
    await createDatasetData(teamId, String(dataset2._id), String(col2._id), 'q5', [
      { type: DatasetDataIndexTypeEnum.default, dataId: '5', text: 't5' }
    ]);

    const result = await countValidChunksForDatasets(
      [String(dataset1._id), String(dataset2._id)],
      DatasetDataIndexTypeEnum.question
    );
    expect(result).toBe(3); // 3 question chunks (not counting default type chunks)
  });

  it('部分文档 indexes 为空时不应计入总数', async () => {
    const dataset = await createDataset(teamId, 'ds-empty-indexes');
    const col = await createCollection(teamId, String(dataset._id), 'col');

    await createDatasetData(teamId, String(dataset._id), String(col._id), 'q1', [
      { type: DatasetDataIndexTypeEnum.question, dataId: '1', text: 't1', synId: 0 }
    ]);
    await createDatasetData(teamId, String(dataset._id), String(col._id), 'q2', []);
    await createDatasetData(teamId, String(dataset._id), String(col._id), 'q3', [
      { type: DatasetDataIndexTypeEnum.default, dataId: '3', text: 't3' }
    ]);

    const result = await countValidChunksForDatasets(
      [String(dataset._id)],
      DatasetDataIndexTypeEnum.question
    );

    expect(result).toBe(1);
  });

  it('空数据集列表时应返回 0', async () => {
    const result = await countValidChunksForDatasets([], DatasetDataIndexTypeEnum.question);
    expect(result).toBe(0);
  });

  it('单数据集应返回该数据集的有效 chunk 数', async () => {
    const dataset = await createDataset(teamId, 'ds-single');
    const col = await createCollection(teamId, String(dataset._id), 'col');

    await createDatasetData(teamId, String(dataset._id), String(col._id), 'q1', [
      { type: DatasetDataIndexTypeEnum.question, dataId: '1', text: 't1', synId: 0 }
    ]);

    const result = await countValidChunksForDatasets(
      [String(dataset._id)],
      DatasetDataIndexTypeEnum.question
    );

    expect(result).toBe(1);
  });
});

// ============================================================
// validateDatasetReadiness
// ============================================================
describe('validateDatasetReadiness', () => {
  let teamId: string;
  const embeddingErrorConfig = {
    noDatasetConfigured: EmbeddingTrainErrEnum.embeddingValidationNoDatasetConfigured,
    datasetNoSynthesisIndex: EmbeddingTrainErrEnum.embeddingValidationDatasetNoSynthesisIndex,
    insufficientChunks: EmbeddingTrainErrEnum.embeddingTaskInsufficientChunks
  };

  beforeEach(() => {
    teamId = newId();
  });

  it('所有检查通过时应正常 resolve', async () => {
    const dataset = await createDataset(teamId, 'ds-ok');
    const col = await createCollection(teamId, String(dataset._id), 'col');

    // 创建 3 个有效文档，超过默认 threshold (500) 太远，使用自定义小 threshold
    for (let i = 0; i < 3; i++) {
      await createDatasetData(teamId, String(dataset._id), String(col._id), `q${i}`, [
        { type: DatasetDataIndexTypeEnum.question, dataId: String(i), text: 't', synId: 0 }
      ]);
    }

    await expect(
      validateDatasetReadiness(
        [String(dataset._id)],
        DatasetDataIndexTypeEnum.question,
        embeddingErrorConfig,
        { minChunkThreshold: 2 }
      )
    ).resolves.toBeUndefined();
  });

  it('datasetIds 为空时应 reject noDatasetConfigured', async () => {
    await expect(
      validateDatasetReadiness([], DatasetDataIndexTypeEnum.question, embeddingErrorConfig)
    ).rejects.toBe(EmbeddingTrainErrEnum.embeddingValidationNoDatasetConfigured);
  });

  it('缺少目标 index type 时应 reject datasetNoSynthesisIndex', async () => {
    const dataset = await createDataset(teamId, 'ds-missing-index');
    const col = await createCollection(teamId, String(dataset._id), 'col');

    await createDatasetData(teamId, String(dataset._id), String(col._id), 'q1', [
      { type: DatasetDataIndexTypeEnum.default, dataId: '1', text: 't1' }
    ]);

    await expect(
      validateDatasetReadiness(
        [String(dataset._id)],
        DatasetDataIndexTypeEnum.question,
        embeddingErrorConfig
      )
    ).rejects.toBe(EmbeddingTrainErrEnum.embeddingValidationDatasetNoSynthesisIndex);
  });

  it('chunk 数量不足时应 reject insufficientChunks', async () => {
    const dataset = await createDataset(teamId, 'ds-insufficient');
    const col = await createCollection(teamId, String(dataset._id), 'col');

    // 只创建 1 个文档，threshold 设为 5
    await createDatasetData(teamId, String(dataset._id), String(col._id), 'q1', [
      { type: DatasetDataIndexTypeEnum.question, dataId: '1', text: 't1', synId: 0 }
    ]);

    await expect(
      validateDatasetReadiness(
        [String(dataset._id)],
        DatasetDataIndexTypeEnum.question,
        embeddingErrorConfig,
        { minChunkThreshold: 5 }
      )
    ).rejects.toBe(EmbeddingTrainErrEnum.embeddingTaskInsufficientChunks);
  });

  it('chunk 数量刚好满足 threshold 时应正常 resolve', async () => {
    const dataset = await createDataset(teamId, 'ds-exact');
    const col = await createCollection(teamId, String(dataset._id), 'col');

    // 创建恰好 3 个文档，threshold = 3
    for (let i = 0; i < 3; i++) {
      await createDatasetData(teamId, String(dataset._id), String(col._id), `q${i}`, [
        { type: DatasetDataIndexTypeEnum.question, dataId: String(i), text: 't', synId: 0 }
      ]);
    }

    await expect(
      validateDatasetReadiness(
        [String(dataset._id)],
        DatasetDataIndexTypeEnum.question,
        embeddingErrorConfig,
        { minChunkThreshold: 3 }
      )
    ).resolves.toBeUndefined();
  });

  it('多数据集场景：一个数据集缺少 index type 应 reject', async () => {
    const dataset1 = await createDataset(teamId, 'ds1');
    const col1 = await createCollection(teamId, String(dataset1._id), 'col1');
    const dataset2 = await createDataset(teamId, 'ds2');
    const col2 = await createCollection(teamId, String(dataset2._id), 'col2');

    // dataset1 有 question
    await createDatasetData(teamId, String(dataset1._id), String(col1._id), 'q1', [
      { type: DatasetDataIndexTypeEnum.question, dataId: '1', text: 't1', synId: 0 }
    ]);

    // dataset2 只有 default，缺少 question
    await createDatasetData(teamId, String(dataset2._id), String(col2._id), 'q2', [
      { type: DatasetDataIndexTypeEnum.default, dataId: '2', text: 't2' }
    ]);

    await expect(
      validateDatasetReadiness(
        [String(dataset1._id), String(dataset2._id)],
        DatasetDataIndexTypeEnum.question,
        embeddingErrorConfig,
        { minChunkThreshold: 1 }
      )
    ).rejects.toBe(EmbeddingTrainErrEnum.embeddingValidationDatasetNoSynthesisIndex);
  });

  it('使用 rerank error config 时应返回 rerank 错误枚举', async () => {
    const rerankErrorConfig = {
      noDatasetConfigured: RerankTrainErrEnum.rerankValidationNoDatasetConfigured,
      datasetNoSynthesisIndex: RerankTrainErrEnum.rerankValidationDatasetNoSynthesisIndex,
      insufficientChunks: RerankTrainErrEnum.rerankTaskInsufficientChunks
    };

    await expect(
      validateDatasetReadiness([], DatasetDataIndexTypeEnum.question, rerankErrorConfig)
    ).rejects.toBe(RerankTrainErrEnum.rerankValidationNoDatasetConfigured);
  });
});

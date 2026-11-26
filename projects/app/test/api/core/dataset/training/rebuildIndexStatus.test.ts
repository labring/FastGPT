import handler from '@/pages/api/core/dataset/training/rebuildEmbedding';
import type { EmbeddingModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  DatasetDataIndexStageEnum,
  DatasetDataIndexStatusEnum
} from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { serviceEnv } from '@fastgpt/service/env';
import { getRootUser } from '@test/datas/users';
import { addModelTestModel, getModelTestDefaults } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('@fastgpt/service/core/ai/model/catalog/service');
vi.mock('@fastgpt/dal/redis/bullmq/services/datasetTraining', () => ({
  datasetTrainingMQService: { enqueueBatch: vi.fn().mockResolvedValue([]) }
}));

let testRoot: Awaited<ReturnType<typeof getRootUser>>;
let currentModel: EmbeddingModelDataType;
let nextModel: EmbeddingModelDataType;

const createContext = async () => {
  const root = testRoot;
  const dataset = await MongoDataset.create({
    name: 'rebuild index status',
    teamId: root.teamId,
    tmbId: root.tmbId,
    vectorModelId: currentModel.modelId,
    agentModelId: getModelTestDefaults().llm!.modelId
  });
  const collection = await MongoDatasetCollection.create({
    name: 'collection',
    type: DatasetCollectionTypeEnum.file,
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id
  });

  return { root, dataset, collection };
};

const createData = async ({
  root,
  dataset,
  collection,
  indexStatus,
  synonymVersion
}: {
  root: Awaited<ReturnType<typeof getRootUser>>;
  dataset: { _id: unknown };
  collection: { _id: unknown };
  indexStatus?: DatasetDataIndexStatusEnum;
  synonymVersion?: number;
}) =>
  MongoDatasetData.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    collectionId: collection._id,
    q: `chunk ${indexStatus ?? 'legacy'}`,
    indexes: [],
    ...(indexStatus && { indexStatus }),
    ...(synonymVersion !== undefined && { synonymVersion })
  });

describe('rebuild paths skip pending index data', () => {
  beforeEach(async () => {
    testRoot = await getRootUser();
    Object.assign(serviceEnv, { DATASET_SYNONYM_ENABLED: false });
    const defaultEmbedding = getModelTestDefaults().embedding!;
    currentModel = {
      ...defaultEmbedding,
      modelId: '507f1f77bcf86cd799439051',
      model: 'current-embedding',
      name: 'current-embedding'
    };
    nextModel = {
      ...defaultEmbedding,
      modelId: '507f1f77bcf86cd799439052',
      model: 'next-embedding',
      name: 'next-embedding'
    };
    [currentModel, nextModel].forEach((model) => addModelTestModel(model));
  });

  /** CP-08：索引进行中切换向量模型，待索引数据不被标记 rebuilding、不产生第二条任务。 */
  it('marks only indexed data as rebuilding and leaves pending data alone', async () => {
    const { root, dataset, collection } = await createContext();
    const indexingPending = await createData({
      root,
      dataset,
      collection,
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });
    const indexed = await createData({
      root,
      dataset,
      collection,
      indexStatus: DatasetDataIndexStatusEnum.indexed
    });
    const legacy = await createData({ root, dataset, collection });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: nextModel.modelId
      }
    });
    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    // 文档队列只标记已索引数据与历史数据，未训练分块保留原阶段。
    const pending = await MongoDatasetData.find({
      datasetId: dataset._id,
      indexStatus: DatasetDataIndexStageEnum.rebuildIndexPending
    }).lean();
    expect(pending.map(({ _id }) => String(_id)).sort()).toEqual(
      [String(indexed._id), String(legacy._id)].sort()
    );
    expect(await MongoDatasetTraining.countDocuments({ datasetId: dataset._id })).toBe(0);

    // 待索引数据不被选中，也没有重建标记残留。
    expect(await MongoDatasetData.findById(indexingPending._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });
  });

  it('includes rebuild failures with cancelled tasks in a subsequent model rebuild', async () => {
    const { root, dataset, collection } = await createContext();
    const data = await createData({
      root,
      dataset,
      collection,
      indexStatus: DatasetDataIndexStatusEnum.rebuildIndexFailed
    });
    const res = await Call(handler, {
      auth: root,
      body: { datasetId: String(dataset._id), vectorModelId: nextModel.modelId }
    });
    expect(res.code).toBe(200);
    expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStageEnum.rebuildIndexPending
    });
    expect(await MongoDatasetCollection.findById(collection._id).lean()).toMatchObject({
      training: { status: 'active', usageId: expect.any(String) }
    });
    expect(await MongoDatasetTraining.countDocuments({ datasetId: dataset._id })).toBe(0);
  });
});

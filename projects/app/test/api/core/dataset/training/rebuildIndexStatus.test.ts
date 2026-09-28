import { getModelTestDefaults, addModelTestModel } from '@test/modelCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/core/dataset/training/rebuildEmbedding';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import type { EmbeddingSystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import { serviceEnv } from '@fastgpt/service/env';
vi.unmock('@fastgpt/service/core/ai/model');

import { enqueueNextDatasetRebuildTask } from '@/service/core/dataset/queues/rebuild';

let testRoot: Awaited<ReturnType<typeof getRootUser>>;
let currentModel: EmbeddingSystemModelDataType;
let nextModel: EmbeddingSystemModelDataType;

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
    serviceEnv.DATASET_SYNONYM_ENABLED = false;
    global.systemEnv = { ...global.systemEnv, vectorMaxProcess: 1 };
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
    const indexing = await createData({
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

    // 重建种子任务只覆盖已索引数据与历史数据，且每条数据只有一条任务。
    const tasks = await MongoDatasetTraining.find({ datasetId: dataset._id }).lean();
    expect(tasks.map((task) => String(task.dataId)).sort()).toEqual(
      [String(indexed._id), String(legacy._id)].sort()
    );
    expect(tasks.every((task) => task.mode === TrainingModeEnum.chunk)).toBe(true);

    // 待索引数据不被选中，也没有重建标记残留。
    const rows = await MongoDatasetData.find({ datasetId: dataset._id }).lean();
    for (const pendingId of [String(indexingPending._id), String(indexing._id)]) {
      const row = rows.find((item) => String(item._id) === pendingId);
      expect(row?.rebuilding).toBeUndefined();
      expect(row?.synonymRebuildingVersion).toBeUndefined();
    }
    expect(await MongoDatasetData.findById(indexingPending._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });
    expect(await MongoDatasetData.findById(indexing._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });
  });

  /** CP-09：同义词重建不选中 indexing 数据，不产生第二条任务。 */
  it('does not select pending index data for synonym rebuild', async () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    const { root, dataset, collection } = await createContext();
    const indexingPending = await createData({
      root,
      dataset,
      collection,
      indexStatus: DatasetDataIndexStatusEnum.indexing,
      synonymVersion: 1
    });
    const indexed = await createData({
      root,
      dataset,
      collection,
      indexStatus: DatasetDataIndexStatusEnum.indexed,
      synonymVersion: 1
    });

    const enqueued = await enqueueNextDatasetRebuildTask({
      teamId: String(root.teamId),
      tmbId: String(root.tmbId),
      datasetId: String(dataset._id),
      billId: 'bill-id',
      vectorModel: nextModel,
      synonymVersion: 2
    });

    expect(enqueued).toBe(true);
    const tasks = await MongoDatasetTraining.find({ datasetId: dataset._id }).lean();
    expect(tasks).toHaveLength(1);
    expect(String(tasks[0].dataId)).toBe(String(indexed._id));
    expect(tasks[0].mode).toBe(TrainingModeEnum.chunk);

    // 待索引数据保持原状，标记未被推进。
    expect(await MongoDatasetData.findById(indexingPending._id).lean()).toMatchObject({
      synonymVersion: 1,
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });
  });

  /** CP-09：只有待索引数据时同义词重建正常收敛，不产生任务也不残留中间状态。 */
  it('converges without residue when every row is pending index', async () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    const { root, dataset, collection } = await createContext();
    await createData({
      root,
      dataset,
      collection,
      indexStatus: DatasetDataIndexStatusEnum.indexing,
      synonymVersion: 1
    });

    const enqueued = await enqueueNextDatasetRebuildTask({
      teamId: String(root.teamId),
      tmbId: String(root.tmbId),
      datasetId: String(dataset._id),
      billId: 'bill-id',
      vectorModel: nextModel,
      synonymVersion: 2
    });

    expect(enqueued).toBe(false);
    expect(await MongoDatasetTraining.countDocuments({ datasetId: dataset._id })).toBe(0);
    expect(
      await MongoDatasetData.countDocuments({
        datasetId: dataset._id,
        synonymRebuildingVersion: { $exists: true }
      })
    ).toBe(0);
  });
});

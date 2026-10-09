import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getModelTestDefaults, addModelTestModel } from '@test/modelCache';
import { getRootUser } from '@test/datas/users';
import { serviceEnv } from '@fastgpt/service/env';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  DatasetDataIndexStatusEnum,
  DatasetDataIndexTypeEnum
} from '@fastgpt/global/core/dataset/data/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import { retryFailedTrainingTasks } from '@fastgpt/service/core/dataset/training/service';
import { mockVectorInsert, mockVectorDelete, resetVectorMocks } from '@test/mocks/common/vector';
import { mockGetVectors, createMockVectorsResponse } from '@test/mocks/core/ai/embedding';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba/index';
import * as synonymQueue from '@/service/core/dataset/queues/rebuildSynonym';
import { generateRebuildSynonym } from '@/service/core/dataset/queues/generateRebuildSynonym';
import { generateRebuildIndex } from '@/service/core/dataset/queues/generateRebuildIndex';
import { generatePreCreatedData } from '@/service/core/dataset/queues/generatePreCreatedData';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));
vi.mock('@fastgpt/service/common/string/tiktoken', () => ({
  countPromptTokens: vi.fn(async (text: string) => text.length)
}));
vi.mock('@/service/core/dataset/queues/utils', () => ({
  checkTeamAiPointsAndLock: vi.fn().mockResolvedValue(true)
}));

let embeddingModel: NonNullable<ReturnType<typeof getModelTestDefaults>['embedding']>;

/** 创建真实词表、已存索引与待重建数据；仅向量外部服务使用 mock。 */
const createContext = async ({ enabled = true, count = 1 } = {}) => {
  const root = await getRootUser();
  const scope = { teamId: root.teamId, tmbId: root.tmbId };
  const dataset = await MongoDataset.create({
    ...scope,
    name: 'synonym rebuild',
    vectorModelId: embeddingModel.modelId
  });
  const collection = await MongoDatasetCollection.create({
    ...scope,
    datasetId: dataset._id,
    name: 'synonym collection',
    type: DatasetCollectionTypeEnum.file
  });
  const config = await MongoDatasetSynonym.create({
    teamId: root.teamId,
    datasetId: dataset._id,
    version: 2,
    enabled
  });
  await MongoDatasetSynonymMapping.create({
    teamId: root.teamId,
    datasetId: dataset._id,
    fileVersion: 2,
    synonymFileId: config._id,
    logicalMappingId: config._id,
    standardizedTerm: '退款',
    normalizedStandardizedTerm: '退款',
    synonymTerms: ['退钱'],
    normalizedSynonymTerms: ['退钱'],
    allTerms: '退款 退钱',
    fingerprint: '退款:退钱',
    sourceRows: [1]
  });
  const datas = await MongoDatasetData.create(
    Array.from({ length: count }, (_, i) => ({
      ...scope,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: '正文不能重新生成索引',
      a: '原答案',
      synonymVersion: 1,
      indexStatus: DatasetDataIndexStatusEnum.rebuildSynonymPending,
      indexes: [
        { type: DatasetDataIndexTypeEnum.custom, text: `我要退钱 ${i}`, dataId: `old-${i}` }
      ]
    }))
  );
  const context = { ...scope, datasetId: String(dataset._id), billId: 'test' };
  await synonymQueue.enqueueNextDatasetSynonymRebuildTask(context);
  const task = await MongoDatasetTraining.findOne({ datasetId: dataset._id }).lean();
  return { root, dataset, collection, config, datas, task: task!, context };
};

describe('generateRebuildSynonym', () => {
  beforeEach(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    global.systemEnv = { ...global.systemEnv, vectorMaxProcess: 1 };
    global.vectorQueueLen = 0;
    global.synonymQueueLen = 0;
    global.preCreatedQueueLen = 0;
    resetVectorMocks();
    embeddingModel = getModelTestDefaults().embedding!;
    addModelTestModel(embeddingModel);
    mockGetVectors
      .mockClear()
      .mockImplementation(async ({ inputs }) =>
        createMockVectorsResponse(inputs.map((input) => input.input))
      );
    mockVectorInsert.mockImplementation(async ({ vectors }) => ({
      insertIds: vectors.map((_, i) => `new-${i}`)
    }));
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    const timers = vi.getTimerCount();
    vi.useRealTimers();
    expect(timers).toBe(0);
  });

  it('normalizes stored indexes with the current word list and preserves source text', async () => {
    const { datas, task } = await createContext();
    expect(task).toMatchObject({
      mode: TrainingModeEnum.rebuildSynonym,
      expireAt: null,
      q: '',
      a: '',
      indexes: []
    });
    expect(task).not.toHaveProperty('synonymVersion');
    await generateRebuildSynonym();
    expect(
      mockGetVectors.mock.calls.flatMap(([props]) => props.inputs.map((input) => input.input))
    ).toEqual(['我要退款 0']);
    expect(await MongoDatasetData.findById(datas[0]._id).lean()).toMatchObject({
      q: '正文不能重新生成索引',
      a: '原答案',
      indexStatus: DatasetDataIndexStatusEnum.indexed,
      synonymVersion: 2,
      indexes: [{ text: '我要退钱 0', dataId: 'new-0' }]
    });
    expect(await MongoDatasetTraining.findById(task._id)).toBeNull();
    const text = await MongoDatasetDataText.findOne({ dataId: datas[0]._id }).lean();
    expect(text?.fullTextToken).toBe(await jiebaSplit({ text: '我要退款 0' }));
    expect(mockVectorDelete).toHaveBeenCalledWith(expect.objectContaining({ idList: ['old-0'] }));
  });

  it('rebuilds original indexes after deleting the word list', async () => {
    const { datas } = await createContext({ enabled: false });
    await generateRebuildSynonym();
    expect(
      mockGetVectors.mock.calls.flatMap(([props]) => props.inputs.map((input) => input.input))
    ).toEqual(['我要退钱 0']);
    expect(await MongoDatasetData.findById(datas[0]._id).lean()).toMatchObject({
      synonymVersion: 2,
      indexStatus: DatasetDataIndexStatusEnum.indexed
    });
  });

  it('keeps synonym tasks untouched when the feature is disabled', async () => {
    const { task, datas } = await createContext();
    serviceEnv.DATASET_SYNONYM_ENABLED = false;
    await generateRebuildSynonym();
    expect(await MongoDatasetTraining.findById(task._id)).not.toBeNull();
    expect(await MongoDatasetData.findById(datas[0]._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.rebuildSynonymRunning
    });
    expect(mockGetVectors).not.toHaveBeenCalled();
  });

  it('isolates task consumption and shares the embedding concurrency limit', async () => {
    const { task } = await createContext();
    await generateRebuildIndex();
    await generatePreCreatedData();
    expect(await MongoDatasetTraining.findById(task._id)).not.toBeNull();
    await MongoDatasetTraining.updateOne(
      { _id: task._id },
      { $set: { mode: TrainingModeEnum.rebuildIndex } }
    );
    await generateRebuildSynonym();
    expect(await MongoDatasetTraining.findById(task._id)).not.toBeNull();
    await MongoDatasetTraining.updateOne(
      { _id: task._id },
      { $set: { mode: TrainingModeEnum.rebuildSynonym } }
    );
    global.vectorQueueLen = 1;
    await generateRebuildSynonym();
    expect(global.synonymQueueLen).toBe(0);
    expect(mockGetVectors).not.toHaveBeenCalled();
    global.vectorQueueLen = 0;
    await generateRebuildSynonym();
    expect(await MongoDatasetTraining.findById(task._id)).toBeNull();
  });

  it('chains all pending data without producing duplicate tasks', async () => {
    const { context, dataset } = await createContext({ count: 7 });
    await Promise.all(
      Array.from({ length: 3 }, () => synonymQueue.enqueueNextDatasetSynonymRebuildTask(context))
    );
    const tasks = await MongoDatasetTraining.find({ datasetId: dataset._id }).lean();
    expect(new Set(tasks.map((task) => String(task.dataId))).size).toBe(tasks.length);
    await generateRebuildSynonym();
    expect(await MongoDatasetTraining.countDocuments({ datasetId: dataset._id })).toBe(0);
    expect(
      await MongoDatasetData.countDocuments({
        datasetId: dataset._id,
        indexStatus: DatasetDataIndexStatusEnum.indexed,
        synonymVersion: 2
      })
    ).toBe(7);
  });

  it('continues legacy rounds whose unqueued data still has the indexed status', async () => {
    const { datas, dataset } = await createContext({ count: 3 });
    await MongoDatasetData.updateMany(
      { _id: { $in: datas.slice(1).map((data) => data._id) } },
      { $set: { indexStatus: DatasetDataIndexStatusEnum.indexed } }
    );
    await generateRebuildSynonym();
    expect(await MongoDatasetTraining.countDocuments({ datasetId: dataset._id })).toBe(0);
    expect(
      await MongoDatasetData.countDocuments({
        datasetId: dataset._id,
        indexStatus: DatasetDataIndexStatusEnum.indexed,
        synonymVersion: 2
      })
    ).toBe(3);
  });

  it('preserves failed data and restores the synonym state on manual retry', async () => {
    const { task, datas, context } = await createContext();
    await MongoDatasetTraining.updateOne({ _id: task._id }, { $set: { retryCount: 1 } });
    mockGetVectors.mockRejectedValueOnce(new Error('embedding failed'));
    await generateRebuildSynonym();
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      retryCount: 0,
      expireAt: null
    });
    expect(await MongoDatasetData.findById(datas[0]._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.rebuildSynonymFailed,
      synonymVersion: 1,
      indexes: [{ dataId: 'old-0' }]
    });
    expect(await synonymQueue.enqueueNextDatasetSynonymRebuildTask(context)).toBe(false);
    await retryFailedTrainingTasks({ teamId: context.teamId, datasetId: context.datasetId });
    expect(await MongoDatasetData.findById(datas[0]._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.rebuildSynonymRunning
    });
    await generateRebuildSynonym();
    expect(await MongoDatasetTraining.findById(task._id)).toBeNull();
  });

  it('rolls back new vectors when completing the training task fails', async () => {
    const { task, datas } = await createContext();
    const deletion = vi
      .spyOn(MongoDatasetTraining, 'deleteOne')
      .mockRejectedValueOnce(new Error('completion failed'));
    try {
      await generateRebuildSynonym();
    } finally {
      deletion.mockRestore();
    }
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      retryCount: 2,
      errorMsg: 'completion failed'
    });
    expect(await MongoDatasetData.findById(datas[0]._id).lean()).toMatchObject({
      synonymVersion: 1,
      indexes: [{ dataId: 'old-0' }]
    });
    expect(mockVectorDelete).toHaveBeenCalledWith(expect.objectContaining({ idList: ['new-0'] }));
    expect(mockVectorDelete).not.toHaveBeenCalledWith(
      expect.objectContaining({ idList: ['old-0'] })
    );
  });

  it('keeps the task retryable and stops its heartbeat when chain scheduling fails', async () => {
    const { collection, task } = await createContext();
    await MongoDatasetCollection.deleteOne({ _id: collection._id });
    const enqueue = vi
      .spyOn(synonymQueue, 'enqueueNextDatasetSynonymRebuildTask')
      .mockRejectedValue(new Error('enqueue failed'));
    try {
      await generateRebuildSynonym();
    } finally {
      enqueue.mockRestore();
    }
    expect(await MongoDatasetTraining.findById(task._id)).not.toBeNull();
    expect(global.synonymQueueLen).toBe(0);
    expect(mockGetVectors).not.toHaveBeenCalled();
  });
});

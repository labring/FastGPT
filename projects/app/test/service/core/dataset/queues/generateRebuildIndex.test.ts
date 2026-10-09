import * as modelService from '@fastgpt/service/core/ai/model';
import * as synonymService from '@fastgpt/service/core/dataset/synonym/entity';
import { getModelTestDefaults, addModelTestModel } from '@test/modelCache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetSynonym } from '@fastgpt/service/core/dataset/synonym/schema';
import { getRootUser } from '@test/datas/users';
import { Types } from '@fastgpt/service/common/mongo';
import {
  mockVectorDelete,
  mockVectorInsert,
  mockVectorRefreshCreateTime,
  resetVectorMocks
} from '@test/mocks/common/vector';
import { createMockVectorsResponse, mockGetVectors } from '@test/mocks/core/ai/embedding';
import { serviceEnv } from '@fastgpt/service/env';
import * as rebuildService from '@/service/core/dataset/queues/rebuild';
import updateTrainingData from '@/pages/api/core/dataset/training/updateTrainingData';
import type {
  UpdateTrainingDataBody,
  UpdateTrainingDataResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { Call } from '@test/utils/request';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba/index';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));
vi.mock('@fastgpt/service/common/string/tiktoken', () => ({
  countPromptTokens: vi.fn(async (text: string) => text.length),
  countGptMessagesTokens: vi.fn(async () => 10)
}));
vi.mock('@/service/core/dataset/queues/utils', () => ({
  checkTeamAiPointsAndLock: vi.fn().mockResolvedValue(true)
}));

import { generateRebuildIndex } from '@/service/core/dataset/queues/generateRebuildIndex';
import { generatePreCreatedData } from '@/service/core/dataset/queues/generatePreCreatedData';
import { generateRebuildSynonym } from '@/service/core/dataset/queues/generateRebuildSynonym';

let embeddingModel: NonNullable<ReturnType<typeof getModelTestDefaults>['embedding']>;

const createContext = async ({
  indexStatus,
  indexes,
  mode = TrainingModeEnum.index
}: {
  indexStatus?: DatasetDataIndexStatusEnum;
  indexes?: { type: DatasetDataIndexTypeEnum; text: string; dataId: string }[];
  mode?: TrainingModeEnum;
} = {}) => {
  const root = await getRootUser();
  const dataset = await MongoDataset.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    name: 'vector pre create',
    vectorModelId: embeddingModel.modelId
  });
  const collection = await MongoDatasetCollection.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    name: 'collection',
    type: DatasetCollectionTypeEnum.file,
    indexPrefixTitle: false
  });

  const data = await MongoDatasetData.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    collectionId: collection._id,
    q: 'chunk content',
    chunkIndex: 0,
    indexes:
      indexes ??
      (mode === TrainingModeEnum.rebuildIndex
        ? [{ type: DatasetDataIndexTypeEnum.default, text: 'chunk content', dataId: 'old_vector' }]
        : []),
    ...(indexStatus && { indexStatus })
  });

  const task = await MongoDatasetTraining.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    collectionId: collection._id,
    mode,
    billId: new Types.ObjectId().toString(),
    dataId: data._id,
    q: 'chunk content',
    chunkIndex: 0,
    retryCount: 5,
    lockTime: new Date('2000-01-01')
  });

  return { root, dataset, collection, data, task };
};

describe('pre-created data queue routing', () => {
  it('does not consume legacy chunk tasks before migration', async () => {
    const { task } = await createContext();
    await MongoDatasetTraining.collection.updateOne(
      { _id: new Types.ObjectId(task._id) },
      { $set: { mode: 'chunk' } }
    );
    await generateRebuildIndex();
    await generatePreCreatedData();
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({ mode: 'chunk' });
    expect(mockVectorInsert).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    Object.assign(serviceEnv, { DATASET_SYNONYM_ENABLED: false });
    global.vectorQueueLen = 0;
    global.synonymQueueLen = 0;
    global.preCreatedQueueLen = 0;
    resetVectorMocks();
    mockVectorDelete.mockResolvedValue(undefined);
    mockVectorRefreshCreateTime.mockReset().mockResolvedValue(undefined);
    embeddingModel = {
      ...getModelTestDefaults().embedding!,
      modelId: '507f1f77bcf86cd799439031',
      model: 'pre-create-embedding',
      name: 'pre-create-embedding',
      config: { ...getModelTestDefaults().embedding!.config, maxToken: 100, weight: 100 }
    };
    addModelTestModel(embeddingModel);
    mockGetVectors
      .mockClear()
      .mockImplementation(async ({ inputs }) =>
        createMockVectorsResponse(inputs.map((input) => input.input))
      );
    mockVectorInsert.mockResolvedValue({ insertIds: ['pre_vector_1'] });
  });

  it.each([
    [TrainingModeEnum.rebuildIndex, generateRebuildIndex, 'vectorQueueLen'],
    [TrainingModeEnum.rebuildSynonym, generateRebuildSynonym, 'synonymQueueLen']
  ] as const)(
    'runs only one %s worker while other queues are busy',
    async (mode, run, queueKey) => {
      Object.assign(serviceEnv, { DATASET_SYNONYM_ENABLED: true });
      global.systemEnv = { ...global.systemEnv, vectorMaxProcess: 1 };
      const otherQueueKey = queueKey === 'vectorQueueLen' ? 'synonymQueueLen' : 'vectorQueueLen';
      global[otherQueueKey] = 1;
      global.preCreatedQueueLen = 1;
      const indexes = [{ type: DatasetDataIndexTypeEnum.default, text: 'stored', dataId: 'old' }];
      const indexStatus = (() => {
        if (mode === TrainingModeEnum.rebuildIndex)
          return DatasetDataIndexStatusEnum.rebuildIndexRunning;
        return DatasetDataIndexStatusEnum.rebuildSynonymRunning;
      })();
      const first = await createContext({ mode, indexes, indexStatus });
      const second = await createContext({ mode, indexes, indexStatus });
      if (mode === TrainingModeEnum.rebuildSynonym) {
        await MongoDatasetSynonym.create(
          [first, second].map(({ root, dataset }) => ({
            teamId: root.teamId,
            datasetId: dataset._id,
            version: 1,
            enabled: false
          }))
        );
      }
      let resume!: () => void;
      let started!: () => void;
      const blocked = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const processing = new Promise<void>((resolve) => {
        started = resolve;
      });
      mockGetVectors.mockImplementationOnce(async ({ inputs }) => {
        started();
        await blocked;
        return createMockVectorsResponse(inputs.map((input) => input.input));
      });

      const worker = run();
      try {
        await processing;
        await run();
        expect(mockGetVectors).toHaveBeenCalledTimes(1);
        expect(global[queueKey]).toBe(1);
        expect(
          await MongoDatasetTraining.countDocuments({
            _id: { $in: [first.task._id, second.task._id] },
            lockTime: new Date('2000-01-01')
          })
        ).toBe(1);
      } finally {
        resume();
        await worker;
      }
      expect(await MongoDatasetTraining.findById(first.task._id)).toBeNull();
      expect(await MongoDatasetTraining.findById(second.task._id)).toBeNull();
      expect(mockGetVectors).toHaveBeenCalledTimes(2);
      expect(global[queueKey]).toBe(0);
      expect(global[otherQueueKey]).toBe(1);
      expect(global.preCreatedQueueLen).toBe(1);
    }
  );

  it('lets ordinary index training run while both rebuild workers are busy', async () => {
    global.systemEnv = { ...global.systemEnv, vectorMaxProcess: 1 };
    global.vectorQueueLen = 1;
    global.synonymQueueLen = 1;
    const { task, data } = await createContext({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });
    await generatePreCreatedData();
    expect(await MongoDatasetTraining.findById(task._id)).toBeNull();
    expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexed
    });
    expect(global.vectorQueueLen).toBe(1);
    expect(global.synonymQueueLen).toBe(1);
  });

  it.each([false, true])(
    'stops the heartbeat when scheduling a missing-collection rebuild throws (synonym=%s)',
    async (synonymEnabled) => {
      const { task, collection } = await createContext({ mode: TrainingModeEnum.rebuildIndex });
      const synonym = vi
        .spyOn(synonymService, 'isDatasetSynonymEnabled')
        .mockReturnValue(synonymEnabled);
      await MongoDatasetCollection.deleteOne({ _id: collection._id });
      const enqueue = vi
        .spyOn(rebuildService, 'enqueueNextDatasetRebuildTask')
        .mockImplementation(async () => {
          expect(vi.getTimerCount()).toBe(1);
          throw new Error('enqueue unavailable');
        });
      try {
        await generateRebuildIndex();
        expect(enqueue).toHaveBeenCalled();
        expect(global.vectorQueueLen).toBe(0);
        expect(await MongoDatasetTraining.findById(task._id).lean()).not.toBeNull();
      } finally {
        enqueue.mockRestore();
        synonym.mockRestore();
      }
    }
  );

  it('rolls back index data and removes new vectors when task completion fails', async () => {
    const { data, task } = await createContext({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });
    const removeTask = vi
      .spyOn(MongoDatasetTraining, 'deleteOne')
      .mockRejectedValueOnce(new Error('completion failed'));
    try {
      await generatePreCreatedData();
    } finally {
      removeTask.mockRestore();
    }
    expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexing,
      indexes: []
    });
    expect(await MongoDatasetDataText.countDocuments({ dataId: data._id })).toBe(0);
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      retryCount: 4,
      errorMsg: 'completion failed'
    });
    expect(mockVectorDelete).toHaveBeenCalledWith(
      expect.objectContaining({ idList: ['pre_vector_1'] })
    );
  });

  it('keeps old rebuild vectors on rollback and only deletes them after a successful retry', async () => {
    const oldIndexes = [
      { type: DatasetDataIndexTypeEnum.default, text: 'chunk content', dataId: 'old_vector' }
    ];
    const { data, task } = await createContext({
      mode: TrainingModeEnum.rebuildIndex,
      indexes: oldIndexes
    });
    const removeTask = vi
      .spyOn(MongoDatasetTraining, 'deleteOne')
      .mockRejectedValueOnce(new Error('completion failed'));
    mockGetVectors.mockImplementation(async ({ inputs }) => {
      expect(mockVectorRefreshCreateTime).toHaveBeenCalledWith({
        teamId: String(data.teamId),
        idList: ['old_vector']
      });
      expect((await MongoDatasetData.findById(data._id).lean())?.indexes).toMatchObject(oldIndexes);
      expect(mockVectorDelete).not.toHaveBeenCalledWith(
        expect.objectContaining({ idList: ['old_vector'] })
      );
      return createMockVectorsResponse(inputs.map((input) => input.input));
    });
    try {
      await generateRebuildIndex();
    } finally {
      removeTask.mockRestore();
    }
    expect((await MongoDatasetData.findById(data._id).lean())?.indexes).toMatchObject(oldIndexes);
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({ retryCount: 4 });
    expect(mockVectorDelete).toHaveBeenCalledWith(
      expect.objectContaining({ idList: ['pre_vector_1'] })
    );
    expect(mockVectorDelete).not.toHaveBeenCalledWith(
      expect.objectContaining({ idList: ['old_vector'] })
    );

    mockVectorDelete.mockClear();
    mockVectorInsert.mockResolvedValue({ insertIds: ['retry_vector'] });
    mockVectorDelete.mockImplementation(async ({ idList }) => {
      expect(idList).toEqual(['old_vector']);
      // 不带 session 读取，验证清理发生在整个业务事务真正提交之后。
      expect(await MongoDatasetTraining.findById(task._id).lean()).toBeNull();
      expect((await MongoDatasetData.findById(data._id).lean())?.indexes[0].dataId).toBe(
        'retry_vector'
      );
    });
    await MongoDatasetTraining.updateOne({ _id: task._id }, { $set: { lockTime: new Date(0) } });
    await generateRebuildIndex();
    expect(mockVectorDelete).toHaveBeenCalledTimes(1);
    expect(await MongoDatasetTraining.findById(task._id).lean()).toBeNull();
    expect((await MongoDatasetData.findById(data._id).lean())?.indexStatus).toBe(
      DatasetDataIndexStatusEnum.indexed
    );
  });

  it('retains committed rebuild vectors when old vector cleanup fails', async () => {
    const { data, task } = await createContext({
      mode: TrainingModeEnum.rebuildIndex,
      indexes: [
        { type: DatasetDataIndexTypeEnum.default, text: 'chunk content', dataId: 'old_vector' }
      ]
    });
    mockVectorDelete.mockRejectedValue(new Error('vector delete unavailable'));
    await generateRebuildIndex();
    expect(await MongoDatasetTraining.findById(task._id).lean()).toBeNull();
    expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexed,
      indexes: [{ dataId: 'pre_vector_1' }]
    });
    expect(mockVectorDelete).toHaveBeenCalled();
    expect(
      mockVectorDelete.mock.calls.every(([props]) => props.idList?.includes('old_vector'))
    ).toBe(true);
  });

  it('keeps the task retryable and does not generate vectors when refreshing old timestamps fails', async () => {
    const indexes = [
      { type: DatasetDataIndexTypeEnum.default, text: 'chunk content', dataId: 'old_vector' }
    ];
    const { data, task } = await createContext({ mode: TrainingModeEnum.rebuildIndex, indexes });
    mockVectorRefreshCreateTime.mockRejectedValue(new Error('refresh failed'));
    await generateRebuildIndex();
    expect(mockGetVectors).not.toHaveBeenCalled();
    expect(mockVectorInsert).not.toHaveBeenCalled();
    expect(mockVectorDelete).not.toHaveBeenCalled();
    expect((await MongoDatasetData.findById(data._id).lean())?.indexes).toMatchObject(indexes);
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      retryCount: 4,
      errorMsg: 'refresh failed'
    });
  });

  it('retains a normal rebuild task when scheduling the next item fails', async () => {
    const { data, task } = await createContext({
      mode: TrainingModeEnum.rebuildIndex,
      indexes: []
    });
    const enqueue = vi
      .spyOn(rebuildService, 'enqueueNextDatasetRebuildTask')
      .mockRejectedValue(new Error('enqueue failed'));
    try {
      await generateRebuildIndex();
      expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
        retryCount: 4,
        errorMsg: 'enqueue failed'
      });
      expect((await MongoDatasetData.findById(data._id).lean())?.indexes).toEqual([]);
      expect(mockVectorInsert).not.toHaveBeenCalled();
    } finally {
      enqueue.mockRestore();
    }
  });

  it('does not publish generated vectors after another worker takes ownership', async () => {
    const { data, task } = await createContext({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });
    const replacementLock = new Date(Date.now() + 1000);
    mockGetVectors.mockImplementation(async ({ inputs }) => {
      await MongoDatasetTraining.updateOne(
        { _id: task._id },
        { $set: { lockTime: replacementLock } }
      );
      return createMockVectorsResponse(inputs.map((input) => input.input));
    });
    await generatePreCreatedData();
    expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexing,
      indexes: []
    });
    expect(await MongoDatasetDataText.countDocuments({ dataId: data._id })).toBe(0);
    const retainedTask = await MongoDatasetTraining.findById(task._id).lean();
    expect(retainedTask).toMatchObject({ retryCount: 5, lockTime: replacementLock });
    expect(retainedTask?.errorMsg).toBeUndefined();
    expect(mockVectorDelete).toHaveBeenCalledWith(
      expect.objectContaining({ idList: ['pre_vector_1'] })
    );
  });

  it('completes initial indexing in place and commits full-text without enqueueing a rebuild', async () => {
    const { dataset, data, task } = await createContext({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });
    mockGetVectors.mockImplementation(async ({ inputs }) => {
      // 向量生成期间保持 indexing，完成后才与全文记录一起提交 indexed。
      expect((await MongoDatasetData.findById(data._id).lean())?.indexStatus).toBe(
        DatasetDataIndexStatusEnum.indexing
      );
      return createMockVectorsResponse(inputs.map((input) => input.input));
    });
    await generatePreCreatedData();
    const updated = await MongoDatasetData.findById(data._id).lean();
    expect(updated).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexed,
      q: 'chunk content'
    });
    expect(updated!.indexes.length).toBeGreaterThan(0);
    expect(updated!.indexes.every((index) => Boolean(index.dataId))).toBe(true);
    expect(updated?.history ?? []).toHaveLength(0);
    expect(mockGetVectors).toHaveBeenCalled();
    expect(await MongoDatasetData.countDocuments({ collectionId: data.collectionId })).toBe(1);
    expect(await MongoDatasetDataText.countDocuments({ dataId: data._id })).toBe(1);
    expect(await MongoDatasetTraining.findById(task._id)).toBeNull();
    expect(await MongoDatasetTraining.countDocuments({ datasetId: dataset._id })).toBe(0);
  });

  it('does not consume pre-created tasks', async () => {
    const { data, task } = await createContext({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });

    await generateRebuildIndex();

    expect(await MongoDatasetTraining.findById(task._id)).not.toBeNull();
    expect((await MongoDatasetData.findById(data._id).lean())?.indexStatus).toBe(
      DatasetDataIndexStatusEnum.indexing
    );
  });

  it('keeps an explicitly cleared answer through failed and successful index retries', async () => {
    const mode = TrainingModeEnum.index;
    const answer = 'old QA answer';
    const { root, data, task } = await createContext({
      mode,
      indexStatus: DatasetDataIndexStatusEnum.error,
      indexes: [
        { type: DatasetDataIndexTypeEnum.default, text: answer, dataId: 'old_answer_vector' }
      ]
    });
    await MongoDatasetData.updateOne({ _id: data._id }, { $set: { a: answer } });
    await MongoDatasetTraining.updateOne(
      { _id: task._id },
      { $set: { a: answer, retryCount: 0, errorMsg: 'index failed' } }
    );

    const editResult = await Call<
      UpdateTrainingDataBody,
      Record<string, never>,
      UpdateTrainingDataResponse
    >(updateTrainingData, {
      auth: root,
      body: { dataId: task._id, q: 'chunk content', a: '' }
    });
    expect(editResult.code).toBe(200);
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      a: ''
    });
    // 编辑先保存在训练记录中；正文和索引必须由 worker 原子提交。
    expect((await MongoDatasetData.findById(data._id).lean())?.a).toBe(answer);

    const runQueue = generatePreCreatedData;
    const removeTask = vi
      .spyOn(MongoDatasetTraining, 'deleteOne')
      .mockRejectedValueOnce(new Error('completion failed'));
    try {
      await runQueue();
    } finally {
      removeTask.mockRestore();
    }
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      a: '',
      errorMsg: 'completion failed'
    });
    expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
      a: answer,
      indexes: [{ text: answer, dataId: 'old_answer_vector' }]
    });

    // 再次仅重试（不传 a）不能丢失上次编辑的清空语义。
    const retryResult = await Call<
      UpdateTrainingDataBody,
      Record<string, never>,
      UpdateTrainingDataResponse
    >(updateTrainingData, { auth: root, body: { dataId: task._id } });
    expect(retryResult.code).toBe(200);
    await runQueue();

    const updated = await MongoDatasetData.findById(data._id).lean();
    expect(updated).toMatchObject({
      a: '',
      indexStatus: DatasetDataIndexStatusEnum.indexed,
      history: [{ a: answer }]
    });
    expect(updated!.indexes.map((index) => index.text)).not.toContain(answer);
    const fullText = await MongoDatasetDataText.findOne({ dataId: data._id }).lean();
    expect(fullText?.fullTextToken).toBe(await jiebaSplit({ text: 'chunk content' }));
    expect(await MongoDatasetTraining.findById(task._id).lean()).toBeNull();
  });

  it('rebuilds stored indexes and ignores all training text and index drafts', async () => {
    const storedIndexes = [
      { type: DatasetDataIndexTypeEnum.default, text: 'stored default', dataId: 'old_default' },
      { type: DatasetDataIndexTypeEnum.custom, text: 'stored custom', dataId: 'old_custom' },
      { type: DatasetDataIndexTypeEnum.question, text: 'stored question', dataId: 'old_question' },
      { type: DatasetDataIndexTypeEnum.summary, text: 'stored summary', dataId: 'old_summary' },
      {
        type: DatasetDataIndexTypeEnum.image,
        text: 'stored image description',
        dataId: 'old_image'
      }
    ];
    const { data, task, dataset, collection } = await createContext({
      mode: TrainingModeEnum.rebuildIndex,
      indexes: storedIndexes
    });
    expect(data.indexStatus).toBeUndefined();
    await MongoDatasetData.updateOne(
      { _id: data._id },
      {
        $set: {
          q: 'stored body',
          a: 'stored answer',
          imageDescMap: { image: 'existing description' }
        }
      }
    );
    await MongoDatasetTraining.updateOne(
      { _id: task._id },
      {
        $set: {
          q: 'training body',
          a: 'training answer',
          indexes: [{ type: DatasetDataIndexTypeEnum.custom, text: 'training draft' }]
        }
      }
    );
    await MongoDataset.updateOne({ _id: dataset._id }, { $set: { vlmModelId: 'missing-vlm' } });
    await MongoDatasetCollection.updateOne(
      { _id: collection._id },
      { $set: { imageIndex: false } }
    );
    mockVectorInsert.mockImplementation(async ({ vectors }: { vectors: number[][] }) => ({
      insertIds: vectors.map((_, index) => `rebuilt_${index}`)
    }));
    const modelHandle = await modelService.getModelHandle();
    const vlmLookup = vi.spyOn(modelHandle, 'getVlmModelData').mockImplementation(() => {
      throw new Error('rebuild must not look up VLM');
    });
    try {
      await generateRebuildIndex();
      expect(vlmLookup).not.toHaveBeenCalled();
    } finally {
      vlmLookup.mockRestore();
    }
    expect(
      mockGetVectors.mock.calls.flatMap(([props]) => props.inputs.map((input) => input.input))
    ).toEqual(storedIndexes.map((index) => index.text));
    const updated = await MongoDatasetData.findById(data._id).lean();
    expect(updated).toMatchObject({
      q: 'stored body',
      a: 'stored answer',
      indexStatus: DatasetDataIndexStatusEnum.indexed,
      imageDescMap: { image: 'existing description' }
    });
    expect(updated!.indexes.map(({ type, text }) => ({ type, text }))).toEqual(
      storedIndexes.map(({ type, text }) => ({ type, text }))
    );
    expect(updated?.history ?? []).toHaveLength(0);
    expect(await MongoDatasetTraining.findById(task._id).lean()).toBeNull();
  });
});

// 仅接管心跳定时器，Mongo 和业务等待仍使用真实时间。
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});
afterEach(() => {
  const remainingHeartbeats = vi.getTimerCount();
  vi.useRealTimers();
  expect(remainingHeartbeats).toBe(0);
});

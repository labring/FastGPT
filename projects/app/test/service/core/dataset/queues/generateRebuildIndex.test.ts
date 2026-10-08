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
      (mode === TrainingModeEnum.rebuild
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

  it.each([false, true])(
    'stops the heartbeat when scheduling a missing-collection rebuild throws (synonym=%s)',
    async (synonymEnabled) => {
      const { task, collection } = await createContext({ mode: TrainingModeEnum.rebuild });
      const synonym = vi
        .spyOn(synonymService, 'isDatasetSynonymEnabled')
        .mockReturnValue(synonymEnabled);
      if (synonymEnabled) {
        await MongoDatasetTraining.updateOne({ _id: task._id }, { $set: { synonymVersion: 1 } });
      }
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
      mode: TrainingModeEnum.rebuild,
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
      mode: TrainingModeEnum.rebuild,
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
    const { data, task } = await createContext({ mode: TrainingModeEnum.rebuild, indexes });
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
    const { data, task } = await createContext({ mode: TrainingModeEnum.rebuild, indexes: [] });
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

  /** CP-04 / DS-07 规则 3：待索引数据走提前落库路径，更新同一条数据。 */
  it('updates the same pre-created data and marks it indexed', async () => {
    const { data, task } = await createContext({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });

    await generatePreCreatedData();

    const updated = await MongoDatasetData.findById(data._id).lean();
    expect(updated).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexed,
      q: 'chunk content'
    });
    expect(updated!.indexes.length).toBeGreaterThan(0);
    expect(updated!.indexes.every((index) => Boolean(index.dataId))).toBe(true);

    // 同一 dataId 只有一条数据行，训练任务按现有逻辑删除。
    expect(await MongoDatasetData.countDocuments({ collectionId: data.collectionId })).toBe(1);
    expect(await MongoDatasetTraining.findById(task._id)).toBeNull();
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

  /**
   * DS-07：新路径在向量处理前已经是 indexing。
   * 向量调用发生在领取任务之后，因此在该回调里读库能观察到状态保持不变。
   */
  it('keeps pre-created data indexing before writing vectors', async () => {
    const { data } = await createContext({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });

    const statusesDuringVectorWrite: (string | undefined)[] = [];
    mockGetVectors.mockImplementation(async ({ inputs }) => {
      const current = await MongoDatasetData.findById(data._id).lean();
      statusesDuringVectorWrite.push(current?.indexStatus);
      return createMockVectorsResponse(inputs.map((input) => input.input));
    });

    await generatePreCreatedData();

    expect(statusesDuringVectorWrite).not.toHaveLength(0);
    expect(statusesDuringVectorWrite).toContain(DatasetDataIndexStatusEnum.indexing);
    // 完成态仍收敛到 indexed。
    expect((await MongoDatasetData.findById(data._id).lean())?.indexStatus).toBe(
      DatasetDataIndexStatusEnum.indexed
    );
  });

  /** DS-10.3：Mongo $text provider 的全文行与 indexed 标记同边界写入。 */
  it('writes the full-text record together with the indexed status', async () => {
    const { data } = await createContext({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });

    await generatePreCreatedData();

    expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexed
    });
    expect(await MongoDatasetDataText.countDocuments({ dataId: data._id })).toBe(1);
  });

  /** DS-07：提前落库路径不得触发重建接力，任务表不产生重建链残留。 */
  it('does not enqueue a following rebuild task', async () => {
    const { dataset, data } = await createContext({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });

    await generatePreCreatedData();

    expect(await MongoDatasetTraining.countDocuments({ datasetId: dataset._id })).toBe(0);
    const updated = await MongoDatasetData.findById(data._id).lean();
    expect(updated?.indexStatus).toBe(DatasetDataIndexStatusEnum.indexed);
    // 内容未变化时不写入历史记录。
    expect(updated?.history ?? []).toHaveLength(0);
  });

  /** CP-03：关联数据无状态时继续走现有正式数据重建路径。 */
  it('keeps the rebuild path for data without indexStatus', async () => {
    const { data } = await createContext({
      mode: TrainingModeEnum.rebuild,
      indexes: [
        {
          type: DatasetDataIndexTypeEnum.custom,
          text: 'legacy custom index',
          dataId: 'legacy_vector_1'
        }
      ]
    });

    await generateRebuildIndex();

    const updated = await MongoDatasetData.findById(data._id).lean();
    expect(updated?.indexStatus).toBe(DatasetDataIndexStatusEnum.indexed);
    expect(updated!.indexes.map((index) => index.text)).toContain('legacy custom index');
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
      mode: TrainingModeEnum.rebuild,
      indexes: storedIndexes
    });
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

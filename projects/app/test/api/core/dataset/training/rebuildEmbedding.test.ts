import handler from '@/pages/api/core/dataset/training/rebuildEmbedding';
import type {
  EmbeddingModelDataType,
  LLMModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  DatasetDataIndexStatusEnum,
  DatasetDataIndexTypeEnum
} from '@fastgpt/global/core/dataset/data/constants';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import * as modelCatalogService from '@fastgpt/service/core/ai/model/catalog/service';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { getRootUser } from '@test/datas/users';
import { addModelTestModel, getModelTestDefaults } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
vi.unmock('@fastgpt/service/core/ai/model/catalog/service');
vi.unmock('@fastgpt/service/support/user/audit/util');

let testRoot: Awaited<ReturnType<typeof getRootUser>>;
let visionEmbeddingModel: EmbeddingModelDataType;
let textOnlyEmbeddingModel: EmbeddingModelDataType;
let datasetVlmModel: LLMModelDataType;
let agentModel: LLMModelDataType;

const createDatasetContext = async ({
  currentVectorModel = textOnlyEmbeddingModel,
  vlmModel
}: {
  currentVectorModel?: EmbeddingModelDataType;
  vlmModel?: LLMModelDataType;
} = {}) => {
  const root = testRoot;
  const dataset = await MongoDataset.create({
    name: 'test dataset',
    teamId: root.teamId,
    tmbId: root.tmbId,
    vectorModelId: currentVectorModel.modelId,
    agentModelId: agentModel.modelId,
    ...(vlmModel && { vlmModelId: vlmModel.modelId })
  });
  const collection = await MongoDatasetCollection.create({
    name: 'test collection',
    type: DatasetCollectionTypeEnum.file,
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    imageIndex: true
  });

  return { root, dataset, collection };
};

describe('POST /api/core/dataset/training/rebuildEmbedding', () => {
  beforeEach(async () => {
    testRoot = await getRootUser();
    global.systemEnv = {
      ...global.systemEnv,
      vectorMaxProcess: 1
    };
    const { llm, embedding: defaultEmbeddingModel } = getModelTestDefaults();
    if (!llm || !defaultEmbeddingModel) throw new Error('Default test models are not initialized');
    agentModel = llm;
    visionEmbeddingModel = {
      ...defaultEmbeddingModel,
      modelId: '507f1f77bcf86cd799439012',
      model: 'vision-embedding',
      name: 'vision-embedding',
      config: {
        ...defaultEmbeddingModel.config,
        vision: true
      }
    };
    textOnlyEmbeddingModel = {
      ...defaultEmbeddingModel,
      modelId: '507f1f77bcf86cd799439013',
      model: 'text-only-embedding',
      name: 'text-only-embedding',
      config: {
        ...defaultEmbeddingModel.config,
        vision: false
      }
    };
    datasetVlmModel = {
      ...agentModel,
      modelId: '507f1f77bcf86cd799439014',
      model: 'dataset-vlm-model',
      name: 'dataset-vlm-model',
      config: {
        ...agentModel.config,
        vision: true
      }
    };

    [visionEmbeddingModel, textOnlyEmbeddingModel, datasetVlmModel].forEach((model) => {
      addModelTestModel(model);
    });
  });

  it('should keep image index and enqueue only rebuild mode when the new embedding model supports images', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'question with ![cat](dataset/team/cat.png)',
      indexes: [
        {
          type: DatasetDataIndexTypeEnum.custom,
          text: 'manual index',
          dataId: 'manual_id'
        }
      ]
    });

    expect(
      (await modelCatalogService.getSystemModelHandle()).getModelData(
        { modelId: visionEmbeddingModel.modelId },
        { type: 'embedding' }
      )
    ).toEqual(visionEmbeddingModel);
    expect(
      (await modelCatalogService.getSystemModelHandle()).getModelData(
        { modelId: agentModel.modelId },
        { type: 'llm' }
      )
    ).toEqual(agentModel);

    const getTeamModelHandleSpy = vi.spyOn(modelCatalogService, 'getTeamModelHandle');
    onTestFinished(() => getTeamModelHandleSpy.mockRestore());
    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    const updatedDataset = await MongoDataset.findById(dataset._id).lean();
    const updatedCollection = await MongoDatasetCollection.findById(collection._id).lean();
    const training = await MongoDatasetTraining.findOne({ dataId: data._id }).lean();

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    // 目录只在鉴权时读取一次，审计必须复用快照，不能额外发起主库版本查询。
    expect(getTeamModelHandleSpy).toHaveBeenCalledTimes(1);
    expect(String(updatedDataset?.vectorModelId)).toBe(visionEmbeddingModel.modelId);
    expect(updatedCollection?.imageIndex).toBe(true);
    expect(training).toEqual(
      expect.objectContaining({
        mode: TrainingModeEnum.rebuildIndex,
        q: '',
        retryCount: 3
      })
    );
    expect(training?.indexes).toEqual([]);

    // 审计在重建任务落库后异步写入：正文用模型展示名，内部 ID 单独保留以便排查改名。
    await vi.waitFor(
      async () => {
        const logs = await MongoTeamAudit.find({
          teamId: root.teamId,
          event: 'dataset.index.rebuild'
        }).lean();
        expect(logs).toHaveLength(1);
        expect(logs[0].metadata).toEqual(
          expect.objectContaining({
            datasetName: 'test dataset',
            oldModelName: textOnlyEmbeddingModel.name,
            newModelName: visionEmbeddingModel.name,
            oldModelId: textOnlyEmbeddingModel.modelId,
            newModelId: visionEmbeddingModel.modelId
          })
        );
      },
      { timeout: 5000 }
    );
  });

  it('should disable image index and enqueue rebuild mode when the new embedding model has no image capability', async () => {
    const { root, dataset, collection } = await createDatasetContext({
      currentVectorModel: visionEmbeddingModel
    });
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'question with ![cat](dataset/team/cat.png)'
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: textOnlyEmbeddingModel.modelId
      }
    });

    const updatedDataset = await MongoDataset.findById(dataset._id).lean();
    const updatedCollection = await MongoDatasetCollection.findById(collection._id).lean();
    const training = await MongoDatasetTraining.findOne({ dataId: data._id }).lean();

    expect(res.code).toBe(200);
    expect(String(updatedDataset?.vectorModelId)).toBe(textOnlyEmbeddingModel.modelId);
    expect(updatedDataset?.chunkSettings?.imageIndex).toBe(false);
    expect(updatedCollection?.imageIndex).toBe(false);
    expect(training).toEqual(
      expect.objectContaining({
        mode: TrainingModeEnum.rebuildIndex,
        retryCount: 3
      })
    );
    expect(training?.q).toBe('');
  });

  it('should enqueue only rebuild mode for image data when VLM is configured', async () => {
    const { root, dataset, collection } = await createDatasetContext({
      currentVectorModel: visionEmbeddingModel,
      vlmModel: datasetVlmModel
    });
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: '',
      imageId: 'dataset/team/main.png'
    });

    expect(
      (await modelCatalogService.getSystemModelHandle()).getModelData(
        { modelId: datasetVlmModel.modelId },
        { type: 'llm', vision: true }
      )
    ).toEqual(datasetVlmModel);

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: textOnlyEmbeddingModel.modelId
      }
    });

    const training = await MongoDatasetTraining.findOne({ dataId: data._id }).lean();

    expect(res.code).toBe(200);
    expect(training).toEqual(
      expect.objectContaining({
        mode: TrainingModeEnum.rebuildIndex,
        retryCount: 3
      })
    );
  });

  it('should reject model rebuilding while the shared rebuild queue is busy', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'pending',
      indexes: [],
      indexStatus: 'rebuildIndexPending'
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.code).toBe(500);
    await expect(MongoDataset.findById(dataset._id).lean()).resolves.toMatchObject({
      vectorModelId: textOnlyEmbeddingModel.modelId
    });
    await expect(MongoDatasetTraining.countDocuments({ datasetId: dataset._id })).resolves.toBe(0);
  });

  it('should ignore final-error training records when switching the embedding model', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'failed',
      indexes: [],
      indexStatus: 'error'
    });
    await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'bill',
      mode: TrainingModeEnum.index,
      retryCount: 0,
      lockTime: new Date(),
      errorMsg: '404 The model does not exist'
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
  });

  it('keeps first-index failed data and its final-error task unchanged', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const failedData = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: '',
      indexes: [],
      indexStatus: 'error',
      indexErrorMsg: '404 old model does not exist'
    });
    const indexedData = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'indexed content',
      indexes: [],
      indexStatus: 'indexed'
    });
    const failedTask = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'old-bill',
      mode: TrainingModeEnum.index,
      dataId: failedData._id,
      retryCount: 0,
      lockTime: new Date(),
      errorMsg: '404 old model does not exist',
      q: 'OCR parsed text',
      a: '',
      indexSize: 768,
      indexes: [
        { type: 'custom', text: 'user custom index', dataId: 'custom-1' },
        { type: 'summary', text: 'draft summary', dataId: 'summary-1' }
      ],
      imageDescMap: { 'dataset/team/a.png': '图片描述' }
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.code).toBe(200);

    // 失败数据保持 error，final-error index 任务作为重试入口原样保留
    const failedAfter = await MongoDatasetData.findById(failedData._id).lean();
    expect(failedAfter).toMatchObject({
      indexStatus: 'error',
      indexErrorMsg: '404 old model does not exist'
    });
    const failedTaskAfter = await MongoDatasetTraining.findById(failedTask._id).lean();
    expect(failedTaskAfter).toMatchObject({
      retryCount: 0,
      q: 'OCR parsed text',
      indexSize: 768,
      imageDescMap: { 'dataset/team/a.png': '图片描述' }
    });
    expect(failedTaskAfter?.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'custom', text: 'user custom index' }),
        expect.objectContaining({ type: 'summary', text: 'draft summary' })
      ])
    );
    // 不为失败数据创建新的 index 任务
    await expect(
      MongoDatasetTraining.countDocuments({
        dataId: failedData._id,
        mode: TrainingModeEnum.index,
        _id: { $ne: failedTask._id }
      })
    ).resolves.toBe(0);

    // 已索引数据进入重建队列
    const indexedAfter = await MongoDatasetData.findById(indexedData._id).lean();
    expect(['rebuildIndexPending', 'rebuildIndexRunning']).toContain(indexedAfter?.indexStatus);
    await expect(
      MongoDatasetTraining.countDocuments({
        dataId: indexedData._id,
        mode: TrainingModeEnum.rebuildIndex
      })
    ).resolves.toBeGreaterThan(0);
  });

  it('rejects switching while a paused synonym rebuild can still resume', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'synonym-bill',
      mode: TrainingModeEnum.rebuildSynonym,
      retryCount: 3,
      lockTime: new Date('2050-01-01'),
      errorMsg: 'AI points not enough'
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.code).toBe(500);
    expect(String(res.error)).toContain('暂停或可恢复的训练任务');
  });

  it('replaces a final-error synonym rebuild with the full rebuild', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'synonym failed data',
      indexes: [],
      indexStatus: 'rebuildSynonymFailed',
      indexErrorMsg: 'synonym rebuild failed'
    });
    await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'synonym-bill',
      mode: TrainingModeEnum.rebuildSynonym,
      dataId: data._id,
      retryCount: 0,
      lockTime: new Date(),
      errorMsg: 'synonym rebuild failed',
      expireAt: null
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    await expect(
      MongoDatasetTraining.countDocuments({
        datasetId: dataset._id,
        mode: TrainingModeEnum.rebuildSynonym
      })
    ).resolves.toBe(0);
    const updatedData = await MongoDatasetData.findById(data._id).lean();
    expect(['rebuildIndexPending', 'rebuildIndexRunning']).toContain(updatedData?.indexStatus);
    await expect(
      MongoDatasetTraining.countDocuments({
        datasetId: dataset._id,
        mode: TrainingModeEnum.rebuildIndex
      })
    ).resolves.toBe(1);
  });

  it('removes inert rebuild tasks that cannot be matched as final-error', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'inert rebuild data',
      indexes: [],
      indexStatus: 'rebuildIndexFailed'
    });
    // retryCount=0 且没有 errorMsg：不满足 finalErrorTrainingMatch，但同样是死任务。
    const inertTask = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'inert-bill',
      mode: TrainingModeEnum.rebuildIndex,
      dataId: data._id,
      retryCount: 0,
      lockTime: new Date(),
      expireAt: null
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    await expect(MongoDatasetTraining.countDocuments({ _id: inertTask._id })).resolves.toBe(0);
    await expect(
      MongoDatasetTraining.countDocuments({
        dataId: data._id,
        mode: TrainingModeEnum.rebuildIndex
      })
    ).resolves.toBe(1);
  });

  it('rechecks training state inside the rebuild transaction', async () => {
    const { root, dataset } = await createDatasetContext();
    const runMock = vi.mocked(mongoSessionRun);
    const run = runMock.getMockImplementation();
    if (!run) throw new Error('mongoSessionRun mock is not initialized');
    let callCount = 0;
    runMock.mockImplementation(async (fn) => {
      callCount++;
      // 第一次是 createTrainingUsage，第二次是切换事务；
      // 在切换事务开始前提交一条 active 任务，模拟两次检查之间的并发提交。
      if (callCount === 2) {
        await MongoDatasetTraining.create({
          teamId: root.teamId,
          tmbId: root.tmbId,
          datasetId: dataset._id,
          collectionId: dataset._id,
          billId: 'race-bill',
          mode: TrainingModeEnum.index,
          retryCount: 3,
          lockTime: new Date('2000-01-01')
        });
      }
      return run(fn);
    });
    onTestFinished(() => runMock.mockImplementation(run));

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.code).toBe(500);
    expect(String(res.error)).toContain('正在训练或者重建中');
    await expect(MongoDataset.findById(dataset._id).lean()).resolves.toMatchObject({
      vectorModelId: textOnlyEmbeddingModel.modelId
    });
  });

  it('rejects switching when a first-index task is retried concurrently', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'failed data',
      indexes: [],
      indexStatus: 'error'
    });
    // 用户在切换前恢复了失败任务；切换必须等它结束，不能与它并发写同一批 data。
    const retriedTask = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'retry-bill',
      mode: TrainingModeEnum.index,
      dataId: data._id,
      retryCount: 3,
      lockTime: new Date('2000-01-01'),
      q: 'failed data',
      indexes: []
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.code).toBe(500);
    expect(String(res.error)).toContain('正在训练或者重建中');
    await expect(MongoDatasetTraining.exists({ _id: retriedTask._id })).resolves.toBeTruthy();
    await expect(MongoDataset.findById(dataset._id).lean()).resolves.toMatchObject({
      vectorModelId: textOnlyEmbeddingModel.modelId
    });
  });

  it('rebuilds a final-error data when its retry completes after the transaction snapshot', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'failed data',
      indexes: [],
      indexStatus: DatasetDataIndexStatusEnum.error
    });
    const errorTask = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'retry-bill',
      mode: TrainingModeEnum.index,
      dataId: data._id,
      retryCount: 0,
      lockTime: new Date('2000-01-01'),
      q: 'failed data',
      indexes: [],
      errorMsg: 'embedding failed'
    });

    const mongoSessionRunMock = vi.mocked(mongoSessionRun);
    const runWithoutTransaction = mongoSessionRunMock.getMockImplementation();
    if (!runWithoutTransaction) throw new Error('mongoSessionRun mock is not initialized');
    mongoSessionRunMock
      // createTrainingUsage 会先占用一次调用，后续重建事务使用真实 session。
      .mockImplementationOnce(runWithoutTransaction)
      .mockImplementation(async (fn) => {
        const session = await connectionMongo.startSession();
        try {
          return await session.withTransaction(() => fn(session));
        } finally {
          await session.endSession();
        }
      });

    const originalUpdateMany = MongoDatasetData.updateMany.bind(MongoDatasetData);
    let workerCompleted = false;
    const updateManySpy = vi.spyOn(MongoDatasetData, 'updateMany').mockImplementation((async (
      filter: any,
      update: any,
      options: any
    ) => {
      // 在切换事务完成 recheck、准备标记可重建数据时，模拟另一请求重试的
      // final-error task 已经由 worker 用旧模型完成：写入 indexed 并删除任务。
      if (
        !workerCompleted &&
        update?.$set?.indexStatus === DatasetDataIndexStatusEnum.rebuildIndexPending
      ) {
        workerCompleted = true;
        const workerSession = await connectionMongo.startSession();
        try {
          await workerSession.withTransaction(async () => {
            await MongoDatasetData.updateOne(
              { _id: data._id },
              {
                $set: {
                  indexStatus: DatasetDataIndexStatusEnum.indexed,
                  indexes: [
                    {
                      type: DatasetDataIndexTypeEnum.default,
                      dataId: 'old-model-vector',
                      text: 'failed data'
                    }
                  ]
                }
              },
              { session: workerSession }
            );
            await MongoDatasetTraining.deleteOne(
              { _id: errorTask._id },
              { session: workerSession }
            );
          });
        } finally {
          await workerSession.endSession();
        }
      }
      return originalUpdateMany(filter, update, options);
    }) as any);

    onTestFinished(() => {
      updateManySpy.mockRestore();
      mongoSessionRunMock.mockImplementation(runWithoutTransaction);
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.code).toBe(200);
    expect(workerCompleted).toBe(true);
    await expect(MongoDataset.findById(dataset._id).lean()).resolves.toMatchObject({
      vectorModelId: visionEmbeddingModel.modelId
    });
    const switchedData = await MongoDatasetData.findById(data._id).lean();
    expect([
      DatasetDataIndexStatusEnum.rebuildIndexPending,
      DatasetDataIndexStatusEnum.rebuildIndexRunning
    ]).toContain(switchedData?.indexStatus);
    // 旧模型的 indexed 结果必须进入新的重建任务，不能成为无后续任务的终态。
    await expect(MongoDatasetTraining.exists({ _id: errorTask._id })).resolves.toBeFalsy();
    await expect(
      MongoDatasetTraining.countDocuments({
        datasetId: dataset._id,
        dataId: data._id,
        mode: TrainingModeEnum.rebuildIndex
      })
    ).resolves.toBe(1);
  });

  it('rejects switching while a paused index task can still resume', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'paused content',
      indexes: [],
      indexStatus: 'indexing'
    });
    const pausedTask = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'paused-bill',
      mode: TrainingModeEnum.index,
      dataId: data._id,
      retryCount: 3,
      lockTime: new Date('2050-01-01'),
      q: 'paused content',
      errorMsg: 'AI points not enough'
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.code).toBe(500);
    expect(String(res.error)).toContain('暂停或可恢复的训练任务');
    await expect(MongoDatasetTraining.exists({ _id: pausedTask._id })).resolves.toBeTruthy();
    await expect(MongoDataset.findById(dataset._id).lean()).resolves.toMatchObject({
      vectorModelId: textOnlyEmbeddingModel.modelId
    });
  });

  it('rejects switching while a paused enhancement task exists', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'paused auto content',
      indexes: [],
      indexStatus: 'indexing'
    });
    await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'auto-bill',
      mode: TrainingModeEnum.auto,
      dataId: data._id,
      retryCount: 3,
      lockTime: new Date('2050-01-01'),
      q: 'paused auto content',
      errorMsg: 'AI points not enough'
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.code).toBe(500);
    expect(String(res.error)).toContain('暂停或可恢复的训练任务');
  });

  it('rejects switching while a failed enhancement task exists', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'parse-bill',
      mode: TrainingModeEnum.parse,
      retryCount: 0,
      lockTime: new Date(),
      errorMsg: 'parse failed'
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.code).toBe(500);
    expect(String(res.error)).toContain('未完成的解析或增强任务');
  });

  it('rejects switching while data is still indexing', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'indexing content',
      indexes: [],
      indexStatus: 'indexing'
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.code).toBe(500);
    expect(String(res.error)).toContain('未完成的索引数据');
  });

  it('deletes stale final-error index tasks for indexed data', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'indexed content',
      indexes: [{ type: 'default', text: 'indexed content', dataId: 'vec-1' }],
      indexStatus: 'indexed'
    });
    await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'stale-bill',
      mode: TrainingModeEnum.index,
      dataId: data._id,
      retryCount: 0,
      lockTime: new Date(),
      errorMsg: 'stale failure',
      q: 'indexed content',
      indexes: []
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.code).toBe(200);
    // 残留 index 任务不能保留，否则用户手动重试会与新的 rebuildIndex 双写同一 data
    await expect(
      MongoDatasetTraining.countDocuments({
        dataId: data._id,
        mode: TrainingModeEnum.index
      })
    ).resolves.toBe(0);
    await expect(
      MongoDatasetTraining.countDocuments({
        dataId: data._id,
        mode: TrainingModeEnum.rebuildIndex
      })
    ).resolves.toBeGreaterThan(0);
  });

  it('keeps the failed task payload when empty content cannot be re-queued', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: '',
      indexes: [],
      indexStatus: 'error',
      indexErrorMsg: '404 old model does not exist'
    });
    // 用户清空 q/a，但 custom 草稿只保存在旧任务里；队列过滤后不能删掉唯一输入副本。
    const failedTask = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'empty-bill',
      mode: TrainingModeEnum.index,
      dataId: data._id,
      retryCount: 0,
      lockTime: new Date(),
      q: '',
      a: '',
      indexes: [{ type: 'custom', text: 'custom draft', dataId: 'draft-1' }],
      errorMsg: '404 old model does not exist'
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.code).toBe(200);
    // 没有替代任务：data 回到 error，并保留原错误信息
    const dataAfter = await MongoDatasetData.findById(data._id).lean();
    expect(dataAfter?.indexStatus).toBe('error');
    expect(dataAfter?.indexErrorMsg).toBe('404 old model does not exist');
    // 旧任务及其完整输入保留，作为可编辑的重试入口
    const taskAfter = await MongoDatasetTraining.findById(failedTask._id).lean();
    expect(taskAfter).toEqual(
      expect.objectContaining({
        retryCount: 0,
        q: '',
        a: '',
        errorMsg: '404 old model does not exist'
      })
    );
    expect(taskAfter?.indexes).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'custom draft' })])
    );
    await expect(
      MongoDatasetTraining.countDocuments({
        datasetId: dataset._id,
        dataId: data._id,
        mode: TrainingModeEnum.index
      })
    ).resolves.toBe(1);
  });

  it('should reject model rebuilding while an active training task exists', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'bill',
      mode: TrainingModeEnum.index,
      retryCount: 3,
      lockTime: new Date('2000-01-01')
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });

    expect(res.code).toBe(500);
    expect(String(res.error)).toContain('正在训练或者重建中');
  });

  it('rolls back the model switch when seed creation fails', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'original',
      indexes: []
    });
    const mongoSessionRunMock = vi.mocked(mongoSessionRun);
    const runWithoutTransaction = mongoSessionRunMock.getMockImplementation();
    if (!runWithoutTransaction) throw new Error('mongoSessionRun mock is not initialized');

    mongoSessionRunMock
      // createTrainingUsage 会先占用一次调用，后续重建事务使用真实 session。
      .mockImplementationOnce(runWithoutTransaction)
      .mockImplementation(async (fn) => {
        const session = await connectionMongo.startSession();
        try {
          return await session.withTransaction(() => fn(session));
        } finally {
          await session.endSession();
        }
      });
    const createTrainingSpy = vi
      .spyOn(MongoDatasetTraining, 'create')
      .mockRejectedValue(new Error('training insert failed'));

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });
    createTrainingSpy.mockRestore();
    mongoSessionRunMock.mockImplementation(runWithoutTransaction);

    // seed 与待重建标记同事务：seed 失败时整个切换回滚
    expect(res.code).toBe(500);
    await expect(MongoDataset.findById(dataset._id).lean()).resolves.toMatchObject({
      vectorModelId: textOnlyEmbeddingModel.modelId
    });
    await expect(MongoDatasetData.findById(data._id).lean()).resolves.not.toHaveProperty(
      'indexStatus'
    );
    await expect(MongoDatasetTraining.countDocuments({ datasetId: dataset._id })).resolves.toBe(0);
  });

  it('should reject rebuilding with an unauthorized team vector model', async () => {
    const { root, dataset } = await createDatasetContext();
    const unauthorizedTeamEmbedding: EmbeddingModelDataType = {
      ...visionEmbeddingModel,
      modelId: '507f1f77bcf86cd799439099',
      model: 'unauthorized-embedding',
      name: 'unauthorized-embedding',
      scope: ModelScopeEnum.team,
      teamId: '507f1f77bcf86cd799439088',
      tmbId: '507f1f77bcf86cd799439077'
    };
    addModelTestModel(unauthorizedTeamEmbedding);

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: unauthorizedTeamEmbedding.modelId
      }
    });

    expect(res.error).toBeDefined();
    expect(res.code).toBe(500);
  });
});

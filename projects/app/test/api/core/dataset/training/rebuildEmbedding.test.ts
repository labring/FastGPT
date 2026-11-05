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
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
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

  it('rebuilds first-index failed data with the new model and clears old failure records', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const failedData = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      // 图片导入预落库 q 为空，正文只在 imageParse 成功后的 training.q
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
    // 欠费暂停的普通 index 任务：data 仍为 indexing，换模型不能删掉它的重试入口
    const pausedData = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'paused content',
      indexes: [],
      indexStatus: 'indexing'
    });
    await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'paused-bill',
      mode: TrainingModeEnum.index,
      dataId: pausedData._id,
      retryCount: 1,
      lockTime: new Date('2050-01-01'),
      errorMsg: 'AI points not enough'
    });
    // 失败后用户修正过正文：换模型必须保留 data 的内容，不能被旧任务的 q 覆盖
    const editedData = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'user edited content',
      indexes: [],
      indexStatus: 'error',
      indexErrorMsg: '404 old model does not exist'
    });
    await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'edited-bill',
      mode: TrainingModeEnum.index,
      dataId: editedData._id,
      retryCount: 0,
      lockTime: new Date(),
      errorMsg: '404 old model does not exist',
      q: 'stale task content'
    });
    await MongoDatasetTraining.create({
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
    // 解析失败与 embedding 无关，切换模型不能清掉
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

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    // 首次索引失败的数据按新模型重新走首次索引，错误信息被清空
    const failedAfter = await MongoDatasetData.findById(failedData._id).lean();
    expect(failedAfter?.indexStatus).toBe('indexing');
    expect(failedAfter?.indexErrorMsg).toBeUndefined();
    const failedTask = await MongoDatasetTraining.findOne({
      dataId: failedData._id,
      mode: TrainingModeEnum.index
    }).lean();
    expect(failedTask).toEqual(expect.objectContaining({ retryCount: 3 }));
    // 失败任务里的索引草稿与图片描述必须恢复，不能被 deleteMany 静默丢弃
    expect(failedTask?.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'custom', text: 'user custom index' }),
        expect.objectContaining({ type: 'summary', text: 'draft summary' })
      ])
    );
    expect(failedTask?.imageDescMap).toEqual({ 'dataset/team/a.png': '图片描述' });
    // imageParse 生成的正文只存在旧 training.q，必须恢复到新任务
    expect(failedTask?.q).toBe('OCR parsed text');
    expect(failedTask?.indexSize).toBe(768);
    // 失败后 data 上的用户修正优先于旧任务正文
    const editedTask = await MongoDatasetTraining.findOne({
      dataId: editedData._id,
      mode: TrainingModeEnum.index
    }).lean();
    expect(editedTask?.q).toBe('user edited content');

    // 欠费暂停任务和对应 data 必须保留，否则数据既无索引也无重试入口
    const pausedAfter = await MongoDatasetData.findById(pausedData._id).lean();
    expect(pausedAfter?.indexStatus).toBe('indexing');
    await expect(
      MongoDatasetTraining.countDocuments({
        dataId: pausedData._id,
        mode: TrainingModeEnum.index,
        errorMsg: 'AI points not enough'
      })
    ).resolves.toBe(1);

    // 已成功索引的数据仍走 rebuildIndex（seed 后可能已被领取为 running）
    const indexedAfter = await MongoDatasetData.findById(indexedData._id).lean();
    expect(['rebuildIndexPending', 'rebuildIndexRunning']).toContain(indexedAfter?.indexStatus);
    await expect(
      MongoDatasetTraining.countDocuments({
        dataId: indexedData._id,
        mode: TrainingModeEnum.rebuildIndex
      })
    ).resolves.toBeGreaterThan(0);

    // 旧模型的最终失败详情与重试入口被清空
    await expect(
      MongoDatasetTraining.countDocuments({
        datasetId: dataset._id,
        errorMsg: '404 old model does not exist'
      })
    ).resolves.toBe(0);
    // 解析失败与 embedding 切换无关，保留失败详情与重试入口
    await expect(
      MongoDatasetTraining.countDocuments({
        datasetId: dataset._id,
        errorMsg: 'parse failed'
      })
    ).resolves.toBe(1);
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
    expect(String(res.error)).toContain('同义词重建未完成');
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

  it('should keep the committed model switch and rebuild markers when seed creation fails', async () => {
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

    expect(res.code).toBe(200);
    await expect(MongoDataset.findById(dataset._id).lean()).resolves.toMatchObject({
      vectorModelId: visionEmbeddingModel.modelId
    });
    await expect(MongoDatasetData.findById(data._id).lean()).resolves.toMatchObject({
      indexStatus: 'rebuildIndexPending'
    });
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

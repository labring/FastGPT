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
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import {
  getEmbeddingModelData,
  getLLMModelData,
  getVlmModelData
} from '@fastgpt/service/core/ai/model';
import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

let testRoot: Awaited<ReturnType<typeof getRootUser>>;
let visionEmbeddingModel: EmbeddingSystemModelDataType;
let textOnlyEmbeddingModel: EmbeddingSystemModelDataType;
let datasetVlmModel: LLMSystemModelDataType;
let agentModel: LLMSystemModelDataType;

const createDatasetContext = async ({
  currentVectorModel = textOnlyEmbeddingModel,
  vlmModel
}: {
  currentVectorModel?: EmbeddingSystemModelDataType;
  vlmModel?: LLMSystemModelDataType;
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
    agentModel = global.systemDefaultModel.llm;
    const defaultEmbeddingModel = global.systemDefaultModel.embedding;
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
      global.systemModelMap.set(`id:${model.modelId}`, model);
      global.systemModelMap.set(`model:${model.model}`, model);
    });

    // 全局测试环境会固定 mock embedding 模型；本组用例需要验证按 ID 切换后的真实能力。
    vi.mocked(getEmbeddingModelData).mockImplementation(({ modelId, model }) => {
      const modelData = global.systemModelMap.get(modelId ? `id:${modelId}` : `model:${model}`) as
        | EmbeddingSystemModelDataType
        | undefined;
      if (!modelData) throw new Error('模型不存在');
      return modelData;
    });
  });

  it('should keep image index and enqueue image mode when the new embedding model supports images', async () => {
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

    expect(getEmbeddingModelData({ modelId: visionEmbeddingModel.modelId })).toEqual(
      visionEmbeddingModel
    );
    expect(getLLMModelData({ modelId: agentModel.modelId })).toEqual(agentModel);

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
    expect(String(updatedDataset?.vectorModelId)).toBe(visionEmbeddingModel.modelId);
    expect(updatedCollection?.imageIndex).toBe(true);
    expect(training).toEqual(
      expect.objectContaining({
        mode: TrainingModeEnum.image,
        q: 'question with ![cat](dataset/team/cat.png)',
        retryCount: 50
      })
    );
    expect(training?.indexes).toEqual([
      expect.objectContaining({
        type: DatasetDataIndexTypeEnum.custom,
        text: 'manual index'
      })
    ]);
  });

  it('should disable image index and enqueue chunk mode when the new embedding model has no image capability', async () => {
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
        mode: TrainingModeEnum.chunk,
        retryCount: 50
      })
    );
    expect(training?.q).toBe('');
  });

  it('should enqueue imageParse mode with VLM model for image data when VLM is configured', async () => {
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

    expect(getVlmModelData({ modelId: datasetVlmModel.modelId })).toEqual(datasetVlmModel);

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
        mode: TrainingModeEnum.imageParse,
        imageId: 'dataset/team/main.png',
        retryCount: 50
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
      rebuilding: true
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
      rebuilding: true
    });
    await expect(MongoDatasetTraining.countDocuments({ datasetId: dataset._id })).resolves.toBe(0);
  });
});

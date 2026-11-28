import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import handler from '@/pages/api/core/dataset/training/rebuildEmbedding';
import { datasetTrainingMQService } from '@fastgpt/dal/redis/bullmq/services/datasetTraining';
import type {
  EmbeddingModelDataType,
  LLMModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  DatasetDataIndexStageEnum,
  DatasetDataIndexTypeEnum
} from '@fastgpt/global/core/dataset/data/constants';
import * as modelCatalogService from '@fastgpt/service/core/ai/model/catalog/service';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { UsageItemTypeEnum, UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { MongoUsageItem } from '@fastgpt/service/support/wallet/usage/usageItemSchema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { getRootUser } from '@test/datas/users';
import { addModelTestModel, getModelTestDefaults } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
vi.unmock('@fastgpt/service/core/ai/model/catalog/service');
vi.unmock('@fastgpt/service/support/user/audit/util');
vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));
vi.mock('@fastgpt/dal/redis/bullmq/services/datasetTraining', () => ({
  datasetTrainingMQService: {
    enqueue: vi.fn().mockResolvedValue({ id: 'document-job' }),
    enqueueBatch: vi.fn().mockResolvedValue([])
  }
}));

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
    vi.clearAllMocks();
    testRoot = await getRootUser();
    getSystemInstanceConfig().performance.dataset.vectorMaxProcess = 1;
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
    const pending = await MongoDatasetData.findById(data._id).lean();

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    // 目录只在鉴权时读取一次，审计必须复用快照，不能额外发起主库版本查询。
    expect(getTeamModelHandleSpy).toHaveBeenCalledTimes(1);
    expect(String(updatedDataset?.vectorModelId)).toBe(visionEmbeddingModel.modelId);
    expect(updatedCollection?.imageIndex).toBe(true);
    expect(updatedCollection?.training).toMatchObject({
      status: 'active',
      usageId: expect.any(String)
    });
    expect(pending).toMatchObject({
      indexStatus: DatasetDataIndexStageEnum.rebuildIndexPending,
      indexes: [
        { type: DatasetDataIndexTypeEnum.custom, text: 'manual index', dataId: 'manual_id' }
      ]
    });
    expect(await MongoDatasetTraining.countDocuments({ datasetId: dataset._id })).toBe(0);

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

    expect(res.code).toBe(200);
    expect(String(updatedDataset?.vectorModelId)).toBe(textOnlyEmbeddingModel.modelId);
    expect(updatedDataset?.chunkSettings?.imageIndex).toBe(false);
    expect(updatedCollection?.imageIndex).toBe(false);
    expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStageEnum.rebuildIndexPending
    });
    expect(await MongoDatasetTraining.countDocuments({ datasetId: dataset._id })).toBe(0);
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

    expect(res.code).toBe(200);
    expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStageEnum.rebuildIndexPending
    });
    expect(await MongoDatasetTraining.countDocuments({ datasetId: dataset._id })).toBe(0);
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
      indexStatus: DatasetDataIndexStageEnum.rebuildIndexPending
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

  it('keeps the committed model switch and rebuild markers when Redis publication fails', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'original',
      indexes: []
    });
    const publish = vi.mocked(datasetTrainingMQService.enqueueBatch);
    publish.mockRejectedValueOnce(new Error('Redis publication failed'));

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModelId: visionEmbeddingModel.modelId
      }
    });
    expect(res.code).toBe(200);
    expect(publish).toHaveBeenCalledWith([String(collection._id)]);
    await expect(MongoDataset.findById(dataset._id).lean()).resolves.toMatchObject({
      vectorModelId: visionEmbeddingModel.modelId
    });
    await expect(MongoDatasetData.findById(data._id).lean()).resolves.toMatchObject({
      indexStatus: DatasetDataIndexStageEnum.rebuildIndexPending
    });
    await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.toMatchObject({
      training: { status: 'active', usageId: expect.any(String) }
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

  it('starts a new billing round with the new vector model when the previous round is not yet closed', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const { usageId: previousUsageId } = await createTrainingUsage({
      teamId: root.teamId,
      tmbId: root.tmbId,
      appName: collection.name,
      billSource: UsageSourceEnum.training,
      trainingCollectionId: String(collection._id),
      vectorModelId: textOnlyEmbeddingModel.modelId
    });
    await collection.updateOne({
      $set: {
        training: {
          status: 'active',
          revision: 3,
          usageId: previousUsageId,
          runId: 'previous-run'
        }
      }
    });
    await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'already indexed chunk',
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
    const updatedCollection = await MongoDatasetCollection.findById(collection._id).lean();
    expect(updatedCollection?.training).toEqual({
      status: 'active',
      revision: 4,
      usageId: expect.any(String)
    });
    const nextUsageId = updatedCollection?.training?.usageId;
    expect(nextUsageId).not.toBe(previousUsageId);

    const oldVectorItem = await MongoUsageItem.findOne({
      teamId: root.teamId,
      usageId: previousUsageId,
      itemType: UsageItemTypeEnum.training_vector
    }).lean();
    const newVectorItem = await MongoUsageItem.findOne({
      teamId: root.teamId,
      usageId: nextUsageId,
      itemType: UsageItemTypeEnum.training_vector
    }).lean();
    expect(String(oldVectorItem?.modelId)).toBe(textOnlyEmbeddingModel.modelId);
    expect(String(newVectorItem?.modelId)).toBe(visionEmbeddingModel.modelId);
  });
});

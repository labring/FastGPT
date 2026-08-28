import { beforeEach, describe, expect, it } from 'vitest';
import { getRebuildBaseIndexes } from '@/service/core/dataset/queues/generateVector';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import {
  DatasetCollectionTypeEnum,
  DatasetRebuildScopeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { seedDatasetRebuildTasks } from '@/service/core/dataset/queues/rebuild';

let visionEmbeddingModel: EmbeddingSystemModelDataType;
let vlmModel: LLMSystemModelDataType;

beforeEach(() => {
  const defaultEmbeddingModel = global.systemDefaultModel.embedding;
  const defaultLLMModel = global.systemDefaultModel.llm;
  visionEmbeddingModel = {
    ...defaultEmbeddingModel,
    modelId: '507f1f77bcf86cd799439021',
    model: 'vision-embedding',
    name: 'vision-embedding',
    config: {
      ...defaultEmbeddingModel.config,
      vision: true
    }
  };
  vlmModel = {
    ...defaultLLMModel,
    modelId: '507f1f77bcf86cd799439022',
    model: 'vlm-model',
    name: 'vlm-model',
    config: {
      ...defaultLLMModel.config,
      vision: true
    }
  };

  [visionEmbeddingModel, vlmModel].forEach((model) => {
    global.systemModelMap.set(`id:${model.modelId}`, model);
    global.systemModelMap.set(`model:${model.model}`, model);
  });
});

describe('generateVector image embedding helpers', () => {
  it('should drop system indexes and keep supported external image description indexes when rebuilding', () => {
    const result = getRebuildBaseIndexes({
      indexes: [
        { type: DatasetDataIndexTypeEnum.default, text: 'old default', dataId: 'default_id' },
        { type: DatasetDataIndexTypeEnum.custom, text: 'manual', dataId: 'manual_id' },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/main.png',
          dataId: 'main_vector_id'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/stale.png',
          dataId: 'stale_vector_id'
        },
        {
          type: DatasetDataIndexTypeEnum.image,
          text: 'image description',
          dataId: 'image_desc_id'
        }
      ],
      q: 'content ![markdown](dataset/team/markdown.png)',
      dataset: {
        vectorModelId: visionEmbeddingModel.modelId,
        vlmModelId: vlmModel.modelId
      },
      collection: {
        imageIndex: true
      },
      data: {
        imageId: 'dataset/team/main.png',
        indexes: []
      }
    } as any);

    expect(result).toEqual([
      { type: DatasetDataIndexTypeEnum.custom, text: 'manual', dataId: 'manual_id' },
      {
        type: DatasetDataIndexTypeEnum.image,
        text: 'image description',
        dataId: 'image_desc_id'
      }
    ]);
  });

  it('should drop VLM image description indexes when collection image index is disabled', () => {
    const result = getRebuildBaseIndexes({
      indexes: [
        { type: DatasetDataIndexTypeEnum.custom, text: 'manual', dataId: 'manual_id' },
        {
          type: DatasetDataIndexTypeEnum.image,
          text: 'image description',
          dataId: 'image_desc_id'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/main.png',
          dataId: 'main_vector_id'
        }
      ],
      dataset: {
        vectorModelId: visionEmbeddingModel.modelId,
        vlmModelId: vlmModel.modelId
      },
      collection: {
        imageIndex: false
      },
      data: {
        imageId: 'dataset/team/main.png',
        indexes: []
      }
    } as any);

    expect(result).toEqual([
      { type: DatasetDataIndexTypeEnum.custom, text: 'manual', dataId: 'manual_id' }
    ]);
  });
});

describe('dataset rebuild queue', () => {
  it('claims synonym rebuild data incrementally by target version', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const collection = await MongoDatasetCollection.create({
      teamId,
      tmbId,
      datasetId,
      name: 'Collection',
      type: DatasetCollectionTypeEnum.file
    });
    const dataList = await MongoDatasetData.create(
      Array.from({ length: 3 }, (_, index) => ({
        teamId,
        tmbId,
        datasetId,
        collectionId: collection._id,
        q: `data-${index}`,
        indexes: []
      }))
    );
    global.systemEnv = { ...global.systemEnv, vectorMaxProcess: 1 };

    const createdCount = await seedDatasetRebuildTasks({
      teamId: String(teamId),
      tmbId: String(tmbId),
      datasetId: String(datasetId),
      billId: 'bill-id',
      vectorModel: visionEmbeddingModel,
      rebuildScope: DatasetRebuildScopeEnum.text,
      synonymVersion: 2
    });

    expect(createdCount).toBe(2);
    await expect(
      MongoDatasetTraining.countDocuments({ datasetId, synonymVersion: 2 })
    ).resolves.toBe(2);
    await expect(
      MongoDatasetData.countDocuments({ datasetId, synonymRebuildingVersion: 2 })
    ).resolves.toBe(2);
    await expect(
      MongoDatasetData.countDocuments({
        _id: { $in: dataList.map((data) => data._id) },
        synonymRebuildingVersion: { $exists: false }
      })
    ).resolves.toBe(1);
  });

  it('skips orphan data without deleting it or consuming the bounded seed task slots', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const collectionId = new Types.ObjectId();
    const collection = await MongoDatasetCollection.create({
      _id: collectionId,
      teamId,
      tmbId,
      datasetId,
      name: 'Collection',
      type: DatasetCollectionTypeEnum.file
    });
    const orphanCollectionIds = [new Types.ObjectId(), new Types.ObjectId()];
    await MongoDatasetData.create(
      orphanCollectionIds.map((orphanCollectionId) => ({
        teamId,
        tmbId,
        datasetId,
        collectionId: orphanCollectionId,
        q: 'orphan',
        indexes: [],
        rebuilding: true
      }))
    );
    const validData = await MongoDatasetData.create({
      teamId,
      tmbId,
      datasetId,
      collectionId: collection._id,
      q: 'valid',
      indexes: [],
      rebuilding: true
    });
    global.systemEnv = { ...global.systemEnv, vectorMaxProcess: 1 };

    const createdCount = await seedDatasetRebuildTasks({
      teamId: String(teamId),
      tmbId: String(tmbId),
      datasetId: String(datasetId),
      billId: 'bill-id',
      vectorModel: visionEmbeddingModel
    });

    expect(createdCount).toBe(1);
    const training = await MongoDatasetTraining.findOne({ dataId: validData._id }).lean();
    expect(training).toMatchObject({
      mode: TrainingModeEnum.chunk,
      retryCount: 50
    });
    expect(training?.expireAt).toBeInstanceOf(Date);
    await expect(
      MongoDatasetData.countDocuments({ collectionId: { $in: orphanCollectionIds } })
    ).resolves.toBe(orphanCollectionIds.length);
  });

  it('creates chunk tasks only for a text-scoped rebuild', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const collection = await MongoDatasetCollection.create({
      teamId,
      tmbId,
      datasetId,
      name: 'Image collection',
      type: DatasetCollectionTypeEnum.file,
      imageIndex: true
    });
    const data = await MongoDatasetData.create({
      teamId,
      tmbId,
      datasetId,
      collectionId: collection._id,
      q: 'content ![markdown](dataset/team/markdown.png)',
      imageId: 'dataset/team/main.png',
      indexes: [],
      rebuilding: true
    });

    await seedDatasetRebuildTasks({
      teamId: String(teamId),
      tmbId: String(tmbId),
      datasetId: String(datasetId),
      billId: 'bill-id',
      vectorModel: visionEmbeddingModel,
      vlmModel,
      rebuildScope: DatasetRebuildScopeEnum.text
    });

    await expect(MongoDatasetTraining.findOne({ dataId: data._id }).lean()).resolves.toMatchObject({
      mode: TrainingModeEnum.chunk,
      rebuildScope: DatasetRebuildScopeEnum.text,
      q: '',
      indexes: []
    });
  });
});

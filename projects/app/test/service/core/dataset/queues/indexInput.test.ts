import { getModelTestDefaults, addModelTestModel } from '@test/modelCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as modelApi from '@fastgpt/service/core/ai/model/index';
import {
  getIndexTrainingBaseIndexes,
  getIndexTrainingUpdateInput
} from '@/service/core/dataset/queues/indexInput';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type {
  EmbeddingModelDataType,
  LLMModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { seedDatasetSynonymRebuildTasks } from '@/service/core/dataset/queues/rebuildSynonym';
import { MongoDatasetSynonym } from '@fastgpt/service/core/dataset/synonym/schema';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { seedDatasetRebuildTasks } from '@/service/core/dataset/queues/rebuild';
import { serviceEnv } from '@fastgpt/service/env';

/** 同义词入口完成配置和待重建状态初始化，领取测试仅关注事务入队行为。 */
const seedSynonymFixture = async (
  context: Parameters<typeof seedDatasetSynonymRebuildTasks>[0]
) => {
  if (serviceEnv.DATASET_SYNONYM_ENABLED) {
    await MongoDatasetSynonym.create({
      teamId: context.teamId,
      datasetId: context.datasetId,
      version: 2,
      enabled: true
    });
    await MongoDatasetData.updateMany(
      {
        datasetId: context.datasetId,
        $or: [{ indexStatus: 'indexed' }, { indexStatus: { $exists: false } }]
      },
      { $set: { indexStatus: DatasetDataIndexStatusEnum.rebuildSynonymPending } }
    );
  }
  return seedDatasetSynonymRebuildTasks(context);
};

let visionEmbeddingModel: EmbeddingModelDataType;
let vlmModel: LLMModelDataType;
const teamId = '68ad85a7463006c963799a06';

beforeEach(() => {
  Object.assign(serviceEnv, { DATASET_SYNONYM_ENABLED: true });
  const defaultEmbeddingModel = getModelTestDefaults().embedding!;
  const defaultLLMModel = getModelTestDefaults().llm!;
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
    addModelTestModel(model);
  });
});

describe('index training image embedding helpers', () => {
  it('propagates unexpected VLM lookup failures', async () => {
    const modelHandle = await modelApi.getTeamModelHandle({ teamId });
    const lookup = vi.spyOn(modelApi, 'getTeamModelHandle').mockResolvedValue({
      ...modelHandle,
      getVlmModelData: () => {
        throw new Error('unexpected catalog failure');
      }
    });
    try {
      await expect(
        getIndexTrainingBaseIndexes({
          teamId,
          indexes: [{ type: DatasetDataIndexTypeEnum.image, text: 'description' }],
          dataset: { vlmModelId: vlmModel.modelId },
          collection: { imageIndex: true }
        } as any)
      ).rejects.toThrow('unexpected catalog failure');
    } finally {
      lookup.mockRestore();
    }
  });

  it.each([false, true])(
    'keeps text indexes with an unavailable VLM and imageIndex=%s',
    async (imageIndex) => {
      const result = await getIndexTrainingBaseIndexes({
        teamId,
        indexes: [
          { type: DatasetDataIndexTypeEnum.default, text: 'system' },
          { type: DatasetDataIndexTypeEnum.custom, text: 'manual' }
        ],
        dataset: { vlmModelId: 'missing-vlm' },
        collection: { imageIndex }
      } as any);

      expect(result).toEqual([{ type: DatasetDataIndexTypeEnum.custom, text: 'manual' }]);
    }
  );

  it.each([false, true])(
    'drops old image descriptions with an unavailable VLM and imageIndex=%s',
    async (imageIndex) => {
      const result = await getIndexTrainingBaseIndexes({
        teamId,
        indexes: [
          { type: DatasetDataIndexTypeEnum.image, text: 'old description' },
          { type: DatasetDataIndexTypeEnum.custom, text: 'manual' }
        ],
        dataset: { vlmModelId: 'missing-vlm' },
        collection: { imageIndex }
      } as any);

      expect(result).toEqual([{ type: DatasetDataIndexTypeEnum.custom, text: 'manual' }]);
    }
  );

  it('should drop system indexes and keep supported external image description indexes when rebuilding', async () => {
    const result = await getIndexTrainingBaseIndexes({
      teamId,
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

  it('should drop VLM image description indexes when collection image index is disabled', async () => {
    const result = await getIndexTrainingBaseIndexes({
      teamId,
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

  it('uses a newly generated pure-image description without requiring imageDescMap', async () => {
    const result = await getIndexTrainingUpdateInput({
      teamId,
      q: 'new VLM description',
      indexes: [],
      dataset: {
        vectorModelId: visionEmbeddingModel.modelId,
        vlmModelId: vlmModel.modelId
      },
      collection: { imageIndex: true },
      data: {
        _id: new Types.ObjectId(),
        q: 'old database description',
        imageId: 'dataset/team/main.png',
        indexes: []
      }
    } as any);

    expect(result).toMatchObject({
      q: 'new VLM description',
      imageId: 'dataset/team/main.png',
      indexes: []
    });
  });

  it('keeps image, question and summary indexes generated by the current rebuild', async () => {
    const generatedIndexes = [
      { type: DatasetDataIndexTypeEnum.image, text: 'new image description' },
      { type: DatasetDataIndexTypeEnum.question, text: 'new generated question' },
      { type: DatasetDataIndexTypeEnum.summary, text: 'new generated summary' }
    ];
    const result = await getIndexTrainingUpdateInput({
      teamId,
      q: 'content',
      indexes: generatedIndexes,
      dataset: {
        vectorModelId: visionEmbeddingModel.modelId,
        vlmModelId: vlmModel.modelId
      },
      collection: { imageIndex: true },
      data: {
        _id: new Types.ObjectId(),
        q: 'content',
        indexes: [
          {
            type: DatasetDataIndexTypeEnum.custom,
            text: 'database index',
            dataId: 'database_id'
          }
        ]
      }
    } as any);

    expect(result).toMatchObject({ indexes: generatedIndexes });
  });
});

describe('getIndexTrainingUpdateInput answer preservation', () => {
  it.each([
    { trainingAnswer: undefined, dataAnswer: 'stored answer', expected: '' },
    { trainingAnswer: '', dataAnswer: 'stored answer', expected: '' },
    { trainingAnswer: 'edited answer', dataAnswer: 'stored answer', expected: 'edited answer' },
    { trainingAnswer: '', dataAnswer: '', expected: '' }
  ])('preserves the answer for %j', async ({ trainingAnswer, dataAnswer, expected }) => {
    // 首次训练直接使用 schema 实际值，空串不回退到预落库正文。
    const task = new MongoDatasetTraining({
      mode: TrainingModeEnum.index,
      ...(trainingAnswer !== undefined && { a: trainingAnswer })
    });
    const result = await getIndexTrainingUpdateInput({
      ...task.toObject(),
      teamId,
      dataset: {
        vectorModelId: visionEmbeddingModel.modelId,
        vlmModelId: vlmModel.modelId
      },
      collection: { name: 'collection', indexPrefixTitle: false, imageIndex: false },
      data: {
        _id: new Types.ObjectId().toString(),
        q: 'stored question',
        a: dataAnswer,
        indexes: []
      }
    });

    expect(result).toMatchObject({ q: '', a: expected });
  });
});

describe('dataset rebuild queue', () => {
  it('does not claim synonym rebuild data when the feature is disabled', async () => {
    Object.assign(serviceEnv, { DATASET_SYNONYM_ENABLED: false });
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
    const data = await MongoDatasetData.create({
      teamId,
      tmbId,
      datasetId,
      collectionId: collection._id,
      q: 'data',
      indexes: []
    });

    await expect(
      seedSynonymFixture({
        teamId: String(teamId),
        tmbId: String(tmbId),
        datasetId: String(datasetId),
        billId: 'bill-id'
      })
    ).resolves.toBe(0);
    await expect(MongoDatasetTraining.countDocuments({ datasetId })).resolves.toBe(0);
    await expect(MongoDatasetData.findById(data._id).lean()).resolves.not.toHaveProperty(
      'synonymRebuildingVersion'
    );
  });

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

    const createdCount = await seedSynonymFixture({
      teamId: String(teamId),
      tmbId: String(tmbId),
      datasetId: String(datasetId),
      billId: 'bill-id'
    });

    expect(createdCount).toBe(2);
    await expect(
      MongoDatasetTraining.countDocuments({ datasetId, mode: TrainingModeEnum.rebuildSynonym })
    ).resolves.toBe(2);
    const synonymTrainingList = await MongoDatasetTraining.find({
      datasetId,
      mode: TrainingModeEnum.rebuildSynonym
    }).lean();
    expect(synonymTrainingList.every((training) => training.expireAt === null)).toBe(true);
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
        indexStatus: 'rebuildIndexPending'
      }))
    );
    const validData = await MongoDatasetData.create({
      teamId,
      tmbId,
      datasetId,
      collectionId: collection._id,
      q: 'valid',
      indexes: [],
      indexStatus: 'rebuildIndexPending'
    });
    global.systemEnv = { ...global.systemEnv, vectorMaxProcess: 1 };

    const createdCount = await seedDatasetRebuildTasks({
      teamId: String(teamId),
      tmbId: String(tmbId),
      datasetId: String(datasetId),
      billId: 'bill-id'
    });

    expect(createdCount).toBe(1);
    const training = await MongoDatasetTraining.findOne({ dataId: validData._id }).lean();
    expect(training).toMatchObject({
      mode: TrainingModeEnum.rebuildIndex,
      retryCount: 3
    });
    expect(training?.expireAt).toBeInstanceOf(Date);
    await expect(
      MongoDatasetData.countDocuments({ collectionId: { $in: orphanCollectionIds } })
    ).resolves.toBe(orphanCollectionIds.length);
  });

  it('uses only rebuild mode for synonym rebuilds including images', async () => {
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
      indexStatus: 'indexed'
    });

    await seedSynonymFixture({
      teamId: String(teamId),
      tmbId: String(tmbId),
      datasetId: String(datasetId),
      billId: 'bill-id'
    });

    await expect(MongoDatasetTraining.findOne({ dataId: data._id }).lean()).resolves.toMatchObject({
      mode: TrainingModeEnum.rebuildSynonym,
      q: '',
      indexes: []
    });
  });
});

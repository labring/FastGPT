import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  DatasetSynonymMutationTypeEnum,
  DatasetSynonymSchemaVersion,
  type NormalizedSynonymMappingType
} from '@fastgpt/global/core/dataset/synonym';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { serviceEnv } from '@fastgpt/service/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const { mockAuthDataset, mockCreateTrainingUsage } = vi.hoisted(() => ({
  mockAuthDataset: vi.fn(),
  mockCreateTrainingUsage: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: mockAuthDataset
}));
vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createTrainingUsage: mockCreateTrainingUsage
}));
vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  isImageEmbeddingModel: (model?: { config?: { vision?: boolean } }) => !!model?.config?.vision,
  getSystemModelHandle: async () => ({
    getLLMModelData: () => ({
      modelId: '507f1f77bcf86cd799439023',
      name: 'Agent',
      model: 'agent-model',
      config: {}
    }),
    getEmbeddingModelData: () => ({
      modelId: '507f1f77bcf86cd799439021',
      name: 'Embedding',
      model: 'embedding',
      config: { maxToken: 8192 }
    }),
    getVlmModelData: () => ({
      modelId: '507f1f77bcf86cd799439022',
      name: 'VLM',
      model: 'vlm-model',
      config: { vision: true }
    })
  }),
  getTeamModelHandle: async () => ({
    getLLMModelData: () => ({
      modelId: '507f1f77bcf86cd799439023',
      name: 'Agent',
      model: 'agent-model',
      config: {}
    }),
    getEmbeddingModelData: () => ({
      modelId: '507f1f77bcf86cd799439021',
      name: 'Embedding',
      model: 'embedding',
      config: { maxToken: 8192 }
    }),
    getVlmModelData: () => ({
      modelId: '507f1f77bcf86cd799439022',
      name: 'VLM',
      model: 'vlm-model',
      config: { vision: true }
    })
  })
}));

import { createDatasetSynonymMutation } from '@/service/core/dataset/synonym/mutation';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { cleanupUnusedDatasetSynonymMappings } from '@fastgpt/service/core/dataset/synonym/controller';
import {
  getDatasetSynonymMatcher,
  invalidateDatasetSynonymMatcherCache
} from '@fastgpt/service/core/dataset/synonym/entity';

const teamId = new Types.ObjectId();
const tmbId = new Types.ObjectId();
const datasetId = new Types.ObjectId();
const collectionId = new Types.ObjectId();

const createMapping = (
  standardizedTerm = '退款',
  synonymTerm = '退钱'
): NormalizedSynonymMappingType => ({
  standardizedTerm,
  normalizedStandardizedTerm: standardizedTerm.toLowerCase(),
  synonymTerms: [synonymTerm],
  normalizedSynonymTerms: [synonymTerm.toLowerCase()],
  allTerms: `${standardizedTerm} ${synonymTerm}`,
  fingerprint: `${standardizedTerm}:${synonymTerm}`,
  sourceRows: [1]
});

describe('createDatasetSynonymMutation', () => {
  beforeEach(async () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    vi.clearAllMocks();
    invalidateDatasetSynonymMatcherCache({ teamId: String(teamId), datasetId: String(datasetId) });
    global.systemEnv = { ...global.systemEnv, vectorMaxProcess: 1 };
    mockAuthDataset.mockResolvedValue({
      teamId: String(teamId),
      tmbId: String(tmbId),
      dataset: { name: 'Dataset', vectorModel: 'embedding', vlmModel: 'vlm-model' }
    });
    mockCreateTrainingUsage.mockResolvedValue({ usageId: new Types.ObjectId() });
    await MongoDatasetCollection.create({
      _id: collectionId,
      teamId,
      tmbId,
      datasetId,
      name: 'Collection',
      type: DatasetCollectionTypeEnum.file
    });
  });

  it('marks the whole rebuild before seeding and leaves first-time indexing data alone', async () => {
    const datas = await MongoDatasetData.create(
      Array.from({ length: 7 }, (_, i) => ({
        teamId,
        tmbId,
        datasetId,
        collectionId,
        q: `original-${i}`,
        a: '',
        indexes: [],
        indexStatus:
          i === 6 ? DatasetDataIndexStatusEnum.indexing : DatasetDataIndexStatusEnum.indexed
      }))
    );
    const result = await createDatasetSynonymMutation({
      req: {} as never,
      datasetId: String(datasetId),
      mappings: [createMapping()],
      fileName: 'all.csv',
      size: 10,
      type: DatasetSynonymMutationTypeEnum.upload
    });
    expect(result.affectedDataCount).toBe(6);
    expect(
      await MongoDatasetData.countDocuments({
        datasetId,
        indexStatus: DatasetDataIndexStatusEnum.rebuildSynonymPending
      })
    ).toBe(4);
    expect(
      await MongoDatasetData.countDocuments({
        datasetId,
        indexStatus: DatasetDataIndexStatusEnum.rebuildSynonymRunning
      })
    ).toBe(2);
    const tasks = await MongoDatasetTraining.find({ datasetId }).lean();
    expect(tasks).toHaveLength(2);
    expect(
      tasks.every((task) => task.mode === TrainingModeEnum.rebuildSynonym && task.expireAt === null)
    ).toBe(true);
    expect(tasks.every((task) => !('synonymVersion' in task))).toBe(true);
    expect(await MongoDatasetData.findById(datas[6]._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexing,
      q: 'original-6',
      a: '',
      indexes: []
    });
  });

  it('atomically activates mappings and creates independent synonym rebuild tasks', async () => {
    const data = await MongoDatasetData.create({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: '不包含同义词的数据也参与全量重建',
      imageId: 'dataset/team/image.png',
      indexes: [
        {
          type: 'imageEmbedding',
          text: 'dataset/team/image.png',
          dataId: 'image_vector_id'
        }
      ]
    });

    const result = await createDatasetSynonymMutation({
      req: {} as never,
      datasetId: String(datasetId),
      mappings: [createMapping()],
      fileName: '../synonyms.csv',
      size: 10,
      type: DatasetSynonymMutationTypeEnum.upload
    });

    await expect(MongoDatasetSynonym.findOne({ datasetId }).lean()).resolves.toMatchObject({
      enabled: true,
      version: 1,
      fileName: 'synonyms.csv',
      schemaVersion: DatasetSynonymSchemaVersion
    });
    await expect(MongoDatasetSynonymMapping.findOne({ datasetId }).lean()).resolves.toMatchObject({
      fileVersion: 1
    });
    await expect(MongoDatasetTraining.findOne({ dataId: data._id }).lean()).resolves.toMatchObject({
      mode: TrainingModeEnum.rebuildSynonym,
      expireAt: null,
      q: '',
      a: '',
      indexes: [],
      retryCount: 3
    });
    expect(mockCreateTrainingUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        vectorModelId: '507f1f77bcf86cd799439021'
      })
    );
    expect(result.affectedDataCount).toBe(1);
  });

  it.each([true, false])(
    'retains the old snapshot only while data references it (hasData=%s)',
    async (hasData) => {
      const synonym = await MongoDatasetSynonym.create({
        teamId,
        datasetId,
        version: 1,
        enabled: true,
        schemaVersion: DatasetSynonymSchemaVersion
      });
      await MongoDatasetSynonymMapping.create({
        logicalMappingId: new Types.ObjectId(),
        teamId,
        datasetId,
        synonymFileId: synonym._id,
        fileVersion: 1,
        ...createMapping('旧标准词', '旧同义词')
      });
      if (hasData) {
        await MongoDatasetData.create({
          teamId,
          tmbId,
          datasetId,
          collectionId,
          q: '旧同义词',
          indexes: [],
          synonymVersion: 1
        });
      }

      const result = await createDatasetSynonymMutation({
        req: {} as never,
        datasetId: String(datasetId),
        mappings: [createMapping('新标准词', '新同义词')],
        fileName: 'new.csv',
        size: 20,
        expectedSynonymId: String(synonym._id),
        expectedFileVersion: 1,
        type: DatasetSynonymMutationTypeEnum.update
      });

      expect(result.fileVersion).toBe(2);
      await expect(MongoDatasetSynonymMapping.countDocuments({ datasetId })).resolves.toBe(
        hasData ? 2 : 1
      );
      await expect(
        MongoDatasetSynonymMapping.findOne({ datasetId, fileVersion: 2 }).lean()
      ).resolves.toMatchObject({
        fileVersion: 2,
        standardizedTerm: '新标准词'
      });
      const context = { teamId: String(teamId), datasetId: String(datasetId) };
      if (hasData) {
        // 失败数据也需要保留旧快照用于手动重试，不能按 training 是否为空回收。
        await MongoDatasetData.updateMany(
          { datasetId },
          { $set: { indexStatus: DatasetDataIndexStatusEnum.rebuildSynonymFailed } }
        );
        await cleanupUnusedDatasetSynonymMappings(context);
        expect((await getDatasetSynonymMatcher({ ...context, fileVersion: 1 })).hasMappings).toBe(
          true
        );
        await MongoDatasetData.updateMany(
          { datasetId },
          { $set: { synonymVersion: 2, indexStatus: DatasetDataIndexStatusEnum.indexed } }
        );
        await cleanupUnusedDatasetSynonymMappings(context);
        expect((await getDatasetSynonymMatcher({ ...context, fileVersion: 1 })).hasMappings).toBe(
          false
        );
        await expect(MongoDatasetSynonymMapping.countDocuments({ datasetId })).resolves.toBe(1);
      }
    }
  );

  it('disables the dictionary but keeps its snapshot until all data is rebuilt', async () => {
    const synonym = await MongoDatasetSynonym.create({
      teamId,
      datasetId,
      version: 1,
      enabled: true,
      schemaVersion: DatasetSynonymSchemaVersion
    });
    await MongoDatasetSynonymMapping.create({
      logicalMappingId: new Types.ObjectId(),
      teamId,
      datasetId,
      synonymFileId: synonym._id,
      fileVersion: 1,
      ...createMapping()
    });
    await MongoDatasetData.create({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: '退钱',
      indexes: [],
      synonymVersion: 1
    });

    await createDatasetSynonymMutation({
      req: {} as never,
      datasetId: String(datasetId),
      mappings: [],
      fileName: '',
      size: 0,
      expectedSynonymId: String(synonym._id),
      expectedFileVersion: 1,
      type: DatasetSynonymMutationTypeEnum.delete
    });

    await expect(MongoDatasetSynonym.findById(synonym._id).lean()).resolves.toMatchObject({
      enabled: false,
      version: 2
    });
    await expect(MongoDatasetSynonymMapping.countDocuments({ datasetId })).resolves.toBe(1);
    await MongoDatasetData.updateMany({ datasetId }, { $set: { synonymVersion: 2 } });
    await cleanupUnusedDatasetSynonymMappings({
      teamId: String(teamId),
      datasetId: String(datasetId)
    });
    await expect(MongoDatasetSynonymMapping.countDocuments({ datasetId })).resolves.toBe(0);
  });

  it('rejects updates while the existing rebuild queue is busy', async () => {
    const synonym = await MongoDatasetSynonym.create({
      teamId,
      datasetId,
      version: 1,
      enabled: true,
      schemaVersion: DatasetSynonymSchemaVersion
    });
    await MongoDatasetData.create({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: 'pending',
      indexes: [],
      indexStatus: 'rebuildIndexPending'
    });

    await expect(
      createDatasetSynonymMutation({
        req: {} as never,
        datasetId: String(datasetId),
        mappings: [],
        fileName: '',
        size: 0,
        expectedSynonymId: String(synonym._id),
        expectedFileVersion: 1,
        type: DatasetSynonymMutationTypeEnum.delete
      })
    ).rejects.toThrow('知识库正在训练或者重建中');
    expect(mockCreateTrainingUsage).not.toHaveBeenCalled();
  });

  it('rolls back mappings, config and data markers when the transaction fails', async () => {
    const data = await MongoDatasetData.create({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: 'original',
      indexes: []
    });
    const duplicateMappings = [createMapping(), createMapping()];

    await expect(
      createDatasetSynonymMutation({
        req: {} as never,
        datasetId: String(datasetId),
        mappings: duplicateMappings,
        fileName: 'synonyms.csv',
        size: 10,
        type: DatasetSynonymMutationTypeEnum.upload
      })
    ).rejects.toThrow();

    await expect(MongoDatasetSynonym.countDocuments({ datasetId })).resolves.toBe(0);
    await expect(MongoDatasetSynonymMapping.countDocuments({ datasetId })).resolves.toBe(0);
    await expect(MongoDatasetData.findById(data._id).lean()).resolves.not.toHaveProperty(
      'rebuilding'
    );
  });

  it('rolls back the matcher switch when the first rebuild seed cannot be created', async () => {
    const data = await MongoDatasetData.create({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: 'original',
      indexes: []
    });
    const createTrainingSpy = vi
      .spyOn(MongoDatasetTraining, 'create')
      .mockRejectedValue(new Error('training insert failed'));

    await expect(
      createDatasetSynonymMutation({
        req: {} as never,
        datasetId: String(datasetId),
        mappings: [createMapping()],
        fileName: 'synonyms.csv',
        size: 10,
        type: DatasetSynonymMutationTypeEnum.upload
      })
    ).rejects.toThrow('training insert failed');
    createTrainingSpy.mockRestore();

    await expect(MongoDatasetSynonym.countDocuments({ datasetId })).resolves.toBe(0);
    await expect(MongoDatasetSynonymMapping.countDocuments({ datasetId })).resolves.toBe(0);
    await expect(MongoDatasetTraining.countDocuments({ datasetId })).resolves.toBe(0);
    await expect(MongoDatasetData.findById(data._id).lean()).resolves.not.toHaveProperty(
      'synonymRebuildingVersion'
    );
  });

  it('allows only one concurrent upload to activate a mapping snapshot', async () => {
    const createMutation = (term: string) =>
      createDatasetSynonymMutation({
        req: {} as never,
        datasetId: String(datasetId),
        mappings: [createMapping(term, `${term}-alias`)],
        fileName: 'synonyms.csv',
        size: 10,
        type: DatasetSynonymMutationTypeEnum.upload
      });

    const results = await Promise.allSettled([createMutation('term-a'), createMutation('term-b')]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const config = await MongoDatasetSynonym.findOne({ datasetId }).lean();
    await expect(
      MongoDatasetSynonymMapping.countDocuments({
        datasetId,
        synonymFileId: config?._id,
        fileVersion: config?.version
      })
    ).resolves.toBe(1);
  });
});

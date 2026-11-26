import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
// 同义词开关已接管实例配置（94ae033d7）：assertDatasetSynonymEnabled → isDatasetSynonymEnabled
// 读快照叶子 ?? serviceEnv。本文件通过改写 serviceEnv.DATASET_SYNONYM_ENABLED 驱动，
// 预置"域存在、叶子缺省"种子快照走兜底分支。
(global as any).systemInstanceConfig = {
  site: {},
  auth: {},
  security: {},
  feature: {},
  commercial: {},
  resource: {},
  performance: {
    workflow: {},
    parse: {},
    dataset: {},
    chat: {},
    streamResume: {},
    tracking: {},
    task: {},
    channel: {}
  },
  storage: {},
  vector: {},
  providers: {
    documentParse: { customPdf: {}, sangfor: {} },
    dataSource: {},
    externalProviderWorkflowVariables: []
  },
  subservice: {
    plugin: {},
    codeSandbox: {},
    aiProxy: {},
    mcp: {},
    agentSandbox: { provider: '', common: {}, sealosdevbox: {}, opensandbox: {}, proxy: {} }
  }
};

import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  DatasetSynonymMutationTypeEnum,
  DatasetSynonymSchemaVersion,
  type NormalizedSynonymMappingType
} from '@fastgpt/global/core/dataset/synonym';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import { MongoDatasetQaTraining } from '@test/datas/datasetQaTraining';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { serviceEnv } from '@fastgpt/service/env';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const { mockAuthDataset, mockCreateTrainingUsages, mockEnqueue } = vi.hoisted(() => ({
  mockAuthDataset: vi.fn(),
  mockCreateTrainingUsages: vi.fn(),
  mockEnqueue: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: mockAuthDataset
}));
vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createTrainingUsages: mockCreateTrainingUsages
}));
vi.mock('@fastgpt/service/core/dataset/training/runtime', () => ({
  enqueueDatasetTrainingBatch: mockEnqueue
}));
vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => {
  const getModelData = (_ref: unknown, options?: { type?: string; vision?: boolean }) => {
    if (options?.vision) {
      return {
        modelId: '507f1f77bcf86cd799439022',
        name: 'VLM',
        model: 'vlm-model',
        config: { vision: true }
      };
    }
    if (options?.type === 'embedding') {
      return {
        modelId: '507f1f77bcf86cd799439021',
        name: 'Embedding',
        model: 'embedding',
        config: { maxToken: 8192 }
      };
    }
    return {
      modelId: '507f1f77bcf86cd799439023',
      name: 'Agent',
      model: 'agent-model',
      config: {}
    };
  };
  return {
    isImageEmbeddingModel: (model?: { config?: { vision?: boolean } }) => !!model?.config?.vision,
    getSystemModelHandle: async () => ({
      getModelData
    }),
    getTeamModelHandle: async () => ({
      getModelData
    })
  };
});

import { createDatasetSynonymMutation } from '@/service/core/dataset/synonym/mutation';
import {
  DatasetDataIndexStageEnum,
  DatasetDataIndexStatusEnum
} from '@fastgpt/global/core/dataset/data/constants';
import { cleanupUnusedDatasetSynonymMappings } from '@fastgpt/service/core/dataset/synonym/controller';
import {
  getDatasetSynonymMatcher,
  invalidateDatasetSynonymMatcherCache
} from '@fastgpt/service/core/dataset/synonym/entity';

const teamId = new Types.ObjectId();
const tmbId = new Types.ObjectId();
const datasetId = new Types.ObjectId();
const collectionId = new Types.ObjectId();
const trainingUsageId = String(new Types.ObjectId());

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
  beforeAll(async () => {
    // 该套件执行真实事务，先等相关集合和索引建完，避免首个事务与后台建索引争锁。
    await Promise.all([
      MongoDataset.init(),
      MongoDatasetCollection.init(),
      MongoDatasetData.init(),
      MongoDatasetQaTraining.init(),
      MongoDatasetTraining.init(),
      MongoDatasetSynonym.init(),
      MongoDatasetSynonymMapping.init()
    ]);
  });

  beforeEach(async () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    vi.clearAllMocks();
    invalidateDatasetSynonymMatcherCache({ teamId: String(teamId), datasetId: String(datasetId) });
    getSystemInstanceConfig().performance.dataset.vectorMaxProcess = 1;
    mockAuthDataset.mockResolvedValue({
      teamId: String(teamId),
      tmbId: String(tmbId),
      dataset: { name: 'Dataset', vectorModel: 'embedding', vlmModel: 'vlm-model' }
    });
    mockCreateTrainingUsages.mockReset();
    mockCreateTrainingUsages.mockResolvedValue([trainingUsageId]);
    await MongoDataset.create({
      _id: datasetId,
      teamId,
      tmbId,
      name: 'Dataset',
      vectorModel: 'embedding',
      agentModel: 'agent-model'
    });
    await MongoDatasetCollection.create({
      _id: collectionId,
      teamId,
      tmbId,
      datasetId,
      name: 'Collection',
      type: DatasetCollectionTypeEnum.file
    });
  });

  it('marks every indexed chunk for one document job and leaves first-time indexing alone', async () => {
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
        indexStatus: DatasetDataIndexStageEnum.rebuildSynonymPending
      })
    ).toBe(6);
    expect(await MongoDatasetTraining.countDocuments({ datasetId })).toBe(0);
    expect(mockEnqueue).toHaveBeenCalledOnce();
    expect(mockEnqueue).toHaveBeenCalledWith({
      teamId: String(teamId),
      collectionIds: [String(collectionId)]
    });
    expect(await MongoDatasetData.findById(datas[6]._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexing,
      q: 'original-6',
      a: '',
      indexes: []
    });
  });

  it('atomically activates mappings and opens a billed document rebuild', async () => {
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
    await expect(MongoDatasetData.findById(data._id).lean()).resolves.toMatchObject({
      indexStatus: DatasetDataIndexStageEnum.rebuildSynonymPending
    });
    await expect(MongoDatasetCollection.findById(collectionId).lean()).resolves.toMatchObject({
      training: { status: 'active', usageId: trainingUsageId }
    });
    expect(mockCreateTrainingUsages).toHaveBeenCalledWith(
      expect.objectContaining({
        vectorModelId: '507f1f77bcf86cd799439021',
        bills: [{ appName: 'Collection', trainingCollectionId: String(collectionId) }]
      }),
      expect.anything()
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
      version: 2,
      emptyVersions: [2]
    });
    await expect(MongoDatasetSynonymMapping.countDocuments({ datasetId })).resolves.toBe(1);
    await MongoDatasetData.updateMany({ datasetId }, { $set: { synonymVersion: 2 } });
    await cleanupUnusedDatasetSynonymMappings({
      teamId: String(teamId),
      datasetId: String(datasetId)
    });
    await expect(MongoDatasetSynonymMapping.countDocuments({ datasetId })).resolves.toBe(0);
    // 当前空版本仍被数据引用，必须保留，供下一次上传做差量比较。
    await expect(MongoDatasetSynonym.findById(synonym._id).lean()).resolves.toMatchObject({
      emptyVersions: [2]
    });
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
    expect(mockCreateTrainingUsages).not.toHaveBeenCalled();
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

  it('rolls back the matcher switch when document billing cannot be created', async () => {
    const data = await MongoDatasetData.create({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: 'original',
      indexes: []
    });
    mockCreateTrainingUsages.mockRejectedValueOnce(new Error('training billing failed'));

    await expect(
      createDatasetSynonymMutation({
        req: {} as never,
        datasetId: String(datasetId),
        mappings: [createMapping()],
        fileName: 'synonyms.csv',
        size: 10,
        type: DatasetSynonymMutationTypeEnum.upload
      })
    ).rejects.toThrow('training billing failed');

    await expect(MongoDatasetSynonym.countDocuments({ datasetId })).resolves.toBe(0);
    await expect(MongoDatasetSynonymMapping.countDocuments({ datasetId })).resolves.toBe(0);
    await expect(MongoDatasetTraining.countDocuments({ datasetId })).resolves.toBe(0);
    expect(mockEnqueue).not.toHaveBeenCalled();
    await expect(MongoDatasetData.findById(data._id).lean()).resolves.not.toHaveProperty(
      'indexStatus'
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

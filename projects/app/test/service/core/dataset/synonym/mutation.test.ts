import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  DatasetSynonymMutationTypeEnum,
  DatasetSynonymSchemaVersion,
  type NormalizedSynonymMappingType
} from '@fastgpt/global/core/dataset/synonym';
import {
  DatasetCollectionTypeEnum,
  DatasetRebuildScopeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import { serviceEnv } from '@fastgpt/service/env';

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
vi.mock('@fastgpt/service/core/dataset/model', () => ({
  getDatasetEmbeddingModel: () => ({
    modelId: '507f1f77bcf86cd799439021',
    name: 'Embedding',
    model: 'embedding',
    config: { maxToken: 8192 }
  })
}));

import { createDatasetSynonymMutation } from '@/service/core/dataset/synonym/mutation';

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

  it('atomically activates mappings and creates ordinary full rebuild tasks', async () => {
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
      mode: TrainingModeEnum.chunk,
      rebuildScope: DatasetRebuildScopeEnum.text,
      synonymVersion: 1,
      q: '',
      a: '',
      indexes: [],
      retryCount: 50
    });
    expect(mockCreateTrainingUsage).toHaveBeenCalledWith(
      expect.objectContaining({ vectorModelId: '507f1f77bcf86cd799439021' })
    );
    expect(mockCreateTrainingUsage).not.toHaveBeenCalledWith(
      expect.objectContaining({ vllmModelId: expect.anything() })
    );
    expect(result.affectedDataCount).toBe(1);
  });

  it('replaces the active snapshot and removes the old snapshot in the same transaction', async () => {
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
    await expect(MongoDatasetSynonymMapping.countDocuments({ datasetId })).resolves.toBe(1);
    await expect(MongoDatasetSynonymMapping.findOne({ datasetId }).lean()).resolves.toMatchObject({
      fileVersion: 2,
      standardizedTerm: '新标准词'
    });
  });

  it('disables mappings and uses the same full rebuild flow when deleting', async () => {
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
      rebuilding: true
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

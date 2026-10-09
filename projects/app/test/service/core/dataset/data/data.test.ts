import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba/index';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { retryFailedTrainingTasks } from '@fastgpt/service/core/dataset/training/service';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import { DatasetSynonymSchemaVersion } from '@fastgpt/global/core/dataset/synonym';
import {
  DatasetDataIndexStatusEnum,
  DatasetDataIndexTypeEnum
} from '@fastgpt/global/core/dataset/data/constants';
import {
  DatasetCollectionTypeEnum,
  DatasetTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import type {
  DatasetDataIndexItemType,
  DatasetDataItemType
} from '@fastgpt/global/core/dataset/type';
import { getRootUser } from '@test/datas/users';
import { createMockVectorsResponse, mockGetVectors } from '@test/mocks/core/ai/embedding';
import { mockVectorDelete, mockVectorInsert, resetVectorMocks } from '@test/mocks/common/vector';
import {
  createDatasetData,
  deleteDatasetData,
  updateDatasetDataByIndexes,
  rebuildDatasetDataIndexes,
  updateDatasetDataSystemIndexes
} from '@/service/core/dataset/data/data';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { serviceEnv } from '@fastgpt/service/env';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const originalDatasetSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;
const originalMultipleDataToBase64 = serviceEnv.MULTIPLE_DATA_TO_BASE64;

const { mockDeleteDatasetFileByKey, mockGetDatasetBase64Image, mockCountPromptTokens } = vi.hoisted(
  () => ({
    mockDeleteDatasetFileByKey: vi.fn(),
    mockGetDatasetBase64Image: vi.fn(
      async (imageUrl: string) => `data:image/png;base64,${imageUrl}`
    ),
    mockCountPromptTokens: vi.fn(async (text: string) => text.length)
  })
);

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: vi.fn(() => ({
    deleteDatasetFileByKey: mockDeleteDatasetFileByKey,
    getDatasetBase64Image: mockGetDatasetBase64Image
  }))
}));

vi.mock('@fastgpt/service/common/string/tiktoken', () => ({
  countPromptTokens: mockCountPromptTokens
}));

const embeddingModel = {
  modelId: '68ad85a7463006c963799a05',
  model: 'text-embedding-3-small',
  name: 'text-embedding-3-small',
  provider: 'openai',
  scope: 'system' as const,
  isActive: true,
  type: 'embedding',
  config: {
    defaultToken: 512,
    maxToken: 100,
    weight: 100
  }
} as any;
const visionEmbeddingModel = {
  ...embeddingModel,
  config: { ...embeddingModel.config, vision: true }
};

const createDatasetContext = async () => {
  const root = await getRootUser();
  const dataset = await MongoDataset.create({
    name: 'test dataset',
    teamId: root.teamId,
    tmbId: root.tmbId,
    type: DatasetTypeEnum.dataset,
    vectorModel: 'text-embedding-3-small',
    agentModel: 'gpt-4o-mini'
  });
  const collection = await MongoDatasetCollection.create({
    name: 'test collection',
    type: DatasetCollectionTypeEnum.file,
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id
  });

  return { root, dataset, collection };
};

const createMongoData = async ({
  q = 'old question',
  a = 'old answer',
  imageId,
  indexes,
  history
}: {
  q?: string;
  a?: string;
  imageId?: string;
  indexes?: DatasetDataIndexItemType[];
  history?: DatasetDataItemType['history'];
} = {}) => {
  const { root, dataset, collection } = await createDatasetContext();
  const data = await MongoDatasetData.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    collectionId: collection._id,
    q,
    a,
    imageId,
    history,
    indexes: indexes ?? [
      {
        type: DatasetDataIndexTypeEnum.custom,
        text: 'old custom index',
        dataId: 'custom_old'
      },
      {
        type: DatasetDataIndexTypeEnum.default,
        text: q,
        dataId: 'default_old'
      }
    ]
  });
  await MongoDatasetDataText.create({
    teamId: root.teamId,
    datasetId: dataset._id,
    collectionId: collection._id,
    dataId: data._id,
    fullTextToken: 'old token'
  });

  return { root, dataset, collection, data };
};

const toDataItem = (
  data: Awaited<ReturnType<typeof MongoDatasetData.create>>
): DatasetDataItemType =>
  ({
    id: String(data._id),
    teamId: String(data.teamId),
    tmbId: String(data.tmbId),
    datasetId: String(data.datasetId),
    collectionId: String(data.collectionId),
    q: data.q,
    a: data.a,
    imageId: data.imageId,
    chunkIndex: data.chunkIndex,
    updateTime: data.updateTime,
    history: data.history,
    indexes: data.indexes.map((index) => ({
      type: index.type,
      text: index.text,
      dataId: index.dataId
    }))
  }) as DatasetDataItemType;

describe('Dataset data service', () => {
  beforeEach(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    resetVectorMocks();
    mockGetVectors.mockClear();
    mockDeleteDatasetFileByKey.mockReset();
    mockGetDatasetBase64Image.mockClear();
    mockCountPromptTokens.mockClear();
    mockGetVectors.mockImplementation(async ({ inputs }) =>
      createMockVectorsResponse(inputs.map((input) => input.input))
    );
    mockVectorInsert.mockResolvedValue({
      insertIds: ['id_1', 'id_2', 'id_3', 'id_4', 'id_5', 'id_6']
    });
    mockVectorDelete.mockResolvedValue(undefined);
  });

  afterAll(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = originalDatasetSynonymEnabled;
  });

  describe('manual repair of failed data', () => {
    const cases = [
      {
        failed: DatasetDataIndexStatusEnum.error,
        running: DatasetDataIndexStatusEnum.indexing,
        mode: TrainingModeEnum.index
      },
      {
        failed: DatasetDataIndexStatusEnum.rebuildIndexFailed,
        running: DatasetDataIndexStatusEnum.rebuildIndexRunning,
        mode: TrainingModeEnum.rebuildIndex
      },
      {
        failed: DatasetDataIndexStatusEnum.rebuildSynonymFailed,
        running: DatasetDataIndexStatusEnum.rebuildSynonymRunning,
        mode: TrainingModeEnum.rebuildSynonym
      }
    ];
    /** 失败任务与旧向量同时保留，使用真实 Mongo 事务验证修复和重试的状态边界。 */
    const createFailedData = async (item: (typeof cases)[number]) => {
      const context = await createMongoData({ q: 'old question', a: 'old answer' });
      const { data, root, dataset, collection } = context;
      await MongoDatasetData.updateOne(
        { _id: data._id },
        {
          $set: {
            indexStatus: item.failed,
            indexErrorMsg: 'rebuild failed',
            synonymVersion: 1,
            synonymRebuildingVersion: 2
          }
        }
      );
      const training = await MongoDatasetTraining.create({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        dataId: data._id,
        billId: 'repair',
        mode: item.mode,
        retryCount: 0,
        errorMsg: 'rebuild failed',
        expireAt: null
      });
      return { ...context, training };
    };

    it.each(
      cases.flatMap((item) =>
        [true, false].flatMap((synonymEnabled) =>
          (['full', 'system'] as const).map((kind) => ({ ...item, synonymEnabled, kind }))
        )
      )
    )('fully repairs $failed on $kind save (synonym enabled: $synonymEnabled)', async (item) => {
      Object.assign(serviceEnv, { DATASET_SYNONYM_ENABLED: item.synonymEnabled });
      const { data, training, root, dataset } = await createFailedData(item);
      if (item.synonymEnabled) {
        await MongoDatasetSynonym.create({
          teamId: root.teamId,
          datasetId: dataset._id,
          version: 3,
          enabled: true,
          schemaVersion: DatasetSynonymSchemaVersion
        });
      }
      const props = { dataId: String(data._id), q: data.q, a: '', model: embeddingModel };
      await (item.kind === 'full'
        ? updateDatasetDataByIndexes({
            ...props,
            indexes: data.indexes.map(({ type, text, dataId }) => ({ type, text, dataId }))
          })
        : updateDatasetDataSystemIndexes(props));
      const repaired = await MongoDatasetData.findById(data._id).lean();
      expect(repaired).toMatchObject({
        q: 'old question',
        a: '',
        indexStatus: DatasetDataIndexStatusEnum.indexed,
        synonymVersion: item.synonymEnabled ? 3 : 0,
        indexes: [
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.custom,
            text: 'old custom index'
          }),
          expect.objectContaining({ type: DatasetDataIndexTypeEnum.default, text: 'old question' })
        ],
        history: [expect.objectContaining({ q: 'old question', a: 'old answer' })]
      });
      expect(repaired?.indexErrorMsg).toBeUndefined();
      expect(repaired?.synonymRebuildingVersion).toBeUndefined();
      expect(
        repaired?.indexes.every(({ dataId }) => !['custom_old', 'default_old'].includes(dataId))
      ).toBe(true);
      expect(mockGetVectors).toHaveBeenCalledWith(
        expect.objectContaining({
          inputs: [
            { type: 'text', input: 'old custom index' },
            { type: 'text', input: 'old question' }
          ]
        })
      );
      expect(mockVectorDelete).toHaveBeenCalledWith({
        teamId: data.teamId,
        idList: ['custom_old', 'default_old']
      });
      expect(await MongoDatasetTraining.findById(training._id)).toBeNull();
      expect(await MongoDatasetDataText.findOne({ dataId: data._id }).lean()).toMatchObject({
        fullTextToken: await jiebaSplit({ text: 'old question' })
      });
      // 已清理的失败任务不会再恢复旧答案或重新进入训练。
      await retryFailedTrainingTasks({ teamId: data.teamId, datasetId: data.datasetId });
      expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
        a: '',
        indexStatus: DatasetDataIndexStatusEnum.indexed
      });
    });

    it.each(['full', 'system'] as const)(
      'rolls back %s repair if task removal fails',
      async (kind) => {
        const { data, training } = await createFailedData(cases[0]);
        const deleteTaskSpy = vi
          .spyOn(MongoDatasetTraining, 'deleteMany')
          .mockRejectedValueOnce(new Error('task removal failed'));
        try {
          await expect(
            kind === 'full'
              ? updateDatasetDataByIndexes({
                  dataId: String(data._id),
                  indexes: [],
                  a: '',
                  model: embeddingModel
                })
              : updateDatasetDataSystemIndexes({
                  dataId: String(data._id),
                  a: '',
                  model: embeddingModel
                })
          ).rejects.toThrow('task removal failed');
          expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
            indexStatus: cases[0].failed,
            indexErrorMsg: 'rebuild failed',
            indexes: expect.arrayContaining([
              expect.objectContaining({ dataId: 'custom_old' }),
              expect.objectContaining({ dataId: 'default_old' })
            ])
          });
          expect(await MongoDatasetTraining.findById(training._id).lean()).toMatchObject({
            retryCount: 0
          });
          expect(mockVectorDelete).toHaveBeenCalledWith({
            teamId: data.teamId,
            idList: kind === 'full' ? ['id_1'] : ['id_1', 'id_2']
          });
        } finally {
          deleteTaskSpy.mockRestore();
        }
      }
    );

    it.each(
      cases.flatMap((item) => (['full', 'system'] as const).map((kind) => ({ ...item, kind })))
    )('rejects $kind save when $failed was already retried', async (item) => {
      const { data, training } = await createFailedData(item);
      await retryFailedTrainingTasks({ teamId: data.teamId, datasetId: data.datasetId });
      const props = {
        dataId: String(data._id),
        q: 'edited question',
        a: '',
        model: embeddingModel
      };
      await expect(
        item.kind === 'full'
          ? updateDatasetDataByIndexes({ ...props, indexes: [] })
          : updateDatasetDataSystemIndexes(props)
      ).rejects.toBe(DatasetErrEnum.dataNotIndexed);
      expect(mockGetVectors).not.toHaveBeenCalled();
      expect(mockVectorDelete).not.toHaveBeenCalled();
      expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
        q: 'old question',
        a: 'old answer',
        indexStatus: item.running
      });
      expect(await MongoDatasetTraining.findById(training._id).lean()).toMatchObject({
        retryCount: 3
      });
    });

    it.each(
      cases.flatMap((item) => (['full', 'system'] as const).map((kind) => ({ ...item, kind })))
    )('does not overwrite a concurrent retry of $failed during $kind repair', async (item) => {
      const { kind } = item;
      Object.assign(serviceEnv, { DATASET_SYNONYM_ENABLED: false });
      const { data, training } = await createFailedData(item);
      mockGetVectors.mockImplementationOnce(async ({ inputs }) => {
        await retryFailedTrainingTasks({ teamId: data.teamId, datasetId: data.datasetId });
        return createMockVectorsResponse(inputs.map((input) => input.input));
      });
      const props = {
        dataId: String(data._id),
        q: 'edited question',
        a: '',
        model: embeddingModel
      };
      const repair =
        kind === 'full'
          ? updateDatasetDataByIndexes({ ...props, indexes: [] })
          : updateDatasetDataSystemIndexes(props);
      await expect(repair).rejects.toThrow('数据已变化');
      expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
        indexStatus: item.running,
        q: 'old question'
      });
      expect(await MongoDatasetTraining.findById(training._id).lean()).toMatchObject({
        retryCount: 3
      });
      expect(mockVectorDelete).toHaveBeenCalledWith({
        teamId: data.teamId,
        idList: kind === 'full' ? ['id_1'] : ['id_1', 'id_2']
      });
    });
  });

  describe('createDatasetData', () => {
    it('does not persist synonym state when the feature is disabled', async () => {
      serviceEnv.DATASET_SYNONYM_ENABLED = false;
      const { root, dataset, collection } = await createDatasetContext();
      const findSynonymSpy = vi.spyOn(MongoDatasetSynonym, 'findOne');

      const { insertId } = await mongoSessionRun((session) =>
        createDatasetData({
          teamId: String(root.teamId),
          tmbId: String(root.tmbId),
          datasetId: String(dataset._id),
          collectionId: String(collection._id),
          q: 'plain text',
          embeddingModel,
          session
        })
      );

      const data = await MongoDatasetData.findById(insertId).lean();
      expect(data).not.toHaveProperty('synonymVersion');
      expect(findSynonymSpy).not.toHaveBeenCalled();
      findSynonymSpy.mockRestore();
    });

    it('should reuse the initial empty synonym snapshot and only query once per final validation', async () => {
      const { root, dataset, collection } = await createDatasetContext();
      const findSynonymSpy = vi.spyOn(MongoDatasetSynonym, 'findOne');

      for (const q of ['first chunk', 'second chunk']) {
        await mongoSessionRun((session) =>
          createDatasetData({
            teamId: String(root.teamId),
            tmbId: String(root.tmbId),
            datasetId: String(dataset._id),
            collectionId: String(collection._id),
            q,
            embeddingModel,
            session
          })
        );
      }

      expect(findSynonymSpy).toHaveBeenCalledTimes(3);
      findSynonymSpy.mockRestore();
    });

    it('should write transformed synonym text to embedding and Milvus full-text inputs', async () => {
      const { root, dataset, collection } = await createDatasetContext();
      const synonym = await MongoDatasetSynonym.create({
        teamId: root.teamId,
        datasetId: dataset._id,
        version: 1,
        enabled: true,
        schemaVersion: DatasetSynonymSchemaVersion
      });
      await MongoDatasetSynonymMapping.create({
        logicalMappingId: new Types.ObjectId(),
        teamId: root.teamId,
        datasetId: dataset._id,
        synonymFileId: synonym._id,
        fileVersion: 1,
        standardizedTerm: '退款',
        normalizedStandardizedTerm: '退款',
        synonymTerms: ['退钱'],
        normalizedSynonymTerms: ['退钱'],
        allTerms: '退款 退钱',
        fingerprint: 'refund'
      });

      await mongoSessionRun((session) =>
        createDatasetData({
          teamId: String(root.teamId),
          tmbId: String(root.tmbId),
          datasetId: String(dataset._id),
          collectionId: String(collection._id),
          q: '我要退钱',
          embeddingModel,
          session
        })
      );

      expect(mockGetVectors).toHaveBeenCalledWith(
        expect.objectContaining({
          inputs: expect.arrayContaining([{ type: 'text', input: '我要退款' }])
        })
      );
      expect(mockVectorInsert).toHaveBeenCalledWith(
        expect.objectContaining({ texts: expect.arrayContaining(['我要退款']) })
      );
    });

    it('should abort and clean new vectors when the synonym snapshot changes during embedding', async () => {
      const { root, dataset, collection } = await createDatasetContext();
      const synonym = await MongoDatasetSynonym.create({
        teamId: root.teamId,
        datasetId: dataset._id,
        version: 1,
        enabled: true,
        schemaVersion: DatasetSynonymSchemaVersion
      });
      mockGetVectors.mockImplementationOnce(async ({ inputs }) => {
        await MongoDatasetSynonym.updateOne({ _id: synonym._id }, { $set: { version: 2 } });
        return createMockVectorsResponse(inputs.map((input) => input.input));
      });

      await expect(
        mongoSessionRun((session) =>
          createDatasetData({
            teamId: String(root.teamId),
            tmbId: String(root.tmbId),
            datasetId: String(dataset._id),
            collectionId: String(collection._id),
            q: '退钱',
            embeddingModel,
            session
          })
        )
      ).rejects.toThrow('同义词配置已变化');

      await expect(MongoDatasetData.countDocuments({ datasetId: dataset._id })).resolves.toBe(0);
      expect(mockVectorDelete).toHaveBeenCalledWith({
        teamId: String(root.teamId),
        idList: ['id_1']
      });
    });

    it('should create data, full-text tokens, indexes and remove dataset image ttl', async () => {
      const { root, dataset, collection } = await createDatasetContext();
      const imageId = `dataset/${dataset._id}/image.png`;
      await MongoS3TTL.create({
        minioKey: imageId,
        bucketName: S3Buckets.private,
        expiredTime: new Date(Date.now() + 60_000)
      });

      const result = await mongoSessionRun((session) =>
        createDatasetData({
          teamId: String(root.teamId),
          tmbId: String(root.tmbId),
          datasetId: String(dataset._id),
          collectionId: String(collection._id),
          q: 'question',
          a: 'answer',
          imageId,
          imageDescMap: { [imageId]: 'image desc' },
          chunkIndex: 2,
          indexes: [
            {
              type: DatasetDataIndexTypeEnum.custom,
              text: 'manual index'
            }
          ],
          embeddingModel,
          indexSize: 50,
          indexPrefix: 'prefix',
          session
        })
      );

      const data = await MongoDatasetData.findById(result.insertId).lean();
      const dataText = await MongoDatasetDataText.findOne({ dataId: result.insertId }).lean();
      const ttl = await MongoS3TTL.findOne({ minioKey: imageId }).lean();

      expect(result.tokens).toBeGreaterThan(0);
      expect(data).toEqual(
        expect.objectContaining({
          q: 'question',
          a: 'answer',
          imageId,
          chunkIndex: 2,
          imageDescMap: { [imageId]: 'image desc' }
        })
      );
      expect(data?.indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.custom,
            text: 'manual index',
            dataId: 'id_1'
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.default,
            text: 'prefix\nquestion'
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.default,
            text: 'prefix\nanswer'
          })
        ])
      );
      expect(dataText?.fullTextToken).toContain('question');
      expect(dataText?.fullTextToken).toContain('answer');
      expect(ttl).toBeNull();
    });

    it('should not remove TTL when imageId belongs to another dataset', async () => {
      const { root, dataset, collection } = await createDatasetContext();
      const foreignImageId = 'dataset/507f1f77bcf86cd799439099/foreign.png';
      await MongoS3TTL.create({
        minioKey: foreignImageId,
        bucketName: S3Buckets.private,
        expiredTime: new Date(Date.now() + 60_000)
      });

      await mongoSessionRun((session) =>
        createDatasetData({
          teamId: String(root.teamId),
          tmbId: String(root.tmbId),
          datasetId: String(dataset._id),
          collectionId: String(collection._id),
          q: 'question',
          imageId: foreignImageId,
          embeddingModel,
          session
        })
      );

      const ttl = await MongoS3TTL.findOne({ minioKey: foreignImageId }).lean();
      expect(ttl).not.toBeNull();
    });

    it('should reject when required fields are missing', async () => {
      const { root, dataset, collection } = await createDatasetContext();

      await expect(
        mongoSessionRun((session) =>
          createDatasetData({
            teamId: String(root.teamId),
            tmbId: String(root.tmbId),
            datasetId: String(dataset._id),
            collectionId: String(collection._id),
            q: '',
            embeddingModel,
            session
          } as any)
        )
      ).rejects.toBe('q, datasetId, collectionId, embeddingModel is required');
    });

    it('should allow empty question text for image data without creating default text index', async () => {
      const { root, dataset, collection } = await createDatasetContext();
      const imageId = `dataset/${dataset._id}/黄芪.png`;
      const result = await mongoSessionRun((session) =>
        createDatasetData({
          teamId: String(root.teamId),
          tmbId: String(root.tmbId),
          datasetId: String(dataset._id),
          collectionId: String(collection._id),
          q: '',
          imageId,
          embeddingModel: visionEmbeddingModel,
          indexSize: 50,
          session
        })
      );

      const data = await MongoDatasetData.findById(result.insertId).lean();

      expect(data?.q).toBe('');
      expect(data?.indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: imageId
          })
        ])
      );
      expect(data?.indexes).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.default,
            text: ''
          })
        ])
      );
    });
  });

  describe('updateDatasetDataByIndexes', () => {
    beforeEach(() => {
      serviceEnv.MULTIPLE_DATA_TO_BASE64 = true;
    });
    afterEach(() => {
      serviceEnv.MULTIPLE_DATA_TO_BASE64 = originalMultipleDataToBase64;
    });

    it('updates data only after vector generation when the feature is disabled', async () => {
      serviceEnv.DATASET_SYNONYM_ENABLED = false;
      const { data } = await createMongoData();
      const saveSpy = vi.spyOn(MongoDatasetData.prototype, 'save');
      const concurrentUpdateTime = new Date(Date.now() + 60_000);
      mockGetVectors.mockImplementationOnce(async ({ inputs }) => {
        await MongoDatasetData.updateOne(
          { _id: data._id },
          { $set: { q: 'concurrent question', updateTime: concurrentUpdateTime } }
        );
        return createMockVectorsResponse(inputs.map((input) => input.input));
      });

      await expect(
        updateDatasetDataByIndexes({
          dataId: String(data._id),
          q: 'requested question',
          indexes: [{ type: DatasetDataIndexTypeEnum.custom, text: 'requested index' }],
          model: embeddingModel,
          forceRebuild: true
        })
      ).resolves.toEqual(expect.objectContaining({ tokens: expect.any(Number) }));

      const updatedData = await MongoDatasetData.findById(data._id).lean();
      expect(updatedData?.q).toBe('requested question');
      expect(updatedData?.updateTime.getTime()).toBeLessThan(concurrentUpdateTime.getTime());
      expect(saveSpy).not.toHaveBeenCalled();
      saveSpy.mockRestore();
    });

    it('should update q/a, replace full indexes, record history and delete stale vectors', async () => {
      const { data } = await createMongoData({
        q: 'old question',
        a: 'old answer',
        indexes: [
          {
            type: DatasetDataIndexTypeEnum.custom,
            text: 'old custom index',
            dataId: 'custom_old'
          },
          {
            type: DatasetDataIndexTypeEnum.default,
            text: 'old question',
            dataId: 'default_old'
          },
          {
            type: DatasetDataIndexTypeEnum.custom,
            text: 'remove me',
            dataId: 'remove_old'
          }
        ]
      });
      const oldUpdateTime = data.updateTime;

      const result = await updateDatasetDataByIndexes({
        dataId: String(data._id),
        q: 'new question',
        a: 'new answer',
        indexes: [
          {
            type: DatasetDataIndexTypeEnum.custom,
            text: 'new custom index'
          }
        ],
        model: embeddingModel,
        indexSize: 50
      });

      const updatedData = await MongoDatasetData.findById(data._id).lean();
      const updatedText = await MongoDatasetDataText.findOne({ dataId: data._id }).lean();
      const expectedFullTextToken = await jiebaSplit({ text: 'new question\nnew answer' });

      expect(result.tokens).toBeGreaterThan(0);
      expect(updatedData?.q).toBe('new question');
      expect(updatedData?.a).toBe('new answer');
      expect(updatedData?.history?.[0]).toEqual(
        expect.objectContaining({
          q: 'old question',
          a: 'old answer',
          updateTime: oldUpdateTime
        })
      );
      expect(updatedData?.indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.custom,
            text: 'new custom index',
            dataId: 'id_1'
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.default,
            text: 'new question'
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.default,
            text: 'new answer'
          })
        ])
      );
      expect(updatedData?.indexes).toHaveLength(3);
      expect(updatedText?.dataId.toString()).toBe(String(data._id));
      expect(updatedText?.fullTextToken).toBe(expectedFullTextToken);
      const deleteCall = mockVectorDelete.mock.calls[0]?.[0];
      expect(String(deleteCall?.teamId)).toBe(String(data.teamId));
      expect(deleteCall?.idList).toEqual(
        expect.arrayContaining(['custom_old', 'default_old', 'remove_old'])
      );
    });

    it('should rebuild vectors when forceRebuild is enabled even if index text is unchanged', async () => {
      const { data } = await createMongoData({
        q: 'same question',
        a: 'same answer',
        indexes: [
          {
            type: DatasetDataIndexTypeEnum.custom,
            text: 'same custom index',
            dataId: 'custom_old'
          },
          {
            type: DatasetDataIndexTypeEnum.default,
            text: 'same question',
            dataId: 'question_old'
          },
          {
            type: DatasetDataIndexTypeEnum.default,
            text: 'same answer',
            dataId: 'answer_old'
          }
        ]
      });

      const result = await updateDatasetDataByIndexes({
        dataId: String(data._id),
        q: 'same question',
        a: 'same answer',
        indexes: [
          {
            type: DatasetDataIndexTypeEnum.custom,
            text: 'same custom index',
            dataId: 'custom_old'
          }
        ],
        model: embeddingModel,
        indexSize: 50,
        forceRebuild: true
      });

      const updatedData = await MongoDatasetData.findById(data._id).lean();
      const deleteCall = mockVectorDelete.mock.calls[0]?.[0];

      expect(result.tokens).toBeGreaterThan(0);
      expect(mockVectorInsert).toHaveBeenCalledTimes(1);
      expect(updatedData?.indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.custom,
            text: 'same custom index',
            dataId: 'id_1'
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.default,
            text: 'same question',
            dataId: 'id_2'
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.default,
            text: 'same answer',
            dataId: 'id_3'
          })
        ])
      );
      expect(deleteCall?.idList).toEqual(
        expect.arrayContaining(['custom_old', 'question_old', 'answer_old'])
      );
    });

    it('should preserve concurrent edits and clean replacement vectors when rebuild CAS fails', async () => {
      const { root, dataset, data } = await createMongoData();
      await MongoDatasetSynonym.create({
        teamId: root.teamId,
        datasetId: dataset._id,
        version: 1,
        enabled: true,
        schemaVersion: DatasetSynonymSchemaVersion
      });
      mockGetVectors.mockImplementationOnce(async ({ inputs }) => {
        await MongoDatasetData.updateOne(
          { _id: data._id },
          { $set: { q: 'user edited question', updateTime: new Date(Date.now() + 10_000) } }
        );
        return createMockVectorsResponse(inputs.map((input) => input.input));
      });

      await expect(
        updateDatasetDataByIndexes({
          dataId: String(data._id),
          indexes: data.indexes,
          model: embeddingModel,
          forceRebuild: true
        })
      ).rejects.toThrow('数据已变化');

      await expect(MongoDatasetData.findById(data._id).lean()).resolves.toMatchObject({
        q: 'user edited question'
      });
      expect(mockVectorDelete).toHaveBeenCalledWith(
        expect.objectContaining({ idList: expect.arrayContaining(['id_1']) })
      );
    });

    it('should reject invalid update-by-indexes requests', async () => {
      const { data } = await createMongoData();

      await expect(
        updateDatasetDataByIndexes({
          dataId: String(data._id),
          q: 'question',
          indexes: undefined as any,
          model: embeddingModel
        })
      ).rejects.toBe('indexes is required');

      await expect(
        updateDatasetDataByIndexes({
          dataId: String(new Types.ObjectId()),
          q: 'question',
          indexes: [],
          model: embeddingModel
        })
      ).rejects.toBe('Data not found');
    });

    it('should rebuild image embedding indexes from data content when image index is enabled', async () => {
      const { root, dataset, collection } = await createDatasetContext();
      const mainImage = `dataset/${dataset._id}/main.png`;
      const oldMarkdownImage = `dataset/${dataset._id}/old.png`;
      const newMarkdownImage = `dataset/${dataset._id}/new.png`;
      const data = await MongoDatasetData.create({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        q: `old question ![old](${oldMarkdownImage})`,
        a: '',
        imageId: mainImage,
        indexes: [
          {
            type: DatasetDataIndexTypeEnum.custom,
            text: 'old custom index',
            dataId: 'custom_old'
          },
          {
            type: DatasetDataIndexTypeEnum.default,
            text: `old question ![old](${oldMarkdownImage})`,
            dataId: 'default_old'
          },
          {
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: mainImage,
            dataId: 'main_image_old'
          },
          {
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: oldMarkdownImage,
            dataId: 'old_markdown_image'
          }
        ]
      });
      await MongoDatasetDataText.create({
        teamId: root.teamId,
        datasetId: dataset._id,
        collectionId: collection._id,
        dataId: data._id,
        fullTextToken: 'old token'
      });

      await updateDatasetDataByIndexes({
        dataId: String(data._id),
        q: `new question ![new](${newMarkdownImage})`,
        a: '',
        imageId: mainImage,
        imageIndex: true,
        indexes: [
          {
            type: DatasetDataIndexTypeEnum.custom,
            text: 'new custom index'
          }
        ],
        model: visionEmbeddingModel,
        indexSize: 50
      });

      const updatedData = await MongoDatasetData.findById(data._id).lean();
      expect(updatedData?.indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.custom,
            text: 'new custom index'
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.default,
            text: `new question ![new](${newMarkdownImage})`
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: mainImage,
            dataId: 'main_image_old'
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: newMarkdownImage
          })
        ])
      );
      expect(
        updatedData?.indexes.find(
          (index) =>
            index.type === DatasetDataIndexTypeEnum.imageEmbedding &&
            index.text === oldMarkdownImage
        )
      ).toBeUndefined();
      expect(mockGetVectors).toHaveBeenCalledWith(
        expect.objectContaining({
          inputs: expect.arrayContaining([
            {
              type: 'image',
              input: `data:image/png;base64,${newMarkdownImage}`
            }
          ])
        })
      );
      expect(mockVectorDelete.mock.calls[0]?.[0].idList).toEqual(
        expect.arrayContaining(['custom_old', 'default_old', 'old_markdown_image'])
      );
    });
  });

  describe('rebuildDatasetDataIndexes', () => {
    it.each([true, false])('uses only the stored image index with vision=%s', async (vision) => {
      const previousBase64 = serviceEnv.MULTIPLE_DATA_TO_BASE64;
      Object.assign(serviceEnv, { MULTIPLE_DATA_TO_BASE64: false });
      try {
        const source = 'https://example.com/saved.png';
        const { data } = await createMongoData({
          q: '![other](https://example.com/body.png)',
          imageId: 'https://example.com/main.png',
          indexes: [
            { type: DatasetDataIndexTypeEnum.imageEmbedding, text: source, dataId: 'old_image' }
          ]
        });
        await rebuildDatasetDataIndexes({
          dataId: String(data._id),
          model: vision ? visionEmbeddingModel : embeddingModel
        });
        const updated = await MongoDatasetData.findById(data._id).lean();
        expect(updated?.q).toBe(data.q);
        expect(updated?.imageId).toBe(data.imageId);
        if (vision) {
          expect(updated?.indexes).toMatchObject([
            { type: DatasetDataIndexTypeEnum.imageEmbedding, text: source }
          ]);
          expect(
            mockGetVectors.mock.calls.flatMap(([props]) => props.inputs.map((input) => input.input))
          ).toEqual([source]);
        } else {
          expect(updated?.indexes).toEqual([]);
          expect(mockGetVectors).not.toHaveBeenCalled();
        }
        expect(
          (await MongoDatasetDataText.findOne({ dataId: data._id }).lean())?.fullTextToken
        ).toBe('');
      } finally {
        Object.assign(serviceEnv, { MULTIPLE_DATA_TO_BASE64: previousBase64 });
      }
    });

    it('uses only saved index text and keeps body, metadata and history unchanged', async () => {
      Object.assign(serviceEnv, { DATASET_SYNONYM_ENABLED: false });
      const storedIndexes = [
        { type: DatasetDataIndexTypeEnum.default, text: 'saved text', dataId: 'old_default' },
        { type: DatasetDataIndexTypeEnum.custom, text: 'saved custom', dataId: 'old_custom' }
      ];
      const { data } = await createMongoData({
        q: 'body is not an index',
        a: 'answer is not an index',
        indexes: storedIndexes,
        history: [{ q: 'previous', a: 'previous answer', updateTime: new Date(0) }]
      });
      await rebuildDatasetDataIndexes({ dataId: String(data._id), model: embeddingModel });
      const updated = await MongoDatasetData.findById(data._id).lean();
      expect(updated).toMatchObject({
        q: data.q,
        a: data.a,
        history: [{ q: 'previous', a: 'previous answer' }]
      });
      expect(updated!.indexes.map(({ type, text }) => ({ type, text }))).toEqual(
        storedIndexes.map(({ type, text }) => ({ type, text }))
      );
      expect(
        mockGetVectors.mock.calls.flatMap(([props]) => props.inputs.map((input) => input.input))
      ).toEqual(storedIndexes.map((index) => index.text));
      expect(mockCountPromptTokens).not.toHaveBeenCalled();
      const fullText = await MongoDatasetDataText.findOne({ dataId: data._id }).lean();
      expect(fullText?.fullTextToken).toBe(await jiebaSplit({ text: 'saved text\nsaved custom' }));
    });

    it('does not generate indexes from a body when the stored indexes are empty', async () => {
      const { data } = await createMongoData({ indexes: [] });
      const result = await rebuildDatasetDataIndexes({
        dataId: String(data._id),
        model: embeddingModel
      });
      expect(result.tokens).toBe(0);
      expect(mockGetVectors).not.toHaveBeenCalled();
      expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
        q: data.q,
        a: data.a,
        indexes: []
      });
    });

    it('preserves concurrent edits and cleans new vectors when the index snapshot changes', async () => {
      Object.assign(serviceEnv, { DATASET_SYNONYM_ENABLED: false });
      const { data } = await createMongoData();
      const replacement = [
        { type: DatasetDataIndexTypeEnum.custom, text: 'concurrent', dataId: 'concurrent_vector' }
      ];
      mockGetVectors.mockImplementationOnce(async ({ inputs }) => {
        await MongoDatasetData.updateOne(
          { _id: data._id },
          {
            $set: { indexes: replacement, updateTime: new Date(Date.now() + 10_000) }
          }
        );
        return createMockVectorsResponse(inputs.map((input) => input.input));
      });
      await expect(
        rebuildDatasetDataIndexes({ dataId: String(data._id), model: embeddingModel })
      ).rejects.toThrow('数据已变化');
      const updated = await MongoDatasetData.findById(data._id).lean();
      expect(updated?.indexes).toMatchObject(replacement);
      expect(mockVectorDelete).toHaveBeenCalledWith(
        expect.objectContaining({ idList: ['id_1', 'id_2'] })
      );
      expect(mockVectorDelete).not.toHaveBeenCalledWith(
        expect.objectContaining({ idList: ['custom_old', 'default_old'] })
      );
    });

    it('transforms saved index text for synonyms without changing its stored text', async () => {
      const { root, dataset, data } = await createMongoData({
        q: 'unrelated body',
        indexes: [{ type: DatasetDataIndexTypeEnum.custom, text: '退钱', dataId: 'old_vector' }]
      });
      const synonym = await MongoDatasetSynonym.create({
        teamId: root.teamId,
        datasetId: dataset._id,
        version: 1,
        enabled: true,
        schemaVersion: DatasetSynonymSchemaVersion
      });
      await MongoDatasetSynonymMapping.create({
        logicalMappingId: new Types.ObjectId(),
        teamId: root.teamId,
        datasetId: dataset._id,
        synonymFileId: synonym._id,
        fileVersion: 1,
        standardizedTerm: '退款',
        normalizedStandardizedTerm: '退款',
        synonymTerms: ['退钱'],
        normalizedSynonymTerms: ['退钱'],
        allTerms: '退款 退钱',
        fingerprint: '退款:退钱'
      });
      await MongoDatasetData.updateOne(
        { _id: data._id },
        { $set: { synonymRebuildingVersion: 1 } }
      );
      await rebuildDatasetDataIndexes({ dataId: String(data._id), model: embeddingModel });
      expect(
        mockGetVectors.mock.calls.flatMap(([props]) => props.inputs.map((input) => input.input))
      ).toEqual(['退款']);
      expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
        q: 'unrelated body',
        indexes: [{ text: '退钱' }],
        synonymVersion: 1
      });
      expect(await MongoDatasetData.findById(data._id).lean()).not.toHaveProperty(
        'synonymRebuildingVersion'
      );
      expect((await MongoDatasetDataText.findOne({ dataId: data._id }).lean())?.fullTextToken).toBe(
        await jiebaSplit({ text: '退款' })
      );
    });

    it('rolls back rebuilt indexes when the synonym snapshot changes during embedding', async () => {
      const { root, dataset, data } = await createMongoData();
      const synonym = await MongoDatasetSynonym.create({
        teamId: root.teamId,
        datasetId: dataset._id,
        version: 1,
        enabled: true,
        schemaVersion: DatasetSynonymSchemaVersion
      });
      mockGetVectors.mockImplementationOnce(async ({ inputs }) => {
        await MongoDatasetSynonym.updateOne({ _id: synonym._id }, { $set: { version: 2 } });
        return createMockVectorsResponse(inputs.map((input) => input.input));
      });
      await expect(
        rebuildDatasetDataIndexes({ dataId: String(data._id), model: embeddingModel })
      ).rejects.toThrow('同义词配置已变化');
      expect((await MongoDatasetData.findById(data._id).lean())?.indexes).toMatchObject(
        data.indexes.map(({ type, text, dataId }) => ({ type, text, dataId }))
      );
      expect(mockVectorDelete).toHaveBeenCalledWith(
        expect.objectContaining({ idList: ['id_1', 'id_2'] })
      );
    });
  });

  describe('updateDatasetDataSystemIndexes', () => {
    it('should replace only default indexes and keep concurrently added custom indexes', async () => {
      const { data } = await createMongoData({
        q: 'old question',
        a: '',
        indexes: [
          {
            type: DatasetDataIndexTypeEnum.custom,
            text: 'old custom index',
            dataId: 'custom_old'
          },
          {
            type: DatasetDataIndexTypeEnum.default,
            text: 'old question',
            dataId: 'default_old'
          }
        ]
      });
      const updatePromise = updateDatasetDataSystemIndexes({
        dataId: String(data._id),
        q: 'new question',
        a: '',
        model: embeddingModel,
        indexSize: 512
      });

      await MongoDatasetData.updateOne(
        { _id: data._id },
        {
          $push: {
            indexes: {
              $each: [
                {
                  type: DatasetDataIndexTypeEnum.custom,
                  text: 'concurrent custom index',
                  dataId: 'custom_concurrent'
                }
              ],
              $position: 0
            }
          }
        }
      );
      await updatePromise;

      const updatedData = await MongoDatasetData.findById(data._id).lean();
      expect(updatedData?.q).toBe('new question');
      expect(updatedData?.indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.custom,
            text: 'old custom index',
            dataId: 'custom_old'
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.custom,
            text: 'concurrent custom index',
            dataId: 'custom_concurrent'
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.default,
            text: 'new question'
          })
        ])
      );
      expect(
        updatedData?.indexes.filter((index) => index.type === DatasetDataIndexTypeEnum.default)
      ).toHaveLength(1);
    });

    it('should keep history unchanged when q and a do not change', async () => {
      const history = [
        {
          q: 'previous question',
          a: 'previous answer',
          updateTime: new Date('2024-01-01T00:00:00.000Z')
        }
      ];
      const { data } = await createMongoData({
        q: 'same question',
        a: 'same answer',
        history,
        indexes: [
          {
            type: DatasetDataIndexTypeEnum.custom,
            text: 'custom index',
            dataId: 'custom_old'
          },
          {
            type: DatasetDataIndexTypeEnum.default,
            text: 'same question',
            dataId: 'default_q'
          },
          {
            type: DatasetDataIndexTypeEnum.default,
            text: 'same answer',
            dataId: 'default_a'
          }
        ]
      });

      const result = await updateDatasetDataSystemIndexes({
        dataId: String(data._id),
        q: 'same question',
        a: 'same answer',
        model: embeddingModel,
        indexSize: 50
      });

      const updatedData = await MongoDatasetData.findById(data._id).lean();
      expect(result.tokens).toBe(0);
      expect(updatedData?.history).toEqual([expect.objectContaining(history[0])]);
      expect(mockVectorInsert).not.toHaveBeenCalled();
      expect(mockVectorDelete).not.toHaveBeenCalled();
    });

    it('should preserve concurrent data edits and clean newly generated system vectors', async () => {
      const { root, dataset, data } = await createMongoData({ q: 'old question', a: '' });
      await MongoDatasetSynonym.create({
        teamId: root.teamId,
        datasetId: dataset._id,
        version: 1,
        enabled: true,
        schemaVersion: DatasetSynonymSchemaVersion
      });
      mockGetVectors.mockImplementationOnce(async ({ inputs }) => {
        await MongoDatasetData.updateOne(
          { _id: data._id },
          { $set: { q: 'concurrent question', updateTime: new Date(Date.now() + 10_000) } }
        );
        return createMockVectorsResponse(inputs.map((input) => input.input));
      });

      await expect(
        updateDatasetDataSystemIndexes({
          dataId: String(data._id),
          q: 'requested question',
          a: '',
          model: embeddingModel
        })
      ).rejects.toThrow('数据已变化');

      await expect(MongoDatasetData.findById(data._id).lean()).resolves.toMatchObject({
        q: 'concurrent question',
        indexes: expect.arrayContaining([
          expect.objectContaining({ dataId: 'default_old', text: 'old question' })
        ])
      });
      expect(mockVectorDelete).toHaveBeenCalledWith({
        teamId: data.teamId,
        idList: ['id_1']
      });
    });

    it('should reject stale system vectors when the synonym matcher changes', async () => {
      const { root, dataset, data } = await createMongoData({ q: '退钱', a: '' });
      const synonym = await MongoDatasetSynonym.create({
        teamId: root.teamId,
        datasetId: dataset._id,
        version: 1,
        enabled: true,
        schemaVersion: DatasetSynonymSchemaVersion
      });
      mockGetVectors.mockImplementationOnce(async ({ inputs }) => {
        await MongoDatasetSynonym.updateOne({ _id: synonym._id }, { $set: { version: 2 } });
        return createMockVectorsResponse(inputs.map((input) => input.input));
      });

      await expect(
        updateDatasetDataSystemIndexes({
          dataId: String(data._id),
          q: '我要退钱',
          a: '',
          model: embeddingModel
        })
      ).rejects.toThrow('同义词配置已变化');

      await expect(MongoDatasetData.findById(data._id).lean()).resolves.toMatchObject({
        q: '退钱',
        indexes: expect.arrayContaining([expect.objectContaining({ dataId: 'default_old' })])
      });
      expect(mockVectorDelete).toHaveBeenCalledWith({
        teamId: data.teamId,
        idList: ['id_1']
      });
    });

    it('should reject when data does not exist', async () => {
      await expect(
        updateDatasetDataSystemIndexes({
          dataId: String(new Types.ObjectId()),
          q: 'question',
          model: embeddingModel
        })
      ).rejects.toBe('Data not found');
    });
  });

  describe('updateDatasetDataSystemIndexes with image embedding', () => {
    it('should replace only default and image embedding indexes without touching manual indexes', async () => {
      const { data } = await createMongoData({
        q: 'old question',
        a: '',
        indexes: [
          {
            type: DatasetDataIndexTypeEnum.custom,
            text: 'manual custom',
            dataId: 'custom_old'
          },
          {
            type: DatasetDataIndexTypeEnum.question,
            text: 'manual question',
            dataId: 'question_old'
          },
          {
            type: DatasetDataIndexTypeEnum.summary,
            text: 'manual summary',
            dataId: 'summary_old'
          },
          {
            type: DatasetDataIndexTypeEnum.image,
            text: 'manual image summary',
            dataId: 'image_old'
          },
          {
            type: DatasetDataIndexTypeEnum.default,
            text: 'old question',
            dataId: 'default_old'
          },
          {
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: 'dataset/team/old.png',
            dataId: 'image_embedding_old'
          }
        ]
      });
      const nextImage = `dataset/${data.datasetId}/new.png`;

      await updateDatasetDataSystemIndexes({
        dataId: String(data._id),
        q: `new question ![new](${nextImage})`,
        a: '',
        imageIndex: true,
        model: visionEmbeddingModel,
        indexSize: 50
      });

      const updatedData = await MongoDatasetData.findById(data._id).lean();
      expect(updatedData?.indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.custom,
            text: 'manual custom',
            dataId: 'custom_old'
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.question,
            text: 'manual question',
            dataId: 'question_old'
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.summary,
            text: 'manual summary',
            dataId: 'summary_old'
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.image,
            text: 'manual image summary',
            dataId: 'image_old'
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.default,
            text: `new question ![new](${nextImage})`
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: nextImage
          })
        ])
      );
      expect(
        updatedData?.indexes.find(
          (index) =>
            index.type === DatasetDataIndexTypeEnum.imageEmbedding &&
            index.text === 'dataset/team/old.png'
        )
      ).toBeUndefined();
      const deleteCall = mockVectorDelete.mock.calls[0]?.[0];
      expect(String(deleteCall?.teamId)).toBe(String(data.teamId));
      expect(deleteCall?.idList).toEqual(['default_old', 'image_embedding_old']);
      expect(mockVectorDelete).not.toHaveBeenCalledWith(
        expect.objectContaining({
          idList: expect.arrayContaining(['custom_old', 'question_old', 'summary_old', 'image_old'])
        })
      );
    });
  });

  describe('deleteDatasetData', () => {
    it('should delete data, full-text data, dataset image and vectors', async () => {
      const { data } = await createMongoData({
        indexes: [
          {
            type: DatasetDataIndexTypeEnum.custom,
            text: 'custom',
            dataId: 'custom_id'
          },
          {
            type: DatasetDataIndexTypeEnum.default,
            text: 'default',
            dataId: 'default_id'
          }
        ]
      });
      data.imageId = `dataset/${data.datasetId}/image.png`;
      await data.save();
      const dataItem = toDataItem(data);

      await deleteDatasetData(dataItem);

      expect(await MongoDatasetData.findById(data._id).lean()).toBeNull();
      expect(await MongoDatasetDataText.findOne({ dataId: data._id }).lean()).toBeNull();
      expect(mockDeleteDatasetFileByKey).toHaveBeenCalledWith(data.imageId);
      expect(mockVectorDelete).toHaveBeenCalledWith({
        teamId: String(data.teamId),
        idList: ['custom_id', 'default_id']
      });
    });

    it('should skip image deletion and vector deletion for non-dataset image and empty indexes', async () => {
      const { data } = await createMongoData({ indexes: [] });
      data.imageId = 'chat/app/file.png';
      await data.save();

      await deleteDatasetData(toDataItem(data));

      expect(mockDeleteDatasetFileByKey).not.toHaveBeenCalled();
      expect(mockVectorDelete).not.toHaveBeenCalled();
    });

    it('should skip image deletion when the imageId belongs to another dataset', async () => {
      const { data } = await createMongoData({ indexes: [] });
      // 脏数据：图片来源 key 属于另一个 dataset
      data.imageId = 'dataset/507f1f77bcf86cd799439099/foreign.png';
      await data.save();

      await deleteDatasetData(toDataItem(data));

      // 外库 key 不得触发物理删除
      expect(mockDeleteDatasetFileByKey).not.toHaveBeenCalled();
    });
  });
});

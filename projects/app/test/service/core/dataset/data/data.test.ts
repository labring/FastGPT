import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { getEmbeddingModelData } from '@fastgpt/service/core/ai/model';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba/index';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import { DatasetSynonymSchemaVersion } from '@fastgpt/global/core/dataset/synonym';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
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
  updateDatasetDataSystemIndexes
} from '@/service/core/dataset/data/data';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

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
    resetVectorMocks();
    mockGetVectors.mockClear();
    mockDeleteDatasetFileByKey.mockReset();
    mockGetDatasetBase64Image.mockClear();
    mockCountPromptTokens.mockClear();
    vi.mocked(getEmbeddingModelData).mockReturnValue(embeddingModel);
    mockGetVectors.mockImplementation(async ({ inputs }) =>
      createMockVectorsResponse(inputs.map((input) => input.input))
    );
    mockVectorInsert.mockResolvedValue({
      insertIds: ['id_1', 'id_2', 'id_3', 'id_4', 'id_5', 'id_6']
    });
    mockVectorDelete.mockResolvedValue(undefined);
  });

  describe('createDatasetData', () => {
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

    it('should preserve image embeddings during a text-only rebuild', async () => {
      const imageUrl = 'dataset/team/image.png';
      const { data } = await createMongoData({
        q: 'same question',
        imageId: imageUrl,
        indexes: [
          {
            type: DatasetDataIndexTypeEnum.default,
            text: 'same question',
            dataId: 'default_old'
          },
          {
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: imageUrl,
            dataId: 'image_old'
          },
          {
            type: DatasetDataIndexTypeEnum.image,
            text: 'existing image description',
            dataId: 'image_description_old'
          }
        ]
      });

      await updateDatasetDataByIndexes({
        dataId: String(data._id),
        getCurrentIndexes: (indexes) =>
          indexes.filter((index) => index.type !== DatasetDataIndexTypeEnum.default),
        imageIndex: true,
        model: embeddingModel,
        forceRebuild: true,
        preserveImageEmbedding: true
      });

      const updatedData = await MongoDatasetData.findById(data._id).lean();
      expect(updatedData?.indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: imageUrl,
            dataId: 'image_old'
          }),
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.image,
            text: 'existing image description'
          })
        ])
      );
      expect(mockGetDatasetBase64Image).not.toHaveBeenCalled();
      expect(mockVectorDelete).not.toHaveBeenCalledWith(
        expect.objectContaining({ idList: expect.arrayContaining(['image_old']) })
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
          getCurrentIndexes: (indexes) => indexes,
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
      const mainImage = 'dataset/team/main.png';
      const oldMarkdownImage = 'dataset/team/old.png';
      const newMarkdownImage = 'dataset/team/new.png';
      const { data } = await createMongoData({
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
      let questionAtVectorCleanup: string | undefined;
      mockVectorDelete.mockImplementationOnce(async () => {
        questionAtVectorCleanup = (await MongoDatasetData.findById(data._id).lean())?.q;
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
      expect(questionAtVectorCleanup).toBe('new question');
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
  });
});

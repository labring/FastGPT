import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type {
  DatasetDataIndexItemType,
  DatasetDataItemType
} from '@fastgpt/global/core/dataset/type';
import { getRootUser } from '@test/datas/users';
import { mockGetVectors, createMockVectorsResponse } from '@test/mocks/core/ai/embedding';
import { mockVectorDelete, mockVectorInsert, resetVectorMocks } from '@test/mocks/common/vector';
import { serviceEnv } from '@fastgpt/service/env';
import {
  createDatasetDataIndex,
  DatasetDataIndexOperation,
  deleteDatasetDataIndex,
  updateDatasetDataIndex
} from '@/service/core/dataset/data/dataIndex';

const { mockCountPromptTokens } = vi.hoisted(() => ({
  mockCountPromptTokens: vi.fn(async (text: string) => text.length)
}));

const { mockGetDatasetBase64Image } = vi.hoisted(() => ({
  mockGetDatasetBase64Image: vi.fn(async (imageUrl: string) => `data:image/png;base64,${imageUrl}`)
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: vi.fn(() => ({
    getDatasetBase64Image: mockGetDatasetBase64Image
  }))
}));

vi.mock('@fastgpt/service/common/string/tiktoken', () => ({
  countPromptTokens: mockCountPromptTokens
}));

const embeddingModel = {
  model: 'text-embedding-3-small',
  name: 'text-embedding-3-small',
  maxToken: 12
} as any;
const originalMultipleDataToBase64 = serviceEnv.MULTIPLE_DATA_TO_BASE64;

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

const createData = async (
  indexes: DatasetDataIndexItemType[] = [
    {
      type: DatasetDataIndexTypeEnum.custom,
      text: 'old custom',
      dataId: 'custom_old'
    }
  ]
) => {
  const { root, dataset, collection } = await createDatasetContext();
  const data = await MongoDatasetData.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    collectionId: collection._id,
    q: 'question',
    a: 'answer',
    indexes
  });

  return {
    root,
    dataset,
    collection,
    data,
    dataItem: {
      id: String(data._id),
      teamId: String(root.teamId),
      tmbId: String(root.tmbId),
      datasetId: String(dataset._id),
      collectionId: String(collection._id),
      q: data.q,
      a: data.a,
      chunkIndex: data.chunkIndex,
      updateTime: data.updateTime,
      indexes: data.indexes.map((index) => ({
        type: index.type,
        text: index.text,
        dataId: index.dataId
      }))
    } as DatasetDataItemType
  };
};

describe('DatasetDataIndexOperation', () => {
  beforeEach(() => {
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = true;
    resetVectorMocks();
    mockGetVectors.mockClear();
    mockGetDatasetBase64Image.mockClear();
    mockCountPromptTokens.mockClear();
    vi.mocked(getEmbeddingModel).mockReturnValue(embeddingModel);
    mockGetVectors.mockImplementation(async ({ inputs }) =>
      createMockVectorsResponse(inputs.map((input) => input.input))
    );
    mockVectorInsert.mockResolvedValue({
      insertIds: ['id_1', 'id_2', 'id_3', 'id_4', 'id_5']
    });
    mockVectorDelete.mockResolvedValue(undefined);
  });

  afterEach(() => {
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = originalMultipleDataToBase64;
  });

  describe('getSystemIndexes', () => {
    it('should collect image embedding sources by image index switch and model capability', () => {
      const textModelOperation = new DatasetDataIndexOperation(embeddingModel);
      const visionOperation = new DatasetDataIndexOperation({
        ...embeddingModel,
        vision: true
      });

      expect(
        textModelOperation.getImageEmbeddingSources({
          q: '![one](dataset/team/one.png)',
          imageId: 'dataset/team/main.png',
          imageIndex: true
        })
      ).toEqual([]);

      expect(
        visionOperation.getImageEmbeddingSources({
          q: '![one](dataset/team/one.png) ![invalid](relative/image.png)',
          a: '![two](https://example.com/two.png) ![repeat](dataset/team/one.png)',
          imageId: 'dataset/team/main.png',
          imageIndex: true
        })
      ).toEqual(['dataset/team/main.png', 'dataset/team/one.png', 'https://example.com/two.png']);

      expect(
        visionOperation.getImageEmbeddingSources({
          q: '![one](dataset/team/one.png)',
          imageId: 'dataset/team/main.png',
          imageIndex: false
        })
      ).toEqual(['dataset/team/main.png']);
    });

    it('should create prefixed default indexes from question and answer', async () => {
      const operation = new DatasetDataIndexOperation(embeddingModel);

      const result = await operation.getSystemIndexes({
        q: 'question text',
        a: 'answer text',
        indexSize: 50,
        indexPrefix: 'collection title'
      });

      expect(result).toEqual([
        {
          type: DatasetDataIndexTypeEnum.default,
          text: 'collection title\nquestion text'
        },
        {
          type: DatasetDataIndexTypeEnum.default,
          text: 'collection title\nanswer text'
        }
      ]);
    });

    it('should create image embedding indexes from image id and markdown images', async () => {
      const operation = new DatasetDataIndexOperation({
        ...embeddingModel,
        vision: true
      });

      const result = await operation.getSystemIndexes({
        q: 'question ![one](dataset/team/one.png)',
        a: 'answer ![two](https://example.com/two.png) ![repeat](dataset/team/one.png)',
        imageId: 'dataset/team/main.png',
        imageIndex: true,
        indexSize: 50,
        maxIndexSize: 200
      });

      expect(result).toEqual([
        {
          type: DatasetDataIndexTypeEnum.default,
          text: 'question ![one](dataset/team/one.png)'
        },
        {
          type: DatasetDataIndexTypeEnum.default,
          text: 'answer ![two](https://example.com/two.png) ![repeat](dataset/team/one.png)'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/main.png'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/one.png'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'https://example.com/two.png'
        }
      ]);
    });
  });

  describe('formatIndexes', () => {
    it('should normalize indexes, remove duplicate custom text and keep default indexes', async () => {
      const operation = new DatasetDataIndexOperation(embeddingModel);

      const result = await operation.formatIndexes({
        q: 'question',
        a: '',
        indexSize: 20,
        indexes: [
          { type: DatasetDataIndexTypeEnum.custom, text: 'manual', dataId: 'manual_1' },
          { type: DatasetDataIndexTypeEnum.custom, text: 'manual', dataId: 'manual_2' },
          { type: DatasetDataIndexTypeEnum.custom, text: 'question', dataId: 'same_as_default' },
          { text: 123 as any }
        ]
      });

      expect(result).toEqual([
        {
          type: DatasetDataIndexTypeEnum.custom,
          text: 'manual',
          dataId: 'manual_1'
        },
        {
          type: DatasetDataIndexTypeEnum.custom,
          text: '123',
          dataId: undefined
        },
        {
          type: DatasetDataIndexTypeEnum.default,
          text: 'question',
          dataId: 'same_as_default'
        }
      ]);
    });

    it('should regenerate system indexes and only reuse matching image embedding ids', async () => {
      const operation = new DatasetDataIndexOperation({
        ...embeddingModel,
        vision: true
      });

      const result = await operation.formatIndexes({
        q: 'question ![new](dataset/team/new.png)',
        a: '',
        imageId: 'dataset/team/main.png',
        imageIndex: true,
        indexSize: 20,
        maxIndexSize: 200,
        indexes: [
          { type: DatasetDataIndexTypeEnum.custom, text: 'manual', dataId: 'manual_1' },
          {
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: 'dataset/team/main.png',
            dataId: 'main_old'
          },
          {
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: 'dataset/team/old.png',
            dataId: 'old_image'
          }
        ]
      });

      expect(result).toEqual([
        {
          type: DatasetDataIndexTypeEnum.custom,
          text: 'manual',
          dataId: 'manual_1'
        },
        {
          type: DatasetDataIndexTypeEnum.default,
          text: 'question ![new](dataset/team/new.png)'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/main.png',
          dataId: 'main_old'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/new.png'
        }
      ]);
    });

    it('should keep text indexes whose text matches image embedding source', async () => {
      const operation = new DatasetDataIndexOperation({
        ...embeddingModel,
        vision: true
      });
      const imageSource = 'dataset/team/main.png';

      const result = await operation.formatIndexes({
        q: '',
        a: '',
        imageId: imageSource,
        indexSize: 20,
        maxIndexSize: 200,
        indexes: [
          {
            type: DatasetDataIndexTypeEnum.custom,
            text: imageSource,
            dataId: 'custom_image_text'
          }
        ]
      });

      expect(result).toEqual([
        {
          type: DatasetDataIndexTypeEnum.custom,
          text: imageSource,
          dataId: 'custom_image_text'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: imageSource
        }
      ]);
    });

    it('should split a custom index when token count exceeds max token', async () => {
      const operation = new DatasetDataIndexOperation(embeddingModel);
      mockCountPromptTokens.mockResolvedValueOnce(30);

      const result = await operation.formatIndexes({
        q: '',
        a: '',
        indexSize: 8,
        maxIndexSize: 12,
        indexes: [
          {
            type: DatasetDataIndexTypeEnum.custom,
            text: 'first sentence. second sentence. third sentence.'
          }
        ]
      });

      expect(result.length).toBeGreaterThan(1);
      expect(result.every((index) => index.type === DatasetDataIndexTypeEnum.custom)).toBe(true);
      const mergedText = result.map((index) => index.text).join(' ');
      expect(mergedText).toContain('first');
      expect(mergedText).toContain('third');
    });

    it('should check default index token size after prefix is applied', async () => {
      const operation = new DatasetDataIndexOperation(embeddingModel);
      mockCountPromptTokens.mockResolvedValueOnce(21);

      const result = await operation.formatIndexes({
        q: 'short content',
        a: '',
        indexSize: 10,
        maxIndexSize: 20,
        indexPrefix: '# LongTitle',
        indexes: []
      });

      expect(mockCountPromptTokens).toHaveBeenCalledWith('# LongTitle\nshort content');
      expect(result).toEqual([
        {
          type: DatasetDataIndexTypeEnum.default,
          text: '# LongTitle\nshort content'
        }
      ]);
    });

    it('should keep image embedding indexes unsplit even when text looks too long', async () => {
      const operation = new DatasetDataIndexOperation({
        ...embeddingModel,
        vision: true
      });
      const imageSource = 'dataset/team/a-very-long-image-source-name-that-is-not-text.png';

      const result = await operation.formatIndexes({
        q: '',
        a: '',
        imageId: imageSource,
        indexSize: 8,
        maxIndexSize: 12,
        indexes: []
      });

      expect(mockCountPromptTokens).not.toHaveBeenCalled();
      expect(result).toEqual([
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: imageSource
        }
      ]);
    });
  });

  describe('mergeExistingSystemIndexIds', () => {
    it('should reuse dataId for unchanged default indexes only', () => {
      const operation = new DatasetDataIndexOperation(embeddingModel);

      const result = operation.mergeExistingSystemIndexIds({
        currentIndexes: [
          { type: DatasetDataIndexTypeEnum.default, text: 'same', dataId: 'default_old' },
          { type: DatasetDataIndexTypeEnum.custom, text: 'same custom', dataId: 'custom_old' }
        ],
        nextSystemIndexes: [
          { type: DatasetDataIndexTypeEnum.default, text: 'same' },
          { type: DatasetDataIndexTypeEnum.default, text: 'new' }
        ]
      });

      expect(result).toEqual([
        { type: DatasetDataIndexTypeEnum.default, text: 'same', dataId: 'default_old' },
        { type: DatasetDataIndexTypeEnum.default, text: 'new' }
      ]);
    });

    it('should reuse system dataId by type and text without crossing text and image indexes', () => {
      const operation = new DatasetDataIndexOperation(embeddingModel);

      const result = operation.mergeExistingSystemIndexIds({
        currentIndexes: [
          { type: DatasetDataIndexTypeEnum.default, text: 'same-source', dataId: 'default_old' },
          {
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: 'same-source',
            dataId: 'image_old'
          },
          { type: DatasetDataIndexTypeEnum.custom, text: 'dataset/team/new.png', dataId: 'custom' }
        ],
        nextSystemIndexes: [
          { type: DatasetDataIndexTypeEnum.imageEmbedding, text: 'same-source' },
          { type: DatasetDataIndexTypeEnum.imageEmbedding, text: 'dataset/team/new.png' }
        ]
      });

      expect(result).toEqual([
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'same-source',
          dataId: 'image_old'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/new.png'
        }
      ]);
    });
  });

  describe('buildPatch', () => {
    it('should build create, update, delete and unchanged patch items', () => {
      const operation = new DatasetDataIndexOperation(embeddingModel);

      const result = operation.buildPatch({
        currentIndexes: [
          { type: DatasetDataIndexTypeEnum.custom, text: 'keep', dataId: 'keep_id' },
          { type: DatasetDataIndexTypeEnum.custom, text: 'old text', dataId: 'update_id' },
          { type: DatasetDataIndexTypeEnum.custom, text: 'remove', dataId: 'delete_id' }
        ],
        nextIndexes: [
          { type: DatasetDataIndexTypeEnum.custom, text: 'keep', dataId: 'keep_id' },
          { type: DatasetDataIndexTypeEnum.custom, text: 'new text', dataId: 'update_id' },
          { type: DatasetDataIndexTypeEnum.custom, text: 'create' }
        ]
      });

      expect(result.map((item) => item.type)).toEqual(['delete', 'unChange', 'update', 'create']);
      expect(operation.getDeleteVectorIdList(result)).toEqual(['delete_id', 'update_id']);
      expect(operation.getWritablePatchIndexes(result)).toEqual([
        { type: DatasetDataIndexTypeEnum.custom, text: 'keep', dataId: 'keep_id' },
        { type: DatasetDataIndexTypeEnum.custom, text: 'new text', dataId: 'update_id' },
        { type: DatasetDataIndexTypeEnum.custom, text: 'create' }
      ]);
    });

    it('should allow patching only filtered current indexes', () => {
      const operation = new DatasetDataIndexOperation(embeddingModel);

      const result = operation.buildPatch({
        currentIndexes: [
          { type: DatasetDataIndexTypeEnum.custom, text: 'custom', dataId: 'custom_id' },
          { type: DatasetDataIndexTypeEnum.default, text: 'old default', dataId: 'default_id' }
        ],
        nextIndexes: [{ type: DatasetDataIndexTypeEnum.default, text: 'new default' }],
        currentIndexFilter: (index) => index.type === DatasetDataIndexTypeEnum.default
      });

      expect(result).toEqual([
        {
          type: 'delete',
          index: {
            type: DatasetDataIndexTypeEnum.default,
            text: 'old default',
            dataId: 'default_id'
          }
        },
        {
          type: 'create',
          index: {
            type: DatasetDataIndexTypeEnum.default,
            text: 'new default'
          }
        }
      ]);
    });
  });

  describe('insertVectorForPatch', () => {
    it('should insert vectors for create and update patch items and mutate dataId', async () => {
      const operation = new DatasetDataIndexOperation(embeddingModel);
      const patchResult = operation.buildPatch({
        currentIndexes: [
          { type: DatasetDataIndexTypeEnum.custom, text: 'old text', dataId: 'old_id' }
        ],
        nextIndexes: [
          { type: DatasetDataIndexTypeEnum.custom, text: 'new text', dataId: 'old_id' },
          { type: DatasetDataIndexTypeEnum.custom, text: 'new custom' }
        ]
      });

      const tokens = await operation.insertVectorForPatch({
        patchResult,
        teamId: 'team_id',
        datasetId: 'dataset_id',
        collectionId: 'collection_id'
      });

      expect(tokens).toBeGreaterThan(0);
      expect(mockVectorInsert).toHaveBeenCalledTimes(1);
      expect(operation.getWritablePatchIndexes(patchResult)).toEqual([
        { type: DatasetDataIndexTypeEnum.custom, text: 'new text', dataId: 'id_1' },
        { type: DatasetDataIndexTypeEnum.custom, text: 'new custom', dataId: 'id_2' }
      ]);
    });

    it('should return zero when no patch item needs vector insertion', async () => {
      const operation = new DatasetDataIndexOperation(embeddingModel);

      const tokens = await operation.insertVectorForPatch({
        patchResult: [
          {
            type: 'unChange',
            index: { type: DatasetDataIndexTypeEnum.custom, text: 'same', dataId: 'same_id' }
          }
        ],
        teamId: 'team_id',
        datasetId: 'dataset_id',
        collectionId: 'collection_id'
      });

      expect(tokens).toBe(0);
      expect(mockVectorInsert).not.toHaveBeenCalled();
    });

    it('should insert text and image embedding patch items in one vector call', async () => {
      const operation = new DatasetDataIndexOperation({
        ...embeddingModel,
        vision: true
      });
      mockVectorInsert.mockResolvedValueOnce({ insertIds: ['text_vector_id', 'image_vector_id'] });
      const patchResult = operation.buildPatch({
        currentIndexes: [],
        nextIndexes: [
          { type: DatasetDataIndexTypeEnum.custom, text: 'text index' },
          {
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: 'dataset/team/collection/image.png'
          }
        ]
      });

      const tokens = await operation.insertVectorForPatch({
        patchResult,
        teamId: 'team_id',
        datasetId: 'dataset_id',
        collectionId: 'collection_id'
      });

      expect(tokens).toBeGreaterThan(0);
      expect(mockVectorInsert).toHaveBeenCalledTimes(1);
      expect(mockGetVectors).toHaveBeenCalledWith(
        expect.objectContaining({
          inputs: [
            { type: 'text', input: 'text index' },
            { type: 'image', input: 'data:image/png;base64,dataset/team/collection/image.png' }
          ]
        })
      );
      expect(operation.getWritablePatchIndexes(patchResult)).toEqual([
        { type: DatasetDataIndexTypeEnum.custom, text: 'text index', dataId: 'text_vector_id' },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/collection/image.png',
          dataId: 'image_vector_id'
        }
      ]);
    });
  });

  describe('insertVectors and deleteVectors', () => {
    it('should attach inserted vector ids to indexes', async () => {
      const operation = new DatasetDataIndexOperation(embeddingModel);

      const result = await operation.insertVectors({
        indexes: [
          { type: DatasetDataIndexTypeEnum.custom, text: 'one' },
          { type: DatasetDataIndexTypeEnum.default, text: 'two' }
        ],
        teamId: 'team_id',
        datasetId: 'dataset_id',
        collectionId: 'collection_id'
      });

      expect(result.indexes).toEqual([
        { type: DatasetDataIndexTypeEnum.custom, text: 'one', dataId: 'id_1' },
        { type: DatasetDataIndexTypeEnum.default, text: 'two', dataId: 'id_2' }
      ]);
    });

    it('should skip image embedding indexes when the model does not support image input', async () => {
      const operation = new DatasetDataIndexOperation(embeddingModel);

      const result = await operation.insertVectors({
        indexes: [
          { type: DatasetDataIndexTypeEnum.custom, text: 'one' },
          { type: DatasetDataIndexTypeEnum.imageEmbedding, text: 'dataset/team/image.png' }
        ],
        teamId: 'team_id',
        datasetId: 'dataset_id',
        collectionId: 'collection_id'
      });

      expect(result.indexes).toEqual([
        { type: DatasetDataIndexTypeEnum.custom, text: 'one', dataId: 'id_1' }
      ]);
      expect(mockVectorInsert).toHaveBeenCalledTimes(1);
    });

    it('should skip invalid image embedding sources without dropping valid text indexes', async () => {
      const operation = new DatasetDataIndexOperation({
        ...embeddingModel,
        vision: true
      });

      const result = await operation.insertVectors({
        indexes: [
          { type: DatasetDataIndexTypeEnum.custom, text: 'one' },
          { type: DatasetDataIndexTypeEnum.imageEmbedding, text: 'relative/image.png' }
        ],
        teamId: 'team_id',
        datasetId: 'dataset_id',
        collectionId: 'collection_id'
      });

      expect(result.indexes).toEqual([
        { type: DatasetDataIndexTypeEnum.custom, text: 'one', dataId: 'id_1' }
      ]);
      expect(mockGetVectors).toHaveBeenCalledWith(
        expect.objectContaining({
          inputs: [{ type: 'text', input: 'one' }]
        })
      );
    });

    it('should skip vector delete when id list is empty', async () => {
      const operation = new DatasetDataIndexOperation(embeddingModel);

      await operation.deleteVectors({ teamId: 'team_id', idList: [] });

      expect(mockVectorDelete).not.toHaveBeenCalled();
    });
  });

  describe('writeDatasetDataIndex', () => {
    it('should create a custom index and push it before existing indexes', async () => {
      const { data, dataItem } = await createData();

      const result = await createDatasetDataIndex({
        data: dataItem,
        type: DatasetDataIndexTypeEnum.custom,
        text: ' new custom ',
        model: 'text-embedding-3-small'
      });

      const updatedData = await MongoDatasetData.findById(data._id).lean();
      expect(result.index).toEqual({
        type: DatasetDataIndexTypeEnum.custom,
        text: 'new custom',
        dataId: 'id_1'
      });
      expect(result.tokens).toBeGreaterThan(0);
      expect(updatedData?.indexes[0]).toEqual(
        expect.objectContaining({
          type: DatasetDataIndexTypeEnum.custom,
          text: 'new custom',
          dataId: 'id_1'
        })
      );
    });

    it('should update an existing custom index and delete the old vector', async () => {
      const { data, dataItem } = await createData();

      const result = await updateDatasetDataIndex({
        data: dataItem,
        indexDataId: 'custom_old',
        type: DatasetDataIndexTypeEnum.custom,
        text: 'updated',
        model: 'text-embedding-3-small'
      });

      const updatedData = await MongoDatasetData.findById(data._id).lean();
      expect(result.index).toEqual({
        type: DatasetDataIndexTypeEnum.custom,
        text: 'updated',
        dataId: 'id_1'
      });
      expect(updatedData?.indexes).toEqual([
        expect.objectContaining({
          type: DatasetDataIndexTypeEnum.custom,
          text: 'updated',
          dataId: 'id_1'
        })
      ]);
      expect(mockVectorDelete).toHaveBeenCalledWith({
        teamId: String(dataItem.teamId),
        idList: ['custom_old']
      });
    });

    it('should allow manually updating generated non-protected index types', async () => {
      const editableTypes = [
        DatasetDataIndexTypeEnum.summary,
        DatasetDataIndexTypeEnum.question,
        DatasetDataIndexTypeEnum.image
      ];

      for (const type of editableTypes) {
        const { data, dataItem } = await createData([
          {
            type,
            text: 'old',
            dataId: `${type}_old`
          }
        ]);

        const result = await updateDatasetDataIndex({
          data: dataItem,
          indexDataId: `${type}_old`,
          type,
          text: 'new',
          model: 'text-embedding-3-small'
        });

        const updatedData = await MongoDatasetData.findById(data._id).lean();
        expect(result.index).toEqual({
          type,
          text: 'new',
          dataId: expect.any(String)
        });
        expect(updatedData?.indexes).toEqual([
          expect.objectContaining({
            type,
            text: 'new'
          })
        ]);
      }
    });

    it('should reuse existing index when text and type do not change', async () => {
      const { dataItem } = await createData();

      const result = await updateDatasetDataIndex({
        data: dataItem,
        indexDataId: 'custom_old',
        type: DatasetDataIndexTypeEnum.custom,
        text: 'old custom',
        model: 'text-embedding-3-small'
      });

      expect(result).toEqual({
        index: {
          type: DatasetDataIndexTypeEnum.custom,
          text: 'old custom',
          dataId: 'custom_old'
        },
        tokens: 0
      });
      expect(mockVectorInsert).not.toHaveBeenCalled();
    });

    it('should reject invalid custom index save requests', async () => {
      const { dataItem } = await createData();

      await expect(
        createDatasetDataIndex({
          data: dataItem,
          type: DatasetDataIndexTypeEnum.custom,
          text: '   ',
          model: 'text-embedding-3-small'
        })
      ).rejects.toBe('Dataset data index text is required');

      await expect(
        createDatasetDataIndex({
          data: dataItem,
          type: DatasetDataIndexTypeEnum.default,
          text: 'default',
          model: 'text-embedding-3-small'
        })
      ).rejects.toBe('System indexes cannot be saved separately');

      await expect(
        createDatasetDataIndex({
          data: dataItem,
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/image.png',
          model: 'text-embedding-3-small'
        })
      ).rejects.toBe('System indexes cannot be saved separately');

      await expect(
        updateDatasetDataIndex({
          data: dataItem,
          indexDataId: 'missing_id',
          type: DatasetDataIndexTypeEnum.custom,
          text: 'valid',
          model: 'text-embedding-3-small'
        })
      ).rejects.toBe('Dataset data index not found');
    });

    it('should reject custom index text longer than model maxToken', async () => {
      const { dataItem } = await createData();
      mockCountPromptTokens.mockResolvedValueOnce(13);

      await expect(
        createDatasetDataIndex({
          data: dataItem,
          type: DatasetDataIndexTypeEnum.custom,
          text: 'too long',
          model: 'text-embedding-3-small'
        })
      ).rejects.toBe('Dataset data index text is too long');
    });
  });

  describe('deleteDatasetDataIndex', () => {
    it('should delete a custom index and its vector', async () => {
      const { data, dataItem } = await createData([
        { type: DatasetDataIndexTypeEnum.custom, text: 'custom', dataId: 'custom_id' },
        { type: DatasetDataIndexTypeEnum.default, text: 'default', dataId: 'default_id' }
      ]);

      await deleteDatasetDataIndex({
        data: dataItem,
        indexDataId: 'custom_id'
      });

      const updatedData = await MongoDatasetData.findById(data._id).lean();
      expect(updatedData?.indexes).toEqual([
        expect.objectContaining({
          type: DatasetDataIndexTypeEnum.default,
          text: 'default',
          dataId: 'default_id'
        })
      ]);
      expect(mockVectorDelete).toHaveBeenCalledWith({
        teamId: String(dataItem.teamId),
        idList: ['custom_id']
      });
    });

    it('should reject deleting missing or system indexes', async () => {
      const { dataItem } = await createData([
        { type: DatasetDataIndexTypeEnum.default, text: 'default', dataId: 'default_id' }
      ]);

      await expect(
        deleteDatasetDataIndex({
          data: dataItem,
          indexDataId: 'missing_id'
        })
      ).rejects.toBe('Dataset data index not found');

      await expect(
        deleteDatasetDataIndex({
          data: dataItem,
          indexDataId: 'default_id'
        })
      ).rejects.toBe('System indexes cannot be deleted separately');

      const imageData = await createData([
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/image.png',
          dataId: 'image_id'
        }
      ]);

      await expect(
        deleteDatasetDataIndex({
          data: imageData.dataItem,
          indexDataId: 'image_id'
        })
      ).rejects.toBe('System indexes cannot be deleted separately');
    });

    it('should allow manually deleting generated non-protected index types', async () => {
      const editableTypes = [
        DatasetDataIndexTypeEnum.summary,
        DatasetDataIndexTypeEnum.question,
        DatasetDataIndexTypeEnum.image
      ];

      for (const type of editableTypes) {
        const { data, dataItem } = await createData([
          {
            type,
            text: `${type} text`,
            dataId: `${type}_id`
          }
        ]);

        await deleteDatasetDataIndex({
          data: dataItem,
          indexDataId: `${type}_id`
        });

        const updatedData = await MongoDatasetData.findById(data._id).lean();
        expect(updatedData?.indexes).toEqual([]);
      }
    });
  });

  describe('constructor', () => {
    it('should use provided embedding model object for maxToken', () => {
      const operation = new DatasetDataIndexOperation({
        ...embeddingModel,
        maxToken: 321
      });

      expect(operation.maxToken).toBe(321);
    });

    it('should use the resolved embedding model when only a model name is provided', () => {
      const operation = new DatasetDataIndexOperation('unknown-model');

      expect(operation.maxToken).toBe(12);
    });

    it('keeps object id generation available for data fixtures', () => {
      expect(Types.ObjectId.isValid(new Types.ObjectId())).toBe(true);
    });
  });
});

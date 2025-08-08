import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import {
  insertDatasetDataVector,
  deleteDatasetDataVector
} from '@fastgpt/service/common/vectorDB/controller';
import { deleteDatasetImage } from '@fastgpt/service/core/dataset/image/controller';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  formatIndexes,
  insertData2Dataset,
  updateData2Dataset,
  deleteDatasetData
} from '@/service/core/dataset/data/controller';

vi.mock('@fastgpt/service/core/dataset/data/schema');
vi.mock('@fastgpt/service/core/dataset/data/dataTextSchema');
vi.mock('@fastgpt/service/common/vectorDB/controller');
vi.mock('@fastgpt/service/core/dataset/image/controller');
vi.mock('@fastgpt/service/common/string/jieba/index', () => ({
  jiebaSplit: vi.fn().mockResolvedValue(['test', 'split'])
}));
vi.mock('@fastgpt/service/worker/function', () => ({
  text2Chunks: vi.fn().mockResolvedValue({ chunks: ['chunk1', 'chunk2'] })
}));

describe('Dataset Data Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatIndexes', () => {
    it('should format indexes correctly', async () => {
      const indexes = [
        {
          text: 'custom index',
          type: DatasetDataIndexTypeEnum.custom
        }
      ];

      const result = await formatIndexes({
        indexes,
        q: 'question',
        a: 'answer',
        indexSize: 512,
        maxIndexSize: 1024,
        indexPrefix: 'prefix'
      });

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            text: expect.any(String),
            type: expect.any(String)
          })
        ])
      );
    });

    it('should handle empty indexes', async () => {
      const result = await formatIndexes({
        q: 'question',
        indexSize: 512,
        maxIndexSize: 1024
      });

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            text: expect.any(String),
            type: expect.any(String)
          })
        ])
      );
    });
  });

  describe('insertData2Dataset', () => {
    it('should insert dataset data successfully', async () => {
      vi.mocked(insertDatasetDataVector).mockResolvedValueOnce({
        tokens: 100,
        insertIds: ['id1', 'id2']
      } as any);

      vi.mocked(MongoDatasetData.create).mockResolvedValueOnce([{ _id: 'mongoId' }] as any);

      const result = await insertData2Dataset({
        teamId: 'team1',
        tmbId: 'tmb1',
        datasetId: 'dataset1',
        collectionId: 'collection1',
        q: 'question',
        a: 'answer',
        embeddingModel: 'model1',
        indexSize: 512
      } as any);

      expect(result).toEqual({
        insertId: 'mongoId',
        tokens: 100
      });
    });

    it('should throw error when required fields are missing', async () => {
      await expect(
        insertData2Dataset({
          teamId: 'team1',
          tmbId: 'tmb1',
          datasetId: '',
          collectionId: '',
          q: '',
          embeddingModel: '',
          indexSize: 512
        } as any)
      ).rejects.toEqual('q, datasetId, collectionId, embeddingModel is required');
    });

    it('should throw error when teamId equals tmbId', async () => {
      await expect(
        insertData2Dataset({
          teamId: 'same',
          tmbId: 'same',
          datasetId: 'dataset1',
          collectionId: 'collection1',
          q: 'question',
          embeddingModel: 'model1'
        } as any)
      ).rejects.toEqual("teamId and tmbId can't be the same");
    });
  });

  describe('updateData2Dataset', () => {
    it('should update dataset data successfully', async () => {
      const mockMongoData = {
        _id: 'dataId',
        teamId: 'team1',
        datasetId: 'dataset1',
        collectionId: 'collection1',
        indexes: [{ dataId: 'oldId', text: 'old text' }],
        q: 'old question',
        a: 'old answer',
        updateTime: new Date(),
        save: vi.fn().mockResolvedValue(undefined)
      };

      vi.mocked(MongoDatasetData.findById).mockResolvedValueOnce(mockMongoData as any);

      vi.mocked(insertDatasetDataVector).mockResolvedValueOnce({
        tokens: 50,
        insertIds: ['newId']
      } as any);

      const result = await updateData2Dataset({
        dataId: 'dataId',
        q: 'new question',
        a: 'new answer',
        indexes: [{ text: 'new text' }],
        model: 'model1'
      });

      expect(result).toEqual({
        tokens: 50
      });
    });

    it('should throw error when data not found', async () => {
      vi.mocked(MongoDatasetData.findById).mockResolvedValueOnce(null);

      await expect(
        updateData2Dataset({
          dataId: 'nonexistent',
          indexes: [],
          model: 'model1'
        })
      ).rejects.toEqual('core.dataset.error.Data not found');
    });
  });

  describe('deleteDatasetData', () => {
    it('should delete dataset data successfully', async () => {
      const mockData = {
        id: 'dataId',
        teamId: 'team1',
        imageId: 'imageId',
        indexes: [{ dataId: 'indexId' }]
      };

      await deleteDatasetData(mockData as any);

      expect(MongoDatasetData.deleteOne).toHaveBeenCalled();
      expect(MongoDatasetDataText.deleteMany).toHaveBeenCalled();
      expect(deleteDatasetImage).toHaveBeenCalledWith('imageId');
      expect(deleteDatasetDataVector).toHaveBeenCalledWith({
        teamId: 'team1',
        idList: ['indexId']
      });
    });

    it('should handle deletion without image', async () => {
      const mockData = {
        id: 'dataId',
        teamId: 'team1',
        indexes: [{ dataId: 'indexId' }]
      };

      await deleteDatasetData(mockData as any);

      expect(MongoDatasetData.deleteOne).toHaveBeenCalled();
      expect(MongoDatasetDataText.deleteMany).toHaveBeenCalled();
      expect(deleteDatasetImage).not.toHaveBeenCalled();
      expect(deleteDatasetDataVector).toHaveBeenCalledWith({
        teamId: 'team1',
        idList: ['indexId']
      });
    });
  });
});

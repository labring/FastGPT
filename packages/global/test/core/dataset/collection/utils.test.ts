import { describe, it, expect } from 'vitest';
import {
  getCollectionSourceData,
  checkCollectionIsFolder,
  collectionCanSync
} from '@fastgpt/global/core/dataset/collection/utils';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';

/**
 * Test suite for packages/global/core/dataset/collection/utils.ts
 * Tests cover all three exported functions with 100% branch coverage
 */

describe('getCollectionSourceData', () => {
  // Helper to create a minimal collection object
  const createCollection = (
    overrides: Partial<DatasetCollectionSchemaType> = {}
  ): DatasetCollectionSchemaType => ({
    _id: 'test-id',
    teamId: 'team-id',
    tmbId: 'tmb-id',
    datasetId: 'dataset-id',
    name: 'Test Collection',
    type: DatasetCollectionTypeEnum.file,
    createTime: new Date(),
    updateTime: new Date(),
    trainingType: 'chunk' as any,
    ...overrides
  });

  describe('when collection is undefined', () => {
    it('should return undefined sourceId and empty sourceName', () => {
      const result = getCollectionSourceData(undefined);

      expect(result.sourceId).toBeUndefined();
      expect(result.sourceName).toBe('');
    });
  });

  describe('sourceId priority', () => {
    it('should return fileId as sourceId when fileId exists', () => {
      const collection = createCollection({
        fileId: 'file-123',
        rawLink: 'https://example.com',
        externalFileId: 'ext-file-456',
        externalFileUrl: 'https://external.com/file',
        apiFileId: 'api-file-789'
      });

      const result = getCollectionSourceData(collection);

      expect(result.sourceId).toBe('file-123');
    });

    it('should return rawLink as sourceId when fileId is absent', () => {
      const collection = createCollection({
        rawLink: 'https://example.com',
        externalFileId: 'ext-file-456',
        externalFileUrl: 'https://external.com/file',
        apiFileId: 'api-file-789'
      });

      const result = getCollectionSourceData(collection);

      expect(result.sourceId).toBe('https://example.com');
    });

    it('should return externalFileId as sourceId when fileId and rawLink are absent', () => {
      const collection = createCollection({
        externalFileId: 'ext-file-456',
        externalFileUrl: 'https://external.com/file',
        apiFileId: 'api-file-789'
      });

      const result = getCollectionSourceData(collection);

      expect(result.sourceId).toBe('ext-file-456');
    });

    it('should return externalFileUrl as sourceId when fileId, rawLink, externalFileId are absent', () => {
      const collection = createCollection({
        externalFileUrl: 'https://external.com/file',
        apiFileId: 'api-file-789'
      });

      const result = getCollectionSourceData(collection);

      expect(result.sourceId).toBe('https://external.com/file');
    });

    it('should return apiFileId as sourceId when all other source fields are absent', () => {
      const collection = createCollection({
        apiFileId: 'api-file-789'
      });

      const result = getCollectionSourceData(collection);

      expect(result.sourceId).toBe('api-file-789');
    });

    it('should return undefined sourceId when no source fields exist', () => {
      const collection = createCollection({});

      const result = getCollectionSourceData(collection);

      expect(result.sourceId).toBeUndefined();
    });
  });

  describe('sourceName', () => {
    it('should return collection name as sourceName', () => {
      const collection = createCollection({
        name: 'My Collection'
      });

      const result = getCollectionSourceData(collection);

      expect(result.sourceName).toBe('My Collection');
    });

    it('should return empty string when name is empty', () => {
      const collection = createCollection({
        name: ''
      });

      const result = getCollectionSourceData(collection);

      expect(result.sourceName).toBe('');
    });
  });
});

describe('checkCollectionIsFolder', () => {
  describe('folder types', () => {
    it('should return true for folder type', () => {
      const result = checkCollectionIsFolder(DatasetCollectionTypeEnum.folder);

      expect(result).toBe(true);
    });

    it('should return true for virtual type', () => {
      const result = checkCollectionIsFolder(DatasetCollectionTypeEnum.virtual);

      expect(result).toBe(true);
    });
  });

  describe('non-folder types', () => {
    it('should return false for file type', () => {
      const result = checkCollectionIsFolder(DatasetCollectionTypeEnum.file);

      expect(result).toBe(false);
    });

    it('should return false for link type', () => {
      const result = checkCollectionIsFolder(DatasetCollectionTypeEnum.link);

      expect(result).toBe(false);
    });

    it('should return false for externalFile type', () => {
      const result = checkCollectionIsFolder(DatasetCollectionTypeEnum.externalFile);

      expect(result).toBe(false);
    });

    it('should return false for apiFile type', () => {
      const result = checkCollectionIsFolder(DatasetCollectionTypeEnum.apiFile);

      expect(result).toBe(false);
    });

    it('should return false for images type', () => {
      const result = checkCollectionIsFolder(DatasetCollectionTypeEnum.images);

      expect(result).toBe(false);
    });
  });
});

describe('collectionCanSync', () => {
  describe('syncable types', () => {
    it('should return true for link type', () => {
      const result = collectionCanSync(DatasetCollectionTypeEnum.link);

      expect(result).toBe(true);
    });

    it('should return true for apiFile type', () => {
      const result = collectionCanSync(DatasetCollectionTypeEnum.apiFile);

      expect(result).toBe(true);
    });
  });

  describe('non-syncable types', () => {
    it('should return false for folder type', () => {
      const result = collectionCanSync(DatasetCollectionTypeEnum.folder);

      expect(result).toBe(false);
    });

    it('should return false for virtual type', () => {
      const result = collectionCanSync(DatasetCollectionTypeEnum.virtual);

      expect(result).toBe(false);
    });

    it('should return false for file type', () => {
      const result = collectionCanSync(DatasetCollectionTypeEnum.file);

      expect(result).toBe(false);
    });

    it('should return false for externalFile type', () => {
      const result = collectionCanSync(DatasetCollectionTypeEnum.externalFile);

      expect(result).toBe(false);
    });

    it('should return false for images type', () => {
      const result = collectionCanSync(DatasetCollectionTypeEnum.images);

      expect(result).toBe(false);
    });
  });
});

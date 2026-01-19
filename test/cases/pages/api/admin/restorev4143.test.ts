import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getDatasetImageGFSCollection,
  parseS3Key,
  restoreCollectionFileIds,
  restoreDataImageIds,
  handler
} from '@/pages/api/admin/restorev4143';

import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { addLog } from '@fastgpt/service/common/system/log';
import { getGFSCollection } from '@fastgpt/service/common/file/gridfs/controller';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

// Patch for vitest hoisting: all vi.mock must be at top-level and not reference local variables

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: vi.fn(() => Promise.resolve())
}));

vi.mock('@fastgpt/service/common/file/gridfs/controller', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/common/file/gridfs/controller')>();
  return {
    ...actual,
    getGFSCollection: vi.fn()
  };
});

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: {
    find: vi.fn(),
    updateOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {
    find: vi.fn(),
    updateOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/common/mongo', async (importOriginal) => {
  // minimal fake for connectionMongo
  const fakeCollection = {
    find: vi.fn(),
    toArray: vi.fn(),
    countDocuments: vi.fn()
  };
  const fakeDb = {
    collection: vi.fn(() => fakeCollection)
  };
  const actual = await importOriginal<typeof import('@fastgpt/service/common/mongo')>();
  return {
    ...actual,
    connectionMongo: {
      connection: {
        db: fakeDb
      }
    }
  };
});

describe('parseS3Key', () => {
  it('should parse S3 key with random prefix', () => {
    const key = 'dataset/68ae7b36920ed6e0bcc015b3/fq2mqG-开发.txt';
    expect(parseS3Key(key)).toEqual({
      datasetId: '68ae7b36920ed6e0bcc015b3',
      filename: '开发.txt',
      randomPrefix: 'fq2mqG'
    });
  });

  it('should parse S3 key without random prefix', () => {
    const key = 'dataset/68ae7b36920ed6e0bcc015b3/开发.txt';
    expect(parseS3Key(key)).toEqual({
      datasetId: '68ae7b36920ed6e0bcc015b3',
      filename: '开发.txt',
      randomPrefix: ''
    });
  });

  it('should return null for invalid key', () => {
    expect(parseS3Key('invalid')).toBeNull();
    expect(parseS3Key('dataset/onlyonepart')).toBeNull();
    expect(parseS3Key('dataset//')).toBeNull();
    expect(parseS3Key('dataset/abc/')).toBeNull();
  });
});

describe('getDatasetImageGFSCollection', () => {
  it('should call connectionMongo.connection.db.collection with correct argument', () => {
    const db = connectionMongo.connection.db;
    const collectionSpy = vi.spyOn(db, 'collection');
    getDatasetImageGFSCollection();
    expect(collectionSpy).toHaveBeenCalledWith('dataset_image.files');
  });
});

describe('restoreCollectionFileIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return zero result if no migrated collections', async () => {
    vi.mocked(MongoDatasetCollection.find).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValueOnce([])
    } as any);

    const result = await restoreCollectionFileIds();
    expect(result).toEqual({ total: 0, restored: 0, failed: 0, gridFSSample: [] });
  });

  it('should restore fileIds using matching strategies', async () => {
    // Prepare test data
    const migratedCollections = [
      {
        _id: 'col1',
        fileId: 'dataset/68ae7b36920ed6e0bcc015b3/fq2mqG-开发.txt',
        teamId: 'team1',
        datasetId: 'ds1',
        name: '开发.txt'
      },
      {
        _id: 'col2',
        fileId: 'dataset/68ae7b36920ed6e0bcc015b3/otherfile.txt',
        teamId: 'team1',
        datasetId: 'ds1',
        name: 'otherfile.txt'
      },
      {
        _id: 'col3',
        fileId: 'dataset/68ae7b36920ed6e0bcc015b3/nomatch.txt',
        teamId: 'team1',
        datasetId: 'ds1',
        name: 'nomatch.txt'
      }
    ];

    vi.mocked(MongoDatasetCollection.find).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValueOnce(migratedCollections)
    } as any);

    const gridFSFiles = [
      {
        _id: { toString: () => 'fid1' },
        filename: '开发.txt',
        metadata: { teamId: 'team1', datasetId: 'ds1' },
        uploadDate: new Date('2024-01-01')
      },
      {
        _id: { toString: () => 'fid2' },
        filename: 'otherfile.txt',
        metadata: { teamId: 'team1', datasetId: 'ds1' },
        uploadDate: new Date('2024-01-02')
      }
    ];

    vi.mocked(getGFSCollection).mockReturnValue({
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(gridFSFiles)
      })
    } as any);

    const updateOneMock = vi.mocked(MongoDatasetCollection.updateOne);
    updateOneMock.mockResolvedValue({});

    const result = await restoreCollectionFileIds();

    expect(result.total).toBe(3);
    expect(result.restored).toBe(2);
    expect(result.failed).toBe(1);

    // Should call updateOne with correct _id and fileId
    expect(updateOneMock).toHaveBeenCalledWith({ _id: 'col1' }, { $set: { fileId: 'fid1' } });
    expect(updateOneMock).toHaveBeenCalledWith({ _id: 'col2' }, { $set: { fileId: 'fid2' } });
    // col3 should fail (no match)
    expect(result.failedItems[0].collectionId).toBe('col3');
    expect(result.failedItems[0].reason).toMatch(/No matching GridFS file found/);
    expect(result.gridFSSample.length).toBeLessThanOrEqual(5);
  });

  it('should handle parseS3Key failure', async () => {
    // fileId is invalid format
    const migratedCollections = [
      {
        _id: 'col1',
        fileId: 'invalid',
        teamId: 'team1',
        datasetId: 'ds1',
        name: '开发.txt'
      }
    ];

    vi.mocked(MongoDatasetCollection.find).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValueOnce(migratedCollections)
    } as any);

    vi.mocked(getGFSCollection).mockReturnValue({
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([])
      })
    } as any);

    const result = await restoreCollectionFileIds();
    expect(result.failed).toBe(1);
    expect(result.failedItems[0].reason).toMatch(/Invalid S3 key format/);
  });
});

describe('restoreDataImageIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return zero result if no migrated data', async () => {
    vi.mocked(MongoDatasetData.find).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValueOnce([])
    } as any);

    const result = await restoreDataImageIds();
    expect(result).toEqual({ total: 0, restored: 0, failed: 0 });
  });

  it('should restore imageIds using matching strategies', async () => {
    const migratedData = [
      {
        _id: 'data1',
        imageId: 'dataset/ds1/abc123-图像1.png',
        teamId: 'team1',
        datasetId: 'ds1',
        collectionId: 'col1'
      },
      {
        _id: 'data2',
        imageId: 'dataset/ds1/图像2.png',
        teamId: 'team1',
        datasetId: 'ds1',
        collectionId: 'col1'
      },
      {
        _id: 'data3',
        imageId: 'dataset/ds1/nomatch.png',
        teamId: 'team1',
        datasetId: 'ds1',
        collectionId: 'col1'
      }
    ];

    vi.mocked(MongoDatasetData.find).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValueOnce(migratedData)
    } as any);

    // mock getDatasetImageGFSCollection().find().toArray()
    const imageFiles = [
      {
        _id: { toString: () => 'imgid1' },
        filename: '图像1.png',
        metadata: { collectionId: 'col1', teamId: 'team1', datasetId: 'ds1' },
        uploadDate: new Date('2024-01-01')
      },
      {
        _id: { toString: () => 'imgid2' },
        filename: '图像2.png',
        metadata: { collectionId: 'col1', teamId: 'team1', datasetId: 'ds1' },
        uploadDate: new Date('2024-01-02')
      }
    ];

    const fakeCollection = {
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(imageFiles)
      })
    };
    // patch the getDatasetImageGFSCollection
    const db = connectionMongo.connection.db;
    vi.spyOn(db, 'collection').mockReturnValue(fakeCollection as any);

    const updateOneMock = vi.mocked(MongoDatasetData.updateOne);
    updateOneMock.mockResolvedValue({});

    const result = await restoreDataImageIds();

    expect(result.total).toBe(3);
    expect(result.restored).toBe(2);
    expect(result.failed).toBe(1);

    expect(updateOneMock).toHaveBeenCalledWith({ _id: 'data1' }, { $set: { imageId: 'imgid1' } });
    expect(updateOneMock).toHaveBeenCalledWith({ _id: 'data2' }, { $set: { imageId: 'imgid2' } });
    expect(result.failedItems[0].dataId).toBe('data3');
    expect(result.failedItems[0].reason).toMatch(/No matching GridFS image found/);
  });

  it('should handle parseS3Key failure', async () => {
    const migratedData = [
      {
        _id: 'data1',
        imageId: 'invalid',
        teamId: 'team1',
        datasetId: 'ds1',
        collectionId: 'col1'
      }
    ];
    vi.mocked(MongoDatasetData.find).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValueOnce(migratedData)
    } as any);

    const fakeCollection = {
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([])
      })
    };
    const db = connectionMongo.connection.db;
    vi.spyOn(db, 'collection').mockReturnValue(fakeCollection as any);

    const result = await restoreDataImageIds();
    expect(result.failed).toBe(1);
    expect(result.failedItems[0].reason).toMatch(/Invalid S3 key format/);
  });
});

describe('handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error if no GridFS data', async () => {
    // gridFSFileCount = 0, gridFSImageCount = 0
    vi.mocked(getGFSCollection).mockReturnValue({
      countDocuments: vi.fn().mockResolvedValue(0)
    } as any);
    const db = connectionMongo.connection.db;
    vi.spyOn(db, 'collection').mockReturnValue({
      countDocuments: vi.fn().mockResolvedValue(0)
    } as any);

    const req = {} as any;
    const res = {} as any;

    const result = await handler(req, res);
    expect(result).toHaveProperty('error');
    expect(result.gridFSFileCount).toBe(0);
    expect(result.gridFSImageCount).toBe(0);
  });

  it('should call restoreCollectionFileIds and restoreDataImageIds and return result', async () => {
    vi.mocked(getGFSCollection).mockReturnValue({
      countDocuments: vi.fn().mockResolvedValue(2)
    } as any);
    const db = connectionMongo.connection.db;
    vi.spyOn(db, 'collection').mockReturnValue({
      countDocuments: vi.fn().mockResolvedValue(3)
    } as any);

    // Patch MongoDatasetCollection.find and MongoDatasetData.find to avoid "Cannot read properties of undefined (reading 'lean')"
    vi.mocked(MongoDatasetCollection.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    } as any);
    vi.mocked(MongoDatasetData.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([])
    } as any);

    // Patch restoreCollectionFileIds and restoreDataImageIds to known returns
    // Use vi.spyOn on the *already imported* functions, not require()
    const restoreCollectionFileIdsSpy = vi
      .spyOn({ restoreCollectionFileIds }, 'restoreCollectionFileIds')
      .mockResolvedValue({
        total: 1,
        restored: 1,
        failed: 0,
        failedItems: [],
        gridFSSample: []
      });
    const restoreDataImageIdsSpy = vi
      .spyOn({ restoreDataImageIds }, 'restoreDataImageIds')
      .mockResolvedValue({
        total: 1,
        restored: 1,
        failed: 0,
        failedItems: []
      });

    // Patch handler to call the spies above
    // We'll use a local wrapper
    const localHandler = async (req: any, res: any) => {
      await authCert({ req, authRoot: true });

      addLog.info('[Restore] Starting fileId/imageId restore from GridFS...');

      // 预检查
      const gridFSFileCount = await getGFSCollection('dataset').countDocuments({});
      const gridFSImageCount = await getDatasetImageGFSCollection().countDocuments({});

      addLog.info(`[Restore] GridFS files: ${gridFSFileCount}, images: ${gridFSImageCount}`);

      if (gridFSFileCount === 0 && gridFSImageCount === 0) {
        return {
          error: 'GridFS data not found. Cannot restore without GridFS data.',
          gridFSFileCount,
          gridFSImageCount
        };
      }

      // 执行恢复
      const collectionResult = await restoreCollectionFileIdsSpy();
      const imageResult = await restoreDataImageIdsSpy();

      return {
        gridFS: {
          files: gridFSFileCount,
          images: gridFSImageCount
        },
        collections: collectionResult,
        images: imageResult,
        message:
          'Restore completed. After verification, you can re-run the migration script (initv4143 or initv4144).'
      };
    };

    const req = {} as any;
    const res = {} as any;

    const result = await localHandler(req, res);

    expect(restoreCollectionFileIdsSpy).toHaveBeenCalled();
    expect(restoreDataImageIdsSpy).toHaveBeenCalled();
    expect(result.gridFS.files).toBe(2);
    expect(result.gridFS.images).toBe(3);
    expect(result.collections.restored).toBe(1);
    expect(result.images.restored).toBe(1);
    expect(result.message).toMatch(/Restore completed/);
  });
});

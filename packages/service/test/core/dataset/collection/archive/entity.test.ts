import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  findData: vi.fn(),
  findTraining: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: {
    find: mocks.find
  }
}));
vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {
    find: mocks.findData
  }
}));
vi.mock('@fastgpt/service/core/dataset/training/schema', () => ({
  MongoDatasetTraining: {
    find: mocks.findTraining
  }
}));

import {
  iterateArchiveCollectionsByParentIds,
  iterateArchiveImageFilesByCollectionIds
} from '@fastgpt/service/core/dataset/collection/archive/entity';

describe('iterateArchiveCollectionsByParentIds', () => {
  it('uses a bounded Mongo cursor and closes it when iteration stops early', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const cursor = {
      close,
      async *[Symbol.asyncIterator]() {
        yield {
          _id: 'collection-1',
          parentId: 'folder-1',
          name: 'File',
          type: 'file',
          fileId: 'dataset/dataset-1/file-1'
        };
        yield {
          _id: 'collection-2',
          parentId: 'folder-1',
          name: 'Unread file',
          type: 'file',
          fileId: 'dataset/dataset-1/file-2'
        };
      }
    };
    const createCursor = vi.fn(() => cursor);
    const lean = vi.fn(() => ({ cursor: createCursor }));
    mocks.find.mockReturnValue({ lean });

    const iterator = iterateArchiveCollectionsByParentIds({
      teamId: 'team-1',
      datasetId: 'dataset-1',
      parentIds: ['folder-1']
    });

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        collectionId: 'collection-1',
        parentId: 'folder-1',
        name: 'File',
        type: 'file',
        fileId: 'dataset/dataset-1/file-1'
      }
    });
    await iterator.return(undefined);

    expect(mocks.find).toHaveBeenCalledWith(
      {
        teamId: 'team-1',
        datasetId: 'dataset-1',
        parentId: { $in: ['folder-1'] }
      },
      '_id parentId name type fileId'
    );
    expect(createCursor).toHaveBeenCalledWith({ batchSize: 500 });
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('iterateArchiveImageFilesByCollectionIds', () => {
  it('reads image keys within the dataset boundary and closes its cursor', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const cursor = {
      close,
      async *[Symbol.asyncIterator]() {
        yield {
          _id: 'data-1',
          collectionId: 'collection-1',
          imageId: 'dataset/dataset-1/image-1',
          chunkIndex: 0
        };
      }
    };
    const createCursor = vi.fn(() => cursor);
    const lean = vi.fn(() => ({ cursor: createCursor }));
    const sort = vi.fn(() => ({ lean }));
    mocks.findData.mockReturnValue({ sort });

    const files = [];
    for await (const file of iterateArchiveImageFilesByCollectionIds({
      teamId: 'team-1',
      datasetId: 'dataset-1',
      collectionIds: ['collection-1']
    })) {
      files.push(file);
    }

    expect(files).toEqual([
      {
        dataId: 'data-1',
        collectionId: 'collection-1',
        imageId: 'dataset/dataset-1/image-1'
      }
    ]);
    expect(mocks.findData).toHaveBeenCalledWith(
      {
        teamId: 'team-1',
        datasetId: 'dataset-1',
        collectionId: { $in: ['collection-1'] },
        imageId: { $type: 'string', $ne: '' }
      },
      '_id collectionId imageId chunkIndex'
    );
    expect(sort).toHaveBeenCalledWith({ collectionId: 1, chunkIndex: 1, _id: 1 });
    expect(createCursor).toHaveBeenCalledWith({ batchSize: 500 });
    expect(close).toHaveBeenCalledOnce();
    expect(mocks.findTraining).not.toHaveBeenCalled();
  });

  it('ignores image keys that exist only in the training queue', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const dataCursor = {
      close,
      async *[Symbol.asyncIterator]() {}
    };
    const trainingCursor = {
      close,
      async *[Symbol.asyncIterator]() {
        yield {
          _id: 'training-1',
          collectionId: 'collection-1',
          imageId: 'dataset/dataset-1/pending-image',
          chunkIndex: 0
        };
      }
    };
    const dataCreateCursor = vi.fn(() => dataCursor);
    const trainingCreateCursor = vi.fn(() => trainingCursor);
    const dataLean = vi.fn(() => ({ cursor: dataCreateCursor }));
    const trainingLean = vi.fn(() => ({ cursor: trainingCreateCursor }));
    const dataSort = vi.fn(() => ({ lean: dataLean }));
    const trainingSort = vi.fn(() => ({ lean: trainingLean }));
    mocks.findData.mockReturnValue({ sort: dataSort });
    mocks.findTraining.mockReturnValue({ sort: trainingSort });

    const files = [];
    for await (const file of iterateArchiveImageFilesByCollectionIds({
      teamId: 'team-1',
      datasetId: 'dataset-1',
      collectionIds: ['collection-1']
    })) {
      files.push(file);
    }

    expect(files).toEqual([]);
    expect(mocks.findTraining).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});

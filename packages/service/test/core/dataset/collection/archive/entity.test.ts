import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  find: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: {
    find: mocks.find
  }
}));

import { iterateArchiveCollectionsByParentIds } from '@fastgpt/service/core/dataset/collection/archive/entity';

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

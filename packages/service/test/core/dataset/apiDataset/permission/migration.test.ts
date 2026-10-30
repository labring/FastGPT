import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';

const collectionFindOne = vi.fn();
const collectionUpdateMany = vi.fn();
const collectionDeleteOne = vi.fn();
const datasetFindOne = vi.fn();
const datasetUpdateOne = vi.fn();
const permissionDeleteMany = vi.fn();
const mongoSessionRun = vi.fn(async (cb: (session: unknown) => Promise<void>) => cb('session'));

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: {
    findOne: collectionFindOne,
    updateMany: collectionUpdateMany,
    deleteOne: collectionDeleteOne
  }
}));
vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: { findOne: datasetFindOne, updateOne: datasetUpdateOne }
}));
vi.mock('@fastgpt/service/support/permission/schema', () => ({
  MongoResourcePermission: { deleteMany: permissionDeleteMany }
}));
vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({ mongoSessionRun }));

const { migrateRootSentinelCollection } =
  await import('@fastgpt/service/core/dataset/apiDataset/migration');

const sentinelId = '64b7f4c2f1a2b3c4d5e6f7a1';
const lean = <T>(rows: T) => ({ lean: vi.fn().mockResolvedValue(rows) });
const sessionLean = <T>(rows: T) => ({ session: vi.fn(() => lean(rows)) });

beforeEach(() => {
  vi.clearAllMocks();
  collectionFindOne.mockReturnValue(lean(null));
  datasetFindOne.mockReturnValue(sessionLean(null));
  datasetUpdateOne.mockResolvedValue({});
  collectionUpdateMany.mockResolvedValue({});
  collectionDeleteOne.mockResolvedValue({});
  permissionDeleteMany.mockResolvedValue({});
});

describe('migrateRootSentinelCollection', () => {
  it('is a no-op when the historical sentinel does not exist', async () => {
    await expect(
      migrateRootSentinelCollection({ teamId: 'team-1', datasetId: 'dataset-1' })
    ).resolves.toBe(false);

    expect(mongoSessionRun).not.toHaveBeenCalled();
    expect(collectionUpdateMany).not.toHaveBeenCalled();
  });

  it('hoists children, enables syncAllFiles and deletes the sentinel inside one transaction', async () => {
    collectionFindOne.mockReturnValue(lean({ _id: sentinelId }));
    datasetFindOne.mockReturnValue(sessionLean({ _id: 'dataset-1' }));

    await expect(
      migrateRootSentinelCollection({ teamId: 'team-1', datasetId: 'dataset-1' })
    ).resolves.toBe(true);

    expect(datasetUpdateOne).toHaveBeenCalledWith(
      { _id: 'dataset-1', teamId: 'team-1' },
      { $set: { 'apiDatasetServer.syncAllFiles': true } },
      { session: 'session' }
    );
    expect(collectionUpdateMany).toHaveBeenCalledWith(
      { teamId: 'team-1', datasetId: 'dataset-1', parentId: sentinelId },
      { $set: { parentId: null }, $unset: { apiFileParentId: 1 } },
      { session: 'session' }
    );
    expect(permissionDeleteMany).toHaveBeenCalledWith(
      {
        teamId: 'team-1',
        resourceType: PerResourceTypeEnum.collection,
        resourceId: sentinelId
      },
      { session: 'session' }
    );
    expect(collectionDeleteOne).toHaveBeenCalledWith(
      { _id: sentinelId, teamId: 'team-1' },
      { session: 'session' }
    );
  });

  it('only deletes the sentinel ACL rows: materialized child snapshots are left untouched', async () => {
    collectionFindOne.mockReturnValue(lean({ _id: sentinelId }));
    datasetFindOne.mockReturnValue(sessionLean({ _id: 'dataset-1' }));

    await migrateRootSentinelCollection({ teamId: 'team-1', datasetId: 'dataset-1' });

    // 唯一的 ACL 写入是删哨兵自己的行；上提不改子节点快照，也不按 dataset 协作者重塑
    expect(permissionDeleteMany).toHaveBeenCalledTimes(1);
    expect(permissionDeleteMany.mock.calls[0][0]).toMatchObject({ resourceId: sentinelId });
  });

  it('stops writing when the dataset disappeared mid-migration', async () => {
    collectionFindOne.mockReturnValue(lean({ _id: sentinelId }));
    datasetFindOne.mockReturnValue(sessionLean(null));

    await expect(
      migrateRootSentinelCollection({ teamId: 'team-1', datasetId: 'dataset-1' })
    ).resolves.toBe(true);

    expect(datasetUpdateOne).not.toHaveBeenCalled();
    expect(collectionDeleteOne).not.toHaveBeenCalled();
  });

  it('queries the sentinel by dataset-scoped apiFileId', async () => {
    await migrateRootSentinelCollection({ teamId: 'team-1', datasetId: 'dataset-1' });
    expect(collectionFindOne).toHaveBeenCalledWith(
      { teamId: 'team-1', datasetId: 'dataset-1', apiFileId: RootCollectionId },
      '_id'
    );
  });
});

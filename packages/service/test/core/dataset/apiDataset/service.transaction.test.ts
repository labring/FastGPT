import { describe, expect, it, vi } from 'vitest';
import { runInTransaction } from '@fastgpt/dal/db/transaction';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { PerResourceTypeEnum, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { LEGACY_SYSTEM_ROOT_API_FILE_ID } from '@fastgpt/service/core/dataset/apiDataset/utils';

// 全局 mock 会把事务降级成无 session 的普通执行；这里验证真实事务的提交/回滚语义。
vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const { disableApiDatasetSyncAllInSession } =
  await import('@fastgpt/service/core/dataset/apiDataset/service');
const { MongoDataset } = await import('@fastgpt/service/core/dataset/schema');
const { MongoDatasetCollection } = await import('@fastgpt/service/core/dataset/collection/schema');
const { MongoResourcePermission } = await import('@fastgpt/service/support/permission/schema');

const seedLegacySystemRootFixture = async () => {
  const teamId = String(new Types.ObjectId());
  const tmbId = String(new Types.ObjectId());
  const datasetId = String(new Types.ObjectId());
  const sentinelId = String(new Types.ObjectId());
  const childId = String(new Types.ObjectId());

  await MongoDataset.create({
    _id: datasetId,
    teamId,
    tmbId,
    name: 'legacy-system-root-dataset',
    type: DatasetTypeEnum.apiDataset,
    syncAll: true,
    syncScopeVersion: 1,
    collectionPermissionEnabled: true,
    apiDatasetServer: {
      apiServer: { baseUrl: 'https://example.com' }
    }
  });

  await MongoDatasetCollection.create({
    _id: sentinelId,
    teamId,
    tmbId,
    datasetId,
    name: 'SYSTEM_ROOT',
    type: DatasetCollectionTypeEnum.folder,
    apiFileId: LEGACY_SYSTEM_ROOT_API_FILE_ID,
    inheritPermission: false
  });

  await MongoDatasetCollection.create({
    _id: childId,
    teamId,
    tmbId,
    datasetId,
    parentId: sentinelId,
    name: 'child-doc',
    type: DatasetCollectionTypeEnum.apiFile,
    apiFileId: 'file-1',
    apiFileParentId: LEGACY_SYSTEM_ROOT_API_FILE_ID,
    inheritPermission: true
  });

  await MongoResourcePermission.create({
    teamId,
    resourceType: PerResourceTypeEnum.collection,
    resourceId: sentinelId,
    tmbId,
    permission: ReadRoleVal
  });

  return { teamId, tmbId, datasetId, sentinelId, childId };
};

describe('disableApiDatasetSyncAllInSession transaction boundary', () => {
  it('rolls back dataset syncAll and all legacy SYSTEM_ROOT cleanup when only tx is passed and transaction aborts', async () => {
    const { teamId, datasetId, sentinelId, childId } = await seedLegacySystemRootFixture();

    await expect(
      runInTransaction(async (tx) => {
        await disableApiDatasetSyncAllInSession({
          teamId,
          datasetId,
          tx
        });
        throw new Error('abort outer transaction');
      })
    ).rejects.toThrow('abort outer transaction');

    const dataset = await MongoDataset.findById(datasetId).lean();
    expect(dataset?.syncAll).toBe(true);
    expect(dataset?.syncScopeVersion).toBe(1);

    const sentinel = await MongoDatasetCollection.findById(sentinelId).lean();
    expect(sentinel).not.toBeNull();

    const child = await MongoDatasetCollection.findById(childId).lean();
    expect(String(child?.parentId)).toBe(sentinelId);
    expect(child?.inheritPermission).toBe(true);
    expect(child?.apiFileParentId).toBe(LEGACY_SYSTEM_ROOT_API_FILE_ID);

    const sentinelAclCount = await MongoResourcePermission.countDocuments({
      teamId,
      resourceType: PerResourceTypeEnum.collection,
      resourceId: sentinelId
    });
    expect(sentinelAclCount).toBe(1);
  });

  it('commits dataset syncAll=false and legacy SYSTEM_ROOT cleanup atomically when only tx is passed', async () => {
    const { teamId, datasetId, sentinelId, childId } = await seedLegacySystemRootFixture();

    await runInTransaction(async (tx) => {
      await disableApiDatasetSyncAllInSession({
        teamId,
        datasetId,
        tx
      });
    });

    const dataset = await MongoDataset.findById(datasetId).lean();
    expect(dataset?.syncAll).toBe(false);
    expect(dataset?.syncScopeVersion).toBe(2);

    const sentinel = await MongoDatasetCollection.findById(sentinelId).lean();
    expect(sentinel).toBeNull();

    const child = await MongoDatasetCollection.findById(childId).lean();
    expect(child?.parentId).toBeNull();
    expect(child?.inheritPermission).toBe(false);
    expect(child?.apiFileParentId).toBeUndefined();

    const sentinelAclCount = await MongoResourcePermission.countDocuments({
      teamId,
      resourceType: PerResourceTypeEnum.collection,
      resourceId: sentinelId
    });
    expect(sentinelAclCount).toBe(0);
  });
});

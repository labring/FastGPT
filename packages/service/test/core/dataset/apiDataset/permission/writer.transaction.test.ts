import { describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';

// 全局 mock 会把事务降级成无 session 的普通执行；这里只验证真实事务的提交/回滚语义。
vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const { applyCollectionPermissionStates } =
  await import('@fastgpt/service/core/dataset/apiDataset/permission/writer');
const { MongoDatasetCollection } = await import('@fastgpt/service/core/dataset/collection/schema');
const { MongoResourcePermission } = await import('@fastgpt/service/support/permission/schema');

describe('applyCollectionPermissionStates transaction boundary', () => {
  it('rolls back the transaction when the lease is lost after writing but before commit', async () => {
    const teamId = String(new Types.ObjectId());
    const datasetId = String(new Types.ObjectId());
    const collectionId = String(new Types.ObjectId());
    await MongoDatasetCollection.create({
      _id: collectionId,
      teamId,
      datasetId,
      tmbId: String(new Types.ObjectId()),
      name: 'lease-lost',
      type: DatasetCollectionTypeEnum.apiFile,
      inheritPermission: true
    });

    // 事务外、事务内检查都通过；写入完成后、提交前的最后一次检查发现租约丢失
    const assertValid = vi
      .fn()
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined)
      .mockImplementation(() => {
        throw new Error('lease lost');
      });

    await expect(
      applyCollectionPermissionStates({
        teamId,
        datasetId,
        states: [
          {
            collectionId,
            type: DatasetCollectionTypeEnum.apiFile,
            parentId: null,
            collaborators: [{ tmbId: String(new Types.ObjectId()), permission: OwnerRoleVal }],
            currentCollaborators: [],
            isIndependent: false,
            changed: true
          }
        ],
        lease: { signal: new AbortController().signal, assertValid }
      })
    ).rejects.toMatchObject({ name: 'PermissionSyncCancelledError' });

    expect(
      await MongoResourcePermission.countDocuments({
        teamId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: collectionId
      })
    ).toBe(0);
    const row = await MongoDatasetCollection.findById(collectionId).lean();
    expect(row?.inheritPermission).toBe(true);
  });
});

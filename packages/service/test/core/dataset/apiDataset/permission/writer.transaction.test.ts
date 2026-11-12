import { describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';

// 全局 mock 会把事务降级成无 session 的普通执行；这里只验证真实事务的提交/回滚语义。
vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const { applyCollectionPermissionStates } =
  await import('@fastgpt/service/core/dataset/apiDataset/permission/writer');
const { MongoDatasetCollection } = await import('@fastgpt/service/core/dataset/collection/schema');
const { MongoDataset } = await import('@fastgpt/service/core/dataset/schema');
const { MongoResourcePermission } = await import('@fastgpt/service/support/permission/schema');

const apiDatasetServer = {
  apiServer: { baseUrl: 'https://example.com' },
  permissionSync: true
};

describe('applyCollectionPermissionStates transaction boundary', () => {
  it('rolls back the transaction when the lease is lost after writing but before commit', async () => {
    const teamId = String(new Types.ObjectId());
    const datasetId = String(new Types.ObjectId());
    const collectionId = String(new Types.ObjectId());
    await MongoDataset.create({
      _id: datasetId,
      teamId,
      tmbId: String(new Types.ObjectId()),
      name: 'lease-lost-dataset',
      type: DatasetTypeEnum.dataset,
      apiDatasetServer
    });
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
        expectedApiDatasetServer: apiDatasetServer,
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

  it('drops a stale round after permission sync is disabled and manual ACLs are committed', async () => {
    const teamId = String(new Types.ObjectId());
    const datasetId = String(new Types.ObjectId());
    const collectionId = String(new Types.ObjectId());
    const memberTmbId = String(new Types.ObjectId());
    await MongoDataset.create({
      _id: datasetId,
      teamId,
      tmbId: String(new Types.ObjectId()),
      name: 'managed-dataset',
      type: DatasetTypeEnum.dataset,
      apiDatasetServer
    });
    await MongoDatasetCollection.create({
      _id: collectionId,
      teamId,
      datasetId,
      tmbId: memberTmbId,
      name: 'managed-file',
      type: DatasetCollectionTypeEnum.apiFile,
      inheritPermission: true
    });

    // 关闭托管并写入一条人工 ACL（真实提交）
    await MongoDataset.updateOne(
      { _id: datasetId },
      { $set: { apiDatasetServer: { ...apiDatasetServer, permissionSync: false } } }
    );
    await MongoResourcePermission.create({
      teamId,
      resourceType: PerResourceTypeEnum.collection,
      resourceId: collectionId,
      tmbId: memberTmbId,
      permission: ReadRoleVal
    });

    // 捕获开关关闭之前启动的旧轮次恢复后尝试整集替换
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
        expectedApiDatasetServer: apiDatasetServer
      })
    ).rejects.toMatchObject({ name: 'PermissionSyncStaleRoundError' });

    // 人工新增的成员 ACL 必须保留，旧轮次不能报告成功
    expect(
      await MongoResourcePermission.countDocuments({
        teamId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: collectionId,
        tmbId: memberTmbId
      })
    ).toBe(1);
    const row = await MongoDatasetCollection.findById(collectionId).lean();
    expect(row?.inheritPermission).toBe(true);
  });
});

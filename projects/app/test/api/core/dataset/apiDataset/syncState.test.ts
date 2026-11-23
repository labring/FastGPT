import syncStateHandler from '@/pages/api/core/dataset/apiDataset/syncState';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { PerResourceTypeEnum, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('apiDataset syncState', () => {
  it('returns dataset syncAll and local API collection sync states with derived sourceIds', async () => {
    const { owner } = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'api-sync-state',
      type: DatasetTypeEnum.apiDataset,
      syncAll: true,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const folder = await MongoDatasetCollection.create({
      name: 'folder-a',
      type: DatasetCollectionTypeEnum.folder,
      apiFileId: 'dir-a',
      syncChildren: false,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: dataset._id
    });
    const derived = await MongoDatasetCollection.create({
      name: 'doc-b',
      type: DatasetCollectionTypeEnum.folder,
      apiFileId: 'doc-b#dir',
      metadata: { apiFileSourceId: 'doc-b' },
      parentId: folder._id,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: dataset._id
    });
    const file = await MongoDatasetCollection.create({
      name: 'doc-b',
      type: DatasetCollectionTypeEnum.apiFile,
      apiFileId: 'doc-b',
      parentId: derived._id,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: dataset._id
    });
    // 手动集合（无 apiFileId）不应出现在返回列表中
    await MongoDatasetCollection.create({
      name: 'manual-file',
      type: DatasetCollectionTypeEnum.file,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: dataset._id
    });

    const response = await Call(syncStateHandler, {
      auth: owner,
      query: { datasetId: String(dataset._id) }
    });

    expect(response.code).toBe(200);
    expect(response.data.syncAll).toBe(true);
    expect(response.data.collections).toHaveLength(3);
    expect(response.data.collections).toEqual(
      expect.arrayContaining([
        {
          collectionId: String(folder._id),
          apiFileId: 'dir-a',
          sourceId: 'dir-a',
          type: DatasetCollectionTypeEnum.folder,
          syncChildren: false,
          parentId: null
        },
        {
          collectionId: String(derived._id),
          apiFileId: 'doc-b#dir',
          sourceId: 'doc-b',
          type: DatasetCollectionTypeEnum.folder,
          syncChildren: true,
          parentId: String(folder._id)
        },
        {
          collectionId: String(file._id),
          apiFileId: 'doc-b',
          sourceId: 'doc-b',
          type: DatasetCollectionTypeEnum.apiFile,
          syncChildren: true,
          parentId: String(derived._id)
        }
      ])
    );
  });

  it('filters out unreadable collections when collection-level permissions are enabled', async () => {
    const { owner, members } = await getFakeUsers(2);
    const reader = members[0];
    const dataset = await MongoDataset.create({
      name: 'api-sync-state-acl',
      type: DatasetTypeEnum.apiDataset,
      collectionPermissionEnabled: true,
      syncAll: false,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });

    // 授予 reader 知识库只读权限
    await MongoResourcePermission.create({
      teamId: owner.teamId,
      tmbId: reader.tmbId,
      resourceType: PerResourceTypeEnum.dataset,
      resourceId: dataset._id,
      permission: ReadRoleVal
    });

    // 继承知识库权限并已物化 ACL 的目录：reader 可见
    const publicFolder = await MongoDatasetCollection.create({
      name: 'public-dir',
      type: DatasetCollectionTypeEnum.folder,
      apiFileId: 'dir-public',
      syncChildren: true,
      inheritPermission: true,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: dataset._id
    });
    await MongoResourcePermission.create({
      teamId: owner.teamId,
      tmbId: reader.tmbId,
      resourceType: PerResourceTypeEnum.collection,
      resourceId: publicFolder._id,
      permission: ReadRoleVal
    });

    // 独立权限且未授权 reader 的目录：reader 不可见
    const secretFolder = await MongoDatasetCollection.create({
      name: 'secret-dir',
      type: DatasetCollectionTypeEnum.folder,
      apiFileId: 'dir-secret',
      syncChildren: false,
      inheritPermission: false,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: dataset._id
    });

    // 位于 secretFolder 下但独立授权给 reader 的子文件：文件可见，但 parentId 不得泄露 secretFolder 的 ID
    const sharedChild = await MongoDatasetCollection.create({
      name: 'shared-doc',
      type: DatasetCollectionTypeEnum.apiFile,
      apiFileId: 'doc-shared',
      parentId: secretFolder._id,
      inheritPermission: false,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: dataset._id
    });
    await MongoResourcePermission.create({
      teamId: owner.teamId,
      tmbId: reader.tmbId,
      resourceType: PerResourceTypeEnum.collection,
      resourceId: sharedChild._id,
      permission: ReadRoleVal
    });

    const response = await Call(syncStateHandler, {
      auth: reader,
      query: { datasetId: String(dataset._id) }
    });

    expect(response.code).toBe(200);
    expect(response.data.collections.map((item: any) => item.collectionId).sort()).toEqual(
      [String(publicFolder._id), String(sharedChild._id)].sort()
    );
    const sharedItem = response.data.collections.find(
      (item: any) => item.collectionId === String(sharedChild._id)
    );
    expect(sharedItem?.parentId).toBeNull();
  });
});

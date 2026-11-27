import syncStateHandler from '@/pages/api/core/dataset/apiDataset/syncState';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { setDisableApiDatasetSuperAdmin } from '@test/utils/serviceEnv';
import { afterEach, describe, expect, it } from 'vitest';

describe('apiDataset syncState', () => {
  afterEach(() => {
    setDisableApiDatasetSuperAdmin(false);
  });
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
          name: 'folder-a',
          type: DatasetCollectionTypeEnum.folder,
          syncChildren: false,
          parentId: null
        },
        {
          collectionId: String(derived._id),
          apiFileId: 'doc-b#dir',
          sourceId: 'doc-b',
          name: 'doc-b',
          type: DatasetCollectionTypeEnum.folder,
          syncChildren: true,
          parentId: String(folder._id)
        },
        {
          collectionId: String(file._id),
          apiFileId: 'doc-b',
          sourceId: 'doc-b',
          name: 'doc-b',
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

  it('treats legacy SYSTEM_ROOT as syncAll=true and normalizes sentinel children parentId to null', async () => {
    const { owner } = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'api-sync-state-legacy-root',
      type: DatasetTypeEnum.apiDataset,
      syncAll: false,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const sentinel = await MongoDatasetCollection.create({
      name: 'ROOT_FOLDER',
      type: DatasetCollectionTypeEnum.folder,
      apiFileId: 'SYSTEM_ROOT',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: dataset._id
    });
    const topFile = await MongoDatasetCollection.create({
      name: 'top-doc',
      type: DatasetCollectionTypeEnum.apiFile,
      apiFileId: 'doc-1',
      apiFileParentId: 'SYSTEM_ROOT',
      parentId: sentinel._id,
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
    expect(response.data.collections).toEqual([
      {
        collectionId: String(topFile._id),
        apiFileId: 'doc-1',
        sourceId: 'doc-1',
        name: 'top-doc',
        type: DatasetCollectionTypeEnum.apiFile,
        syncChildren: true,
        parentId: null
      }
    ]);
  });

  it('filters collections for team owner when DISABLE_APIDATASET_SUPER_ADMIN=true and short-circuits when false', async () => {
    const { owner, members } = await getFakeUsers(2);
    const datasetOwner = members[0];
    const dataset = await MongoDataset.create({
      name: 'api-sync-state-superadmin-guard',
      type: DatasetTypeEnum.apiDataset,
      collectionPermissionEnabled: true,
      syncAll: false,
      teamId: owner.teamId,
      tmbId: datasetOwner.tmbId,
      apiDatasetServer: {
        apiServer: { baseUrl: 'https://example.com' },
        permissionSync: true
      }
    });

    await MongoResourcePermission.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      resourceType: PerResourceTypeEnum.dataset,
      resourceId: dataset._id,
      permission: WriteRoleVal
    });

    const dirA = await MongoDatasetCollection.create({
      name: 'dir-a',
      type: DatasetCollectionTypeEnum.folder,
      apiFileId: 'dir-a',
      inheritPermission: false,
      teamId: owner.teamId,
      tmbId: datasetOwner.tmbId,
      datasetId: dataset._id
    });
    const colSecret = await MongoDatasetCollection.create({
      name: 'col-secret',
      type: DatasetCollectionTypeEnum.apiFile,
      apiFileId: 'col-secret',
      parentId: dirA._id,
      inheritPermission: false,
      teamId: owner.teamId,
      tmbId: datasetOwner.tmbId,
      datasetId: dataset._id
    });
    const colSub = await MongoDatasetCollection.create({
      name: 'col-sub',
      type: DatasetCollectionTypeEnum.apiFile,
      apiFileId: 'col-sub',
      parentId: dirA._id,
      inheritPermission: false,
      teamId: owner.teamId,
      tmbId: datasetOwner.tmbId,
      datasetId: dataset._id
    });
    await MongoResourcePermission.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      resourceType: PerResourceTypeEnum.collection,
      resourceId: colSub._id,
      permission: ReadRoleVal
    });

    setDisableApiDatasetSuperAdmin(true);
    const restrictedRes = await Call(syncStateHandler, {
      auth: owner,
      query: { datasetId: String(dataset._id) }
    });
    expect(restrictedRes.code).toBe(200);
    expect(restrictedRes.data.collections).toEqual([
      {
        collectionId: String(colSub._id),
        apiFileId: 'col-sub',
        sourceId: 'col-sub',
        name: 'col-sub',
        type: DatasetCollectionTypeEnum.apiFile,
        syncChildren: true,
        parentId: null
      }
    ]);

    setDisableApiDatasetSuperAdmin(false);
    const bypassRes = await Call(syncStateHandler, {
      auth: owner,
      query: { datasetId: String(dataset._id) }
    });
    expect(bypassRes.code).toBe(200);
    expect(bypassRes.data.collections.map((item: any) => item.collectionId).sort()).toEqual(
      [String(dirA._id), String(colSecret._id), String(colSub._id)].sort()
    );
  });
});

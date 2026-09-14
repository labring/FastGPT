import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { createCollectionPermission } from '@fastgpt/service/support/permission/collection/controller';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  analyzeCollectionTree,
  disableDatasetCollectionPermissions,
  enableDatasetCollectionPermissions
} from '@fastgpt/service/support/permission/collection/enable';
import {
  createResourceDefaultCollaborators,
  getResourceOwnedClbs
} from '@fastgpt/service/support/permission/controller';
import { updateResourceCollaborators } from '@fastgpt/service/support/permission/resourcePermissionService';
import { getFakeUsers } from '@test/datas/users';
import type { parseHeaderCertRet } from '@test/mocks/request';
import { describe, expect, it } from 'vitest';

const toPermissionMap = (collaborators: { tmbId?: string; permission: number }[]) =>
  new Map(collaborators.map((collaborator) => [collaborator.tmbId, collaborator.permission]));

type User = parseHeaderCertRet;

const createDataset = async ({ user }: { user: User }) =>
  mongoSessionRun(async (session) => {
    const dataset = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      type: DatasetTypeEnum.dataset,
      name: 'test-dataset'
    });
    await createResourceDefaultCollaborators({
      resource: {
        _id: String(dataset._id),
        type: dataset.type,
        teamId: String(dataset.teamId)
      },
      resourceType: PerResourceTypeEnum.dataset,
      session,
      tmbId: String(user.tmbId)
    });
    return dataset;
  });

const createCollection = async ({
  user,
  datasetId,
  name,
  type = DatasetCollectionTypeEnum.file,
  parentId,
  inheritPermission = true
}: {
  user: User;
  datasetId: string;
  name: string;
  type?: DatasetCollectionTypeEnum;
  parentId?: string;
  inheritPermission?: boolean;
}) =>
  mongoSessionRun(async (session) => {
    const collection = await MongoDatasetCollection.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      datasetId,
      type,
      name,
      ...(parentId ? { parentId } : {}),
      inheritPermission
    });
    await createCollectionPermission({
      resource: {
        _id: String(collection._id),
        type: collection.type,
        teamId: String(collection.teamId),
        parentId: collection.parentId ? String(collection.parentId) : undefined,
        datasetId: String(collection.datasetId),
        tmbId: String(collection.tmbId),
        inheritPermission: collection.inheritPermission
      },
      tmbId: String(user.tmbId),
      session
    });
    return collection;
  });

const setDatasetCollaborators = async ({
  user,
  datasetId,
  collaborators
}: {
  user: User;
  datasetId: string;
  collaborators: { tmbId: string; permission: number }[];
}) => {
  await mongoSessionRun(async (session) => {
    await updateResourceCollaborators({
      resource: { _id: datasetId, type: DatasetTypeEnum.dataset, teamId: String(user.teamId) },
      resourceModel: MongoDataset,
      resourceType: PerResourceTypeEnum.dataset,
      oldCollaborators: await getResourceOwnedClbs({
        teamId: String(user.teamId),
        resourceId: datasetId,
        resourceType: PerResourceTypeEnum.dataset,
        session
      }),
      newCollaborators: collaborators,
      session
    });
  });
};

const collectionClbs = (teamId: string, collectionId: string) =>
  getResourceOwnedClbs({
    teamId,
    resourceId: collectionId,
    resourceType: PerResourceTypeEnum.collection
  });

/** 读取 dataset 的 collection 级权限开关。 */
const datasetSwitchState = async (datasetId: string) =>
  (await MongoDataset.findById(datasetId).lean())?.collectionPermissionEnabled;

/** 统计一组 collection 的 ACL 行数，用于校验幂等（不产生重复行 / 关闭后无残留）。 */
const countCollectionAclRows = (teamId: string, collectionIds: string[]) =>
  MongoResourcePermission.countDocuments({
    resourceType: PerResourceTypeEnum.collection,
    teamId,
    resourceId: { $in: collectionIds }
  });

describe.sequential('analyzeCollectionTree', () => {
  it('flags an orphan whose parent does not exist or is not a folder', () => {
    const collections = [
      {
        _id: 'a',
        tmbId: 't',
        teamId: 'team',
        datasetId: 'ds',
        type: DatasetCollectionTypeEnum.file
      },
      {
        _id: 'b',
        tmbId: 't',
        teamId: 'team',
        datasetId: 'ds',
        type: DatasetCollectionTypeEnum.file,
        parentId: 'a'
      },
      {
        _id: 'c',
        tmbId: 't',
        teamId: 'team',
        datasetId: 'ds',
        type: DatasetCollectionTypeEnum.folder,
        parentId: 'nonexistent'
      },
      {
        _id: 'd',
        tmbId: 't',
        teamId: 'team',
        datasetId: 'ds',
        type: DatasetCollectionTypeEnum.file,
        parentId: 'a'
      }
    ];
    // parent 'a' is a file (not a folder): b/d are orphans; 'c' points to a missing parent
    expect(analyzeCollectionTree(collections)).toEqual({ orphans: ['b', 'c', 'd'], cycles: [] });
  });

  it('flags folder cycles via Kahn topological sorting', () => {
    const collections = [
      {
        _id: 'a',
        tmbId: 't',
        teamId: 'team',
        datasetId: 'ds',
        type: DatasetCollectionTypeEnum.folder,
        parentId: 'b'
      },
      {
        _id: 'b',
        tmbId: 't',
        teamId: 'team',
        datasetId: 'ds',
        type: DatasetCollectionTypeEnum.folder,
        parentId: 'a'
      },
      {
        _id: 'c',
        tmbId: 't',
        teamId: 'team',
        datasetId: 'ds',
        type: DatasetCollectionTypeEnum.folder
      }
    ];
    expect(analyzeCollectionTree(collections)).toEqual({ orphans: [], cycles: ['a', 'b'] });
  });
});

describe.sequential('enableDatasetCollectionPermissions', () => {
  it('materializes owner + dataset ACL onto root collections, propagates subtrees and enables the switch', async () => {
    const users = await getFakeUsers(2);
    const dataset = await createDataset({ user: users.owner });
    await setDatasetCollaborators({
      user: users.owner,
      datasetId: String(dataset._id),
      collaborators: [
        { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
      ]
    });
    const rootFile = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'root-file'
    });
    const rootFolder = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'root-folder',
      type: DatasetCollectionTypeEnum.folder
    });
    const child = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'child',
      parentId: String(rootFolder._id)
    });

    const result = await enableDatasetCollectionPermissions({
      teamId: String(users.owner.teamId),
      datasetId: String(dataset._id)
    });
    expect(result).toEqual({ collectionCount: 3 });

    const collectionIds = [String(rootFile._id), String(rootFolder._id), String(child._id)];
    const expectedMap = new Map([
      [String(users.owner.tmbId), OwnerRoleVal],
      [String(users.members[0].tmbId), ReadRoleVal]
    ]);
    for (const collectionId of collectionIds) {
      await expect(
        collectionClbs(String(users.owner.teamId), collectionId).then(toPermissionMap)
      ).resolves.toEqual(expectedMap);
    }
    // 物化成功后才置位开关
    expect(await datasetSwitchState(String(dataset._id))).toBe(true);

    // 幂等：重复启用结果一致，且不产生重复 ACL 行（每 collection = owner + dataset reader）
    const rerun = await enableDatasetCollectionPermissions({
      teamId: String(users.owner.teamId),
      datasetId: String(dataset._id)
    });
    expect(rerun).toEqual({ collectionCount: 3 });
    for (const collectionId of collectionIds) {
      await expect(
        collectionClbs(String(users.owner.teamId), collectionId).then(toPermissionMap)
      ).resolves.toEqual(expectedMap);
    }
    expect(await countCollectionAclRows(String(users.owner.teamId), collectionIds)).toBe(6);
    expect(await datasetSwitchState(String(dataset._id))).toBe(true);
  });

  it('removes stale ACL records before rebuilding an inheriting collection', async () => {
    const users = await getFakeUsers(2);
    const dataset = await createDataset({ user: users.owner });
    const collection = await MongoDatasetCollection.create({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      datasetId: dataset._id,
      type: DatasetCollectionTypeEnum.file,
      name: 'legacy-with-stale-acl'
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.collection,
      teamId: users.owner.teamId,
      resourceId: String(collection._id),
      tmbId: users.members[0].tmbId,
      permission: ReadRoleVal
    });

    await enableDatasetCollectionPermissions({
      teamId: String(users.owner.teamId),
      datasetId: String(dataset._id)
    });

    // 旧 ACL 不参与快照重建：结果 = owner + dataset 派生快照
    await expect(
      collectionClbs(String(users.owner.teamId), String(collection._id)).then(toPermissionMap)
    ).resolves.toEqual(new Map([[String(users.owner.tmbId), OwnerRoleVal]]));
    expect(await datasetSwitchState(String(dataset._id))).toBe(true);
  });

  it('preserves an existing independent collection and ensures its owner ACL row exists', async () => {
    const users = await getFakeUsers(2);
    const dataset = await createDataset({ user: users.owner });
    // 防御性场景：存量数据可能残留独立态 collection（关闭态写路径不会再产生）。
    // 直接建库绕过 createCollectionPermission，模拟「独立态有自定义 ACL 但缺 owner 行」。
    const independent = await MongoDatasetCollection.create({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      datasetId: dataset._id,
      type: DatasetCollectionTypeEnum.file,
      name: 'independent-without-owner-acl',
      inheritPermission: false
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.collection,
      teamId: users.owner.teamId,
      resourceId: String(independent._id),
      tmbId: users.members[0].tmbId,
      permission: ReadRoleVal
    });

    await enableDatasetCollectionPermissions({
      teamId: String(users.owner.teamId),
      datasetId: String(dataset._id)
    });

    // 独立态保持独立、自定义 ACL 不被清除，owner 行由启用补齐
    await expect(MongoDatasetCollection.findById(independent._id).lean()).resolves.toMatchObject({
      inheritPermission: false
    });
    await expect(
      collectionClbs(String(users.owner.teamId), String(independent._id)).then(toPermissionMap)
    ).resolves.toEqual(
      new Map([
        [String(users.owner.tmbId), OwnerRoleVal],
        [String(users.members[0].tmbId), ReadRoleVal]
      ])
    );
    expect(await datasetSwitchState(String(dataset._id))).toBe(true);
  });

  it('rejects an orphan parentId instead of silently degrading', async () => {
    const users = await getFakeUsers(1);
    const dataset = await createDataset({ user: users.owner });
    const collection = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'orphan'
    });
    await MongoDatasetCollection.updateOne(
      { _id: collection._id },
      { $set: { parentId: new Types.ObjectId() } }
    );

    await expect(
      enableDatasetCollectionPermissions({
        teamId: String(users.owner.teamId),
        datasetId: String(dataset._id)
      })
    ).rejects.toThrow(/orphan/);
    // 校验失败时零写入：开关保持关闭态
    expect(await datasetSwitchState(String(dataset._id))).toBe(false);
  });

  it('rejects a folder cycle instead of silently degrading', async () => {
    const users = await getFakeUsers(1);
    const dataset = await createDataset({ user: users.owner });
    const folderA = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'folder-a',
      type: DatasetCollectionTypeEnum.folder
    });
    const folderB = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'folder-b',
      type: DatasetCollectionTypeEnum.folder
    });
    await MongoDatasetCollection.updateMany(
      { _id: { $in: [folderA._id, folderB._id] } },
      { $set: { parentId: null } }
    );
    await MongoDatasetCollection.updateOne(
      { _id: folderA._id },
      { $set: { parentId: folderB._id } }
    );
    await MongoDatasetCollection.updateOne(
      { _id: folderB._id },
      { $set: { parentId: folderA._id } }
    );

    await expect(
      enableDatasetCollectionPermissions({
        teamId: String(users.owner.teamId),
        datasetId: String(dataset._id)
      })
    ).rejects.toThrow(/cycle/);
    expect(await datasetSwitchState(String(dataset._id))).toBe(false);
  });
});

describe.sequential('disableDatasetCollectionPermissions', () => {
  it('clears collection ACL rows, resets every collection to inheriting and makes the switch reversible', async () => {
    const users = await getFakeUsers(3);
    const dataset = await createDataset({ user: users.owner });
    await setDatasetCollaborators({
      user: users.owner,
      datasetId: String(dataset._id),
      collaborators: [
        { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
      ]
    });
    const rootFolder = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'root-folder',
      type: DatasetCollectionTypeEnum.folder
    });
    const child = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'child',
      parentId: String(rootFolder._id)
    });
    // 独立态 collection：关闭必须把全部 collection（含独立态）清理回继承态
    const independent = await MongoDatasetCollection.create({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      datasetId: dataset._id,
      type: DatasetCollectionTypeEnum.file,
      name: 'independent',
      inheritPermission: false
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.collection,
      teamId: users.owner.teamId,
      resourceId: String(independent._id),
      tmbId: users.members[1].tmbId,
      permission: ReadRoleVal
    });

    const teamId = String(users.owner.teamId);
    const datasetId = String(dataset._id);
    const collectionIds = [String(rootFolder._id), String(child._id), String(independent._id)];

    await enableDatasetCollectionPermissions({ teamId, datasetId });
    expect(await datasetSwitchState(datasetId)).toBe(true);
    await expect(MongoDatasetCollection.findById(independent._id).lean()).resolves.toMatchObject({
      inheritPermission: false
    });

    const result = await disableDatasetCollectionPermissions({ teamId, datasetId });
    expect(result).toEqual({ collectionCount: 3 });
    // 关闭态无残留：全部 collection ACL 行被清除
    await expect(countCollectionAclRows(teamId, collectionIds)).resolves.toBe(0);
    for (const collectionId of collectionIds) {
      await expect(MongoDatasetCollection.findById(collectionId).lean()).resolves.toMatchObject({
        inheritPermission: true
      });
    }
    expect(await datasetSwitchState(datasetId)).toBe(false);

    // 重复关闭是 no-op
    const rerun = await disableDatasetCollectionPermissions({ teamId, datasetId });
    expect(rerun).toEqual({ collectionCount: 3 });
    await expect(countCollectionAclRows(teamId, collectionIds)).resolves.toBe(0);
    expect(await datasetSwitchState(datasetId)).toBe(false);

    // 重新启用等价于首次启用：按 dataset 有效 clbs 重建全部快照
    await enableDatasetCollectionPermissions({ teamId, datasetId });
    const expectedMap = new Map([
      [String(users.owner.tmbId), OwnerRoleVal],
      [String(users.members[0].tmbId), ReadRoleVal]
    ]);
    for (const collectionId of collectionIds) {
      await expect(collectionClbs(teamId, collectionId).then(toPermissionMap)).resolves.toEqual(
        expectedMap
      );
    }
    expect(await datasetSwitchState(datasetId)).toBe(true);
  });
});

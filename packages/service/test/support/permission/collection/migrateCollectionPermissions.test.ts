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
  migrateCollectionPermissions,
  migrateDatasetCollections
} from '@fastgpt/service/support/permission/collection/migrate';
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

const datasetFlag = async (datasetId: string) =>
  (await MongoDataset.findById(datasetId).lean())?.hasSetCollectionPermissions;

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

describe.sequential('migrateDatasetCollections', () => {
  it('materializes owner + dataset ACL onto root collections, propagates subtrees, resets the flag', async () => {
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

    const result = await migrateDatasetCollections({
      teamId: String(users.owner.teamId),
      datasetId: String(dataset._id)
    });
    expect(result).toMatchObject({ collectionCount: 3, issues: [] });

    const expectedMap = new Map([
      [String(users.owner.tmbId), OwnerRoleVal],
      [String(users.members[0].tmbId), ReadRoleVal]
    ]);
    for (const collectionId of [String(rootFile._id), String(rootFolder._id), String(child._id)]) {
      await expect(
        collectionClbs(String(users.owner.teamId), collectionId).then(toPermissionMap)
      ).resolves.toEqual(expectedMap);
    }
    // 迁移建立纯继承基线：短路 flag 重置为 false
    expect(await datasetFlag(String(dataset._id))).toBe(false);

    // 幂等：重复执行结果一致
    const rerun = await migrateDatasetCollections({
      teamId: String(users.owner.teamId),
      datasetId: String(dataset._id)
    });
    expect(rerun).toMatchObject({ collectionCount: 3, issues: [] });
    await expect(
      collectionClbs(String(users.owner.teamId), String(child._id)).then(toPermissionMap)
    ).resolves.toEqual(expectedMap);
    expect(await datasetFlag(String(dataset._id))).toBe(false);
  });

  it('dryRun validates and reports without writing', async () => {
    const users = await getFakeUsers(2);
    const dataset = await createDataset({ user: users.owner });
    // 先建 collection（此时 dataset 仅 owner，collection 快照 = [owner]）
    const rootFile = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'root-file'
    });
    // 模拟存量态：dataset 权限已变更但 collection 未物化（旧版本无 collection 权限记录）
    await setDatasetCollaborators({
      user: users.owner,
      datasetId: String(dataset._id),
      collaborators: [
        { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
      ]
    });

    // 先置 flag=true，dryRun 不应改动任何状态
    await MongoDataset.updateOne(
      { _id: dataset._id },
      { $set: { hasSetCollectionPermissions: true } }
    );

    const result = await migrateDatasetCollections({
      teamId: String(users.owner.teamId),
      datasetId: String(dataset._id),
      dryRun: true
    });
    expect(result).toMatchObject({ collectionCount: 1, issues: [] });
    expect(await datasetFlag(String(dataset._id))).toBe(true);
    // 快照未被写入：m1 仍未物化到 collection（仅 owner）
    await expect(
      collectionClbs(String(users.owner.teamId), String(rootFile._id)).then(toPermissionMap)
    ).resolves.toEqual(new Map([[String(users.owner.tmbId), OwnerRoleVal]]));
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

    await migrateDatasetCollections({
      teamId: String(users.owner.teamId),
      datasetId: String(dataset._id)
    });

    await expect(
      collectionClbs(String(users.owner.teamId), String(collection._id)).then(toPermissionMap)
    ).resolves.toEqual(new Map([[String(users.owner.tmbId), OwnerRoleVal]]));
  });

  it('preserves configured independent collections while materializing legacy collections', async () => {
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
    const independent = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'independent',
      inheritPermission: false
    });
    await mongoSessionRun(async (session) => {
      await updateResourceCollaborators({
        resource: {
          _id: String(independent._id),
          type: independent.type,
          teamId: String(independent.teamId),
          parentId: null,
          inheritPermission: false
        },
        resourceModel: MongoDatasetCollection,
        resourceType: PerResourceTypeEnum.collection,
        oldCollaborators: await getResourceOwnedClbs({
          teamId: String(users.owner.teamId),
          resourceId: String(independent._id),
          resourceType: PerResourceTypeEnum.collection,
          session
        }),
        newCollaborators: [
          { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
          { tmbId: String(users.members[1].tmbId), permission: ReadRoleVal }
        ],
        session
      });
    });
    const legacy = await MongoDatasetCollection.create({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      datasetId: dataset._id,
      type: DatasetCollectionTypeEnum.file,
      name: 'legacy'
    });

    await migrateDatasetCollections({
      teamId: String(users.owner.teamId),
      datasetId: String(dataset._id)
    });

    await expect(MongoDatasetCollection.findById(independent._id).lean()).resolves.toMatchObject({
      inheritPermission: false
    });
    await expect(
      collectionClbs(String(users.owner.teamId), String(independent._id)).then(toPermissionMap)
    ).resolves.toEqual(
      new Map([
        [String(users.owner.tmbId), OwnerRoleVal],
        [String(users.members[1].tmbId), ReadRoleVal]
      ])
    );
    await expect(
      collectionClbs(String(users.owner.teamId), String(legacy._id)).then(toPermissionMap)
    ).resolves.toEqual(
      new Map([
        [String(users.owner.tmbId), OwnerRoleVal],
        [String(users.members[0].tmbId), ReadRoleVal]
      ])
    );
    expect(await datasetFlag(String(dataset._id))).toBe(true);

    await migrateDatasetCollections({
      teamId: String(users.owner.teamId),
      datasetId: String(dataset._id)
    });

    await expect(MongoDatasetCollection.findById(independent._id).lean()).resolves.toMatchObject({
      inheritPermission: false
    });
    await expect(
      collectionClbs(String(users.owner.teamId), String(independent._id)).then(toPermissionMap)
    ).resolves.toEqual(
      new Map([
        [String(users.owner.tmbId), OwnerRoleVal],
        [String(users.members[1].tmbId), ReadRoleVal]
      ])
    );
  });

  it('preserves an independent collection without an ACL record', async () => {
    const users = await getFakeUsers(1);
    const dataset = await createDataset({ user: users.owner });
    const independent = await MongoDatasetCollection.create({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      datasetId: dataset._id,
      type: DatasetCollectionTypeEnum.file,
      name: 'independent-without-acl',
      inheritPermission: false
    });
    const legacy = await MongoDatasetCollection.create({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      datasetId: dataset._id,
      type: DatasetCollectionTypeEnum.file,
      name: 'legacy'
    });

    await migrateDatasetCollections({
      teamId: String(users.owner.teamId),
      datasetId: String(dataset._id)
    });

    await expect(MongoDatasetCollection.findById(independent._id).lean()).resolves.toMatchObject({
      inheritPermission: false
    });
    await expect(
      collectionClbs(String(users.owner.teamId), String(independent._id))
    ).resolves.toEqual([]);
    await expect(
      collectionClbs(String(users.owner.teamId), String(legacy._id)).then(toPermissionMap)
    ).resolves.toEqual(new Map([[String(users.owner.tmbId), OwnerRoleVal]]));
    expect(await datasetFlag(String(dataset._id))).toBe(true);
  });

  it('processes every dataset in the requested team', async () => {
    const users = await getFakeUsers(1);
    const firstDataset = await createDataset({ user: users.owner });
    const secondDataset = await createDataset({ user: users.owner });
    await createCollection({
      user: users.owner,
      datasetId: String(firstDataset._id),
      name: 'first'
    });
    await createCollection({
      user: users.owner,
      datasetId: String(secondDataset._id),
      name: 'second'
    });

    await expect(
      migrateCollectionPermissions({ teamId: String(users.owner.teamId) })
    ).resolves.toMatchObject({
      datasetCount: 2,
      processedDatasetCount: 2,
      collectionCount: 2,
      errors: []
    });
  });

  it('limits migration to the requested dataset ids', async () => {
    const users = await getFakeUsers(1);
    const firstDataset = await createDataset({ user: users.owner });
    const secondDataset = await createDataset({ user: users.owner });
    await createCollection({
      user: users.owner,
      datasetId: String(firstDataset._id),
      name: 'first'
    });
    await createCollection({
      user: users.owner,
      datasetId: String(secondDataset._id),
      name: 'second'
    });

    await expect(
      migrateCollectionPermissions({
        teamId: String(users.owner.teamId),
        datasetIds: [String(firstDataset._id)],
        dryRun: true
      })
    ).resolves.toMatchObject({
      datasetCount: 1,
      processedDatasetCount: 1,
      collectionCount: 1,
      errors: []
    });
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
      migrateDatasetCollections({
        teamId: String(users.owner.teamId),
        datasetId: String(dataset._id)
      })
    ).rejects.toThrow(/orphan/);
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
      migrateDatasetCollections({
        teamId: String(users.owner.teamId),
        datasetId: String(dataset._id)
      })
    ).rejects.toThrow(/cycle/);
  });
});

import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import type { Model } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  createCollectionPermission,
  moveCollectionPermission,
  syncDatasetToCollections,
  syncRootCollections
} from '@fastgpt/service/support/permission/collection/controller';
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

/** 创建 dataset 并物化其 owner 快照（与生产 create 流程一致）。 */
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

/** 创建 collection 并初始化权限快照（根级父级 = dataset，非根级父级 = 父 collection folder）。 */
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

/** 替换资源的物化快照（不触发继承态翻转，与测试聚焦点无关）。 */
const setCollaborators = async ({
  resource,
  resourceModel,
  resourceType,
  collaborators
}: {
  resource: { _id: string; type: string; teamId: string };
  resourceModel: Model<any>;
  resourceType: PerResourceTypeEnum;
  collaborators: { tmbId: string; permission: number }[];
}) => {
  await mongoSessionRun(async (session) => {
    await updateResourceCollaborators({
      resource,
      resourceModel,
      resourceType,
      oldCollaborators: await getResourceOwnedClbs({
        teamId: resource.teamId,
        resourceId: resource._id,
        resourceType,
        session
      }),
      newCollaborators: collaborators,
      session
    });
  });
};

/** 以 collection 当前文档状态执行 moveCollectionPermission（对齐生产调用方）。 */
const moveCollection = async ({
  collectionId,
  targetParentId
}: {
  collectionId: string;
  targetParentId?: string | null;
}) => {
  const collection = await MongoDatasetCollection.findById(collectionId).lean();
  expect(collection).toBeTruthy();
  await mongoSessionRun(async (session) => {
    await moveCollectionPermission({
      collection: {
        _id: String(collection!._id),
        type: collection!.type,
        teamId: String(collection!.teamId),
        parentId: collection!.parentId ? String(collection!.parentId) : undefined,
        datasetId: String(collection!.datasetId),
        tmbId: String(collection!.tmbId),
        inheritPermission: collection!.inheritPermission
      },
      targetParentId: targetParentId ?? null,
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

/** 读取 dataset 的 collection 权限短路 flag（undefined = 旧数据，从未置位）。 */
const datasetFlag = async (datasetId: string) =>
  (await MongoDataset.findById(datasetId).lean())?.hasSetCollectionPermissions;

describe.sequential('moveCollectionPermission', () => {
  it('recalculates an inheriting collection moved between folders', async () => {
    const users = await getFakeUsers(3);
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
    const child = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'child',
      parentId: String(folderA._id)
    });

    await setCollaborators({
      resource: {
        _id: String(folderA._id),
        type: folderA.type,
        teamId: String(folderA.teamId)
      },
      resourceModel: MongoDatasetCollection,
      resourceType: PerResourceTypeEnum.collection,
      collaborators: [
        { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
      ]
    });
    await setCollaborators({
      resource: {
        _id: String(folderB._id),
        type: folderB.type,
        teamId: String(folderB.teamId)
      },
      resourceModel: MongoDatasetCollection,
      resourceType: PerResourceTypeEnum.collection,
      collaborators: [
        { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(users.members[1].tmbId), permission: ReadRoleVal }
      ]
    });

    await moveCollection({
      collectionId: String(child._id),
      targetParentId: String(folderB._id)
    });

    await expect(MongoDatasetCollection.findById(child._id).lean()).resolves.toMatchObject({
      parentId: String(folderB._id),
      inheritPermission: true
    });
    // 旧父级 folderA 的 reader 被剥离，新父级 folderB 的 reader 被合并
    await expect(
      collectionClbs(String(users.owner.teamId), String(child._id)).then(toPermissionMap)
    ).resolves.toEqual(
      new Map([
        [String(users.owner.tmbId), OwnerRoleVal],
        [String(users.members[1].tmbId), ReadRoleVal]
      ])
    );
    // 继承态移动不产生自定义权限 → 短路 flag 不得置位
    expect(await datasetFlag(String(dataset._id))).not.toBe(true);
  });

  it('moves an inheriting collection to the dataset root and strips the old folder', async () => {
    const users = await getFakeUsers(2);
    const dataset = await createDataset({ user: users.owner });
    const folder = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'folder',
      type: DatasetCollectionTypeEnum.folder
    });
    const child = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'child',
      parentId: String(folder._id)
    });

    await setCollaborators({
      resource: {
        _id: String(folder._id),
        type: folder.type,
        teamId: String(folder.teamId)
      },
      resourceModel: MongoDatasetCollection,
      resourceType: PerResourceTypeEnum.collection,
      collaborators: [
        { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
      ]
    });

    await moveCollection({ collectionId: String(child._id), targetParentId: null });

    await expect(MongoDatasetCollection.findById(child._id).lean()).resolves.toMatchObject({
      parentId: null,
      inheritPermission: true
    });
    // folder 的 reader 贡献被剥离，父级回退到 dataset（仅 owner）
    await expect(
      collectionClbs(String(users.owner.teamId), String(child._id)).then(toPermissionMap)
    ).resolves.toEqual(new Map([[String(users.owner.tmbId), OwnerRoleVal]]));
    expect(await datasetFlag(String(dataset._id))).not.toBe(true);
  });

  it('moves a root collection into a folder, using the dataset as the old parent', async () => {
    const users = await getFakeUsers(3);
    const dataset = await createDataset({ user: users.owner });
    // dataset 快照追加 reader → 根 collection 创建时继承该 reader
    await setCollaborators({
      resource: {
        _id: String(dataset._id),
        type: dataset.type,
        teamId: String(dataset.teamId)
      },
      resourceModel: MongoDataset,
      resourceType: PerResourceTypeEnum.dataset,
      collaborators: [
        { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
      ]
    });
    const rootCollection = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'root-collection'
    });
    const folder = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'folder',
      type: DatasetCollectionTypeEnum.folder
    });
    await setCollaborators({
      resource: {
        _id: String(folder._id),
        type: folder.type,
        teamId: String(folder.teamId)
      },
      resourceModel: MongoDatasetCollection,
      resourceType: PerResourceTypeEnum.collection,
      collaborators: [
        { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(users.members[1].tmbId), permission: ReadRoleVal }
      ]
    });

    await moveCollection({
      collectionId: String(rootCollection._id),
      targetParentId: String(folder._id)
    });

    await expect(MongoDatasetCollection.findById(rootCollection._id).lean()).resolves.toMatchObject(
      {
        parentId: String(folder._id),
        inheritPermission: true
      }
    );
    // 旧父级（dataset）的 reader 被剥离，新父级（folder）的 reader 被合并
    await expect(
      collectionClbs(String(users.owner.teamId), String(rootCollection._id)).then(toPermissionMap)
    ).resolves.toEqual(
      new Map([
        [String(users.owner.tmbId), OwnerRoleVal],
        [String(users.members[1].tmbId), ReadRoleVal]
      ])
    );
    expect(await datasetFlag(String(dataset._id))).not.toBe(true);
  });

  it('keeps an independent collection isolated when moved into a folder and marks the flag', async () => {
    const users = await getFakeUsers(2);
    const dataset = await createDataset({ user: users.owner });
    const folder = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'folder',
      type: DatasetCollectionTypeEnum.folder
    });
    const independent = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'independent',
      inheritPermission: false
    });

    await moveCollection({
      collectionId: String(independent._id),
      targetParentId: String(folder._id)
    });

    await expect(MongoDatasetCollection.findById(independent._id).lean()).resolves.toMatchObject({
      parentId: String(folder._id),
      inheritPermission: false
    });
    // 独立态移动不合并目标父级：快照保持不变
    await expect(
      collectionClbs(String(users.owner.teamId), String(independent._id)).then(toPermissionMap)
    ).resolves.toEqual(new Map([[String(users.owner.tmbId), OwnerRoleVal]]));
    // 存在独立 collection → 短路 flag 必须置位
    expect(await datasetFlag(String(dataset._id))).toBe(true);
  });

  it('keeps an independent collection isolated when moved back to the dataset root', async () => {
    const users = await getFakeUsers(2);
    const dataset = await createDataset({ user: users.owner });
    const folder = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'folder',
      type: DatasetCollectionTypeEnum.folder
    });
    const independent = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'independent',
      parentId: String(folder._id),
      inheritPermission: false
    });

    await moveCollection({ collectionId: String(independent._id), targetParentId: null });

    await expect(MongoDatasetCollection.findById(independent._id).lean()).resolves.toMatchObject({
      parentId: null,
      inheritPermission: false
    });
    await expect(
      collectionClbs(String(users.owner.teamId), String(independent._id)).then(toPermissionMap)
    ).resolves.toEqual(new Map([[String(users.owner.tmbId), OwnerRoleVal]]));
    expect(await datasetFlag(String(dataset._id))).toBe(true);
  });

  it('propagates the new snapshot to the descendants of a moved folder', async () => {
    const users = await getFakeUsers(2);
    const dataset = await createDataset({ user: users.owner });
    const folderA = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'folder-a',
      type: DatasetCollectionTypeEnum.folder
    });
    const child = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'child',
      parentId: String(folderA._id)
    });
    const folderB = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'folder-b',
      type: DatasetCollectionTypeEnum.folder
    });
    await setCollaborators({
      resource: {
        _id: String(folderB._id),
        type: folderB.type,
        teamId: String(folderB.teamId)
      },
      resourceModel: MongoDatasetCollection,
      resourceType: PerResourceTypeEnum.collection,
      collaborators: [
        { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
      ]
    });

    await moveCollection({
      collectionId: String(folderA._id),
      targetParentId: String(folderB._id)
    });

    await expect(MongoDatasetCollection.findById(folderA._id).lean()).resolves.toMatchObject({
      parentId: String(folderB._id),
      inheritPermission: true
    });
    const expectedMap = new Map([
      [String(users.owner.tmbId), OwnerRoleVal],
      [String(users.members[0].tmbId), ReadRoleVal]
    ]);
    await expect(
      collectionClbs(String(users.owner.teamId), String(folderA._id)).then(toPermissionMap)
    ).resolves.toEqual(expectedMap);
    // folder 移动后子 collection 跟随新快照（syncResourceTreePermissions 传播）
    await expect(
      collectionClbs(String(users.owner.teamId), String(child._id)).then(toPermissionMap)
    ).resolves.toEqual(expectedMap);
    expect(await datasetFlag(String(dataset._id))).not.toBe(true);
  });
});

describe.sequential('syncDatasetToCollections', () => {
  it('removes old inherited access and preserves descendant-specific access', async () => {
    const users = await getFakeUsers(4);
    const dataset = await createDataset({ user: users.owner });
    const childDataset = await MongoDataset.create({
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      parentId: dataset._id,
      type: DatasetTypeEnum.dataset,
      name: 'child-dataset'
    });

    const oldRootClbs = [
      { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
      { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
    ];
    const oldChildClbs = [
      ...oldRootClbs,
      { tmbId: String(users.members[1].tmbId), permission: WriteRoleVal }
    ];
    await setCollaborators({
      resource: {
        _id: String(childDataset._id),
        type: childDataset.type,
        teamId: String(childDataset.teamId)
      },
      resourceModel: MongoDataset,
      resourceType: PerResourceTypeEnum.dataset,
      collaborators: oldChildClbs
    });
    const collection = await createCollection({
      user: users.owner,
      datasetId: String(childDataset._id),
      name: 'child-root-collection'
    });

    const newRootClbs = [
      { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
      { tmbId: String(users.members[2].tmbId), permission: ReadRoleVal }
    ];
    await mongoSessionRun((session) =>
      syncDatasetToCollections({
        teamId: String(users.owner.teamId),
        datasetId: String(dataset._id),
        oldEffectiveClbs: oldRootClbs,
        newEffectiveClbs: newRootClbs,
        session
      })
    );

    await expect(
      collectionClbs(String(users.owner.teamId), String(collection._id)).then(toPermissionMap)
    ).resolves.toEqual(
      new Map([
        [String(users.owner.tmbId), OwnerRoleVal],
        [String(users.members[1].tmbId), WriteRoleVal],
        [String(users.members[2].tmbId), ReadRoleVal]
      ])
    );
  });
});

describe.sequential('syncRootCollections', () => {
  it('recalculates root collections and propagates to folder subtrees', async () => {
    const users = await getFakeUsers(3);
    const dataset = await createDataset({ user: users.owner });
    await setCollaborators({
      resource: {
        _id: String(dataset._id),
        type: dataset.type,
        teamId: String(dataset.teamId)
      },
      resourceModel: MongoDataset,
      resourceType: PerResourceTypeEnum.dataset,
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
    // 三者在旧 dataset 快照下继承：[owner, m1(Read)]
    for (const collectionId of [String(rootFile._id), String(rootFolder._id), String(child._id)]) {
      await expect(
        collectionClbs(String(users.owner.teamId), collectionId).then(toPermissionMap)
      ).resolves.toEqual(
        new Map([
          [String(users.owner.tmbId), OwnerRoleVal],
          [String(users.members[0].tmbId), ReadRoleVal]
        ])
      );
    }

    // dataset 有效 clbs 变更（owner + m2），根级 collection 重新物化，folder 子树跟随
    const oldRootClbs = [
      { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
      { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
    ];
    const newRootClbs = [
      { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
      { tmbId: String(users.members[1].tmbId), permission: ReadRoleVal }
    ];
    await mongoSessionRun((session) =>
      syncRootCollections({
        teamId: String(users.owner.teamId),
        datasetId: String(dataset._id),
        oldRootClbs,
        rootClbs: newRootClbs,
        session
      })
    );

    const expectedMap = new Map([
      [String(users.owner.tmbId), OwnerRoleVal],
      [String(users.members[1].tmbId), ReadRoleVal]
    ]);
    for (const collectionId of [String(rootFile._id), String(rootFolder._id), String(child._id)]) {
      await expect(
        collectionClbs(String(users.owner.teamId), collectionId).then(toPermissionMap)
      ).resolves.toEqual(expectedMap);
    }
  });
});

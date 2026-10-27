import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  ManageRoleVal,
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { Types, type Model } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  bulkMoveCollectionsParent,
  createCollections,
  createOneCollection,
  createApiFileCollectionsBatch
} from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoUsage } from '@fastgpt/service/support/wallet/usage/schema';
import { MongoUsageItem } from '@fastgpt/service/support/wallet/usage/usageItemSchema';
import * as modelCatalog from '@fastgpt/service/core/ai/model/catalog/service';
import * as datasetPermissionState from '@fastgpt/service/support/permission/collection/datasetSwitch';
import {
  createCollectionPermission,
  moveCollectionPermission,
  moveCollectionPermissionsBatch,
  syncMovedCollectionPermissionDescendants,
  syncDatasetToCollections,
  syncRootCollections
} from '@fastgpt/service/support/permission/collection/controller';
import {
  enableDatasetCollectionPermissions,
  disableDatasetCollectionPermissions
} from '@fastgpt/service/support/permission/collection/enable';
import {
  createResourceDefaultCollaborators,
  getResourceOwnedClbs
} from '@fastgpt/service/support/permission/controller';
import { resourcePermissionRepo } from '@fastgpt/service/support/permission/repository/resourcePermissionRepo';
import {
  createResourcePermissions,
  updateResourceCollaborators
} from '@fastgpt/service/support/permission/resourcePermissionService';
import { getFakeUsers } from '@test/datas/users';
import type { parseHeaderCertRet } from '@test/mocks/request';
import { describe, expect, it, vi } from 'vitest';

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
  inheritPermission = true,
  legacySnapshot = false
}: {
  user: User;
  datasetId: string;
  name: string;
  type?: DatasetCollectionTypeEnum;
  parentId?: string;
  inheritPermission?: boolean;
  /** 模拟旧版本在权限关闭时仍写完整快照，验证存量 ACL 的移动兼容。 */
  legacySnapshot?: boolean;
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
    const resource = {
      _id: String(collection._id),
      type: collection.type,
      teamId: String(collection.teamId),
      parentId: collection.parentId ? String(collection.parentId) : undefined,
      datasetId: String(collection.datasetId),
      tmbId: String(collection.tmbId),
      inheritPermission: collection.inheritPermission
    };
    if (legacySnapshot) {
      await createResourcePermissions({
        resource,
        resourceType: PerResourceTypeEnum.collection,
        parentResourceType: parentId ? PerResourceTypeEnum.collection : PerResourceTypeEnum.dataset,
        parentResourceId: parentId ?? datasetId,
        tmbId: String(user.tmbId),
        session
      });
    } else {
      await createCollectionPermission({ resource, tmbId: String(user.tmbId), session });
    }
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

/** 读取 dataset 的 collection 级权限开关（undefined = 旧数据，视为关闭）。 */
const datasetSwitchState = async (datasetId: string) =>
  (await MongoDataset.findById(datasetId).lean())?.collectionPermissionEnabled;

describe.sequential('createCollections / createCollectionPermission', () => {
  it.each(['enable', 'disable'])(
    '批量创建与权限 %s 并发时，新节点遵守提交后的权限状态',
    async (mode) => {
      const users = await getFakeUsers(1);
      const dataset = await createDataset({ user: users.owner });
      const teamId = String(users.owner.teamId);
      const datasetId = String(dataset._id);
      if (mode === 'disable') await enableDatasetCollectionPermissions({ teamId, datasetId });
      const { mongoSessionRun: runRealTransaction } = await vi.importActual<
        typeof import('@fastgpt/service/common/mongo/sessionRun')
      >('@fastgpt/service/common/mongo/sessionRun');
      const runner = vi.mocked(mongoSessionRun);
      const defaultRunner = runner.getMockImplementation()!;
      runner.mockImplementation(runRealTransaction);
      let flagRead!: () => void;
      let resumeCreate!: () => void;
      let enableWrite!: () => void;
      const flagReadBarrier = new Promise<void>((resolve) => {
        flagRead = resolve;
      });
      const resumeBarrier = new Promise<void>((resolve) => {
        resumeCreate = resolve;
      });
      const enableWriteBarrier = new Promise<void>((resolve) => {
        enableWrite = resolve;
      });
      const readFlag = datasetPermissionState.lockDatasetCollectionPermissionState;
      const writeFlag = datasetPermissionState.setDatasetCollectionPermissionEnabled;
      const reads = vi
        .spyOn(datasetPermissionState, 'lockDatasetCollectionPermissionState')
        .mockImplementationOnce(async (props) => {
          const enabled = await readFlag(props);
          flagRead();
          await resumeBarrier;
          return enabled;
        });
      const writes = vi
        .spyOn(datasetPermissionState, 'setDatasetCollectionPermissionEnabled')
        .mockImplementation((props) => {
          enableWrite();
          return writeFlag(props);
        });
      try {
        const creation = runRealTransaction((session) =>
          createCollections({
            collections: [
              {
                teamId,
                datasetId,
                tmbId: String(users.owner.tmbId),
                name: 'concurrent',
                type: DatasetCollectionTypeEnum.apiFile,
                inheritPermission: mode === 'disable' ? false : undefined
              }
            ],
            session
          })
        );
        await flagReadBarrier;
        const switching =
          mode === 'enable'
            ? enableDatasetCollectionPermissions({ teamId, datasetId })
            : disableDatasetCollectionPermissions({ teamId, datasetId });
        // 开启事务已读取旧集合列表，但尚未提交开关；让创建事务继续完成。
        await enableWriteBarrier;
        resumeCreate();
        const [collections] = await Promise.all([creation, switching]);
        expect(await datasetSwitchState(datasetId)).toBe(mode === 'enable');
        const roles = await collectionClbs(teamId, String(collections[0]._id)).then(
          toPermissionMap
        );
        expect(roles).toEqual(
          mode === 'enable' ? new Map([[String(users.owner.tmbId), OwnerRoleVal]]) : new Map()
        );
        expect(
          (await MongoDatasetCollection.findById(collections[0]._id).lean())?.inheritPermission
        ).toBe(true);
      } finally {
        resumeCreate();
        reads.mockRestore();
        writes.mockRestore();
        runner.mockImplementation(defaultRunner);
      }
    }
  );

  it('同父级兼容正文保留旧 owner 和独立 ACL，目录内正文继续继承，来源查询按 ID 去重', async () => {
    const users = await getFakeUsers(1);
    const dataset = await createDataset({ user: users.owner });
    const teamId = String(users.owner.teamId),
      datasetId = String(dataset._id);
    await enableDatasetCollectionPermissions({ teamId, datasetId });
    const source = await createCollection({
      user: users.members[0],
      datasetId,
      name: 'source',
      type: DatasetCollectionTypeEnum.folder,
      inheritPermission: false
    });
    const collaborators = [
      { tmbId: String(users.members[0].tmbId), permission: OwnerRoleVal },
      { tmbId: String(users.owner.tmbId), permission: WriteRoleVal }
    ];
    await resourcePermissionRepo.replaceResources({
      teamId,
      resourceType: PerResourceTypeEnum.collection,
      resources: [{ resourceId: String(source._id), collaborators }]
    });
    const reads = vi.spyOn(resourcePermissionRepo, 'findByResourceIds');
    const created = await createCollections({
      collections: [null, String(source._id)].map((parentId, index) => ({
        teamId,
        datasetId,
        tmbId: String(users.owner.tmbId),
        name: `body-${index}`,
        type: DatasetCollectionTypeEnum.apiFile,
        parentId,
        permissionSourceCollectionId: String(source._id)
      }))
    });
    expect(reads.mock.calls.map(([query]) => query.resourceIds)).toEqual([[String(source._id)]]);
    reads.mockRestore();
    expect(created.map((row) => row.inheritPermission)).toEqual([false, true]);
    for (const row of created) {
      expect(String(row.tmbId)).toBe(String(users.members[0].tmbId));
      expect(row.toObject()).not.toHaveProperty('permissionSourceCollectionId');
      expect(toPermissionMap(await collectionClbs(teamId, String(row._id)))).toEqual(
        toPermissionMap(collaborators)
      );
    }
  });

  it.each(['missing', 'team', 'dataset', 'parent', 'non-folder'])(
    '权限复用来源 %s 已失效时不创建集合',
    async (mode) => {
      const users = await getFakeUsers(1);
      const dataset = await createDataset({ user: users.owner });
      const teamId = String(users.owner.teamId),
        datasetId = String(dataset._id);
      await enableDatasetCollectionPermissions({ teamId, datasetId });
      const source = await createCollection({
        user: users.owner,
        datasetId,
        name: 'source',
        type: DatasetCollectionTypeEnum.folder
      });
      const sourceId = String(source._id);
      if (mode === 'missing') await MongoDatasetCollection.deleteOne({ _id: source._id });
      else if (mode === 'parent')
        await MongoDatasetCollection.updateOne(
          { _id: source._id },
          { parentId: new Types.ObjectId() }
        );
      else if (mode === 'non-folder')
        await MongoDatasetCollection.updateOne(
          { _id: source._id },
          { type: DatasetCollectionTypeEnum.apiFile }
        );
      else
        await MongoDatasetCollection.updateOne(
          { _id: source._id },
          { [mode === 'team' ? 'teamId' : 'datasetId']: new Types.ObjectId() }
        );
      const before = await MongoDatasetCollection.countDocuments({});
      await expect(
        createCollections({
          collections: [
            {
              teamId,
              datasetId,
              tmbId: String(users.owner.tmbId),
              name: 'body',
              type: DatasetCollectionTypeEnum.apiFile,
              parentId: mode === 'non-folder' ? sourceId : null,
              permissionSourceCollectionId: sourceId
            }
          ]
        })
      ).rejects.toThrow('Collection permission source has changed');
      expect(await MongoDatasetCollection.countDocuments({})).toBe(before);
    }
  );

  it('关闭态单条和批量均不写 ACL，启用后为所有新集合物化完整快照', async () => {
    const users = await getFakeUsers(1);
    const dataset = await createDataset({ user: users.owner });
    const props = {
      teamId: String(users.owner.teamId),
      tmbId: String(users.owner.tmbId),
      datasetId: String(dataset._id),
      type: DatasetCollectionTypeEnum.apiFile
    };
    const single = await createOneCollection({ ...props, name: 'single', apiFileId: 'single' });
    const batch = await createCollections({
      collections: Array.from({ length: 200 }, (_, index) => ({
        ...props,
        name: `batch-${index}`,
        apiFileId: `batch-${index}`
      }))
    });
    expect(
      await MongoResourcePermission.countDocuments({
        teamId: props.teamId,
        resourceType: PerResourceTypeEnum.collection
      })
    ).toBe(0);
    await enableDatasetCollectionPermissions({ teamId: props.teamId, datasetId: props.datasetId });
    for (const collection of [single, ...batch]) {
      expect(
        await collectionClbs(props.teamId, String(collection._id)).then(toPermissionMap)
      ).toEqual(new Map([[props.tmbId, OwnerRoleVal]]));
    }
  });

  it('开启态 200 个同父级集合只读取一次父级 ACL，且每个集合保留 owner 和 reader', async () => {
    const users = await getFakeUsers(2);
    const dataset = await createDataset({ user: users.owner });
    const teamId = String(users.owner.teamId);
    const datasetId = String(dataset._id);
    await enableDatasetCollectionPermissions({ teamId, datasetId });
    const parent = await createCollection({
      user: users.owner,
      datasetId,
      name: 'parent',
      type: DatasetCollectionTypeEnum.folder
    });
    await setCollaborators({
      resource: { _id: String(parent._id), type: parent.type, teamId },
      resourceModel: MongoDatasetCollection,
      resourceType: PerResourceTypeEnum.collection,
      collaborators: [
        { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
      ]
    });
    const parentReads = vi.spyOn(resourcePermissionRepo, 'findByResourceIds');
    const rootReads = vi.spyOn(resourcePermissionRepo, 'findByResource');
    const writes = vi.spyOn(resourcePermissionRepo, 'insertResources');
    const deletes = vi.spyOn(MongoResourcePermission, 'deleteMany');
    try {
      const collections = await createCollections({
        collections: Array.from({ length: 200 }, (_, index) => ({
          teamId,
          datasetId,
          tmbId: String(users.owner.tmbId),
          parentId: String(parent._id),
          type: DatasetCollectionTypeEnum.apiFile,
          name: String(index),
          apiFileId: String(index)
        }))
      });
      expect(parentReads).toHaveBeenCalledTimes(1);
      expect(rootReads).not.toHaveBeenCalled();
      expect(writes).toHaveBeenCalledTimes(1);
      expect(deletes).not.toHaveBeenCalled();
      const rows = await MongoResourcePermission.find({
        teamId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: { $in: collections.map((collection) => String(collection._id)) }
      }).lean();
      for (const collection of collections) {
        expect(
          toPermissionMap(rows.filter((row) => String(row.resourceId) === String(collection._id)))
        ).toEqual(
          new Map([
            [String(users.owner.tmbId), OwnerRoleVal],
            [String(users.members[0].tmbId), ReadRoleVal]
          ])
        );
      }
    } finally {
      parentReads.mockRestore();
      rootReads.mockRestore();
      writes.mockRestore();
      deletes.mockRestore();
    }
  });

  it('关闭态创建独立权限集合被拒绝，真实事务回滚已创建集合', async () => {
    const users = await getFakeUsers(1);
    const dataset = await createDataset({ user: users.owner });
    const { mongoSessionRun: runRealTransaction } = await vi.importActual<
      typeof import('@fastgpt/service/common/mongo/sessionRun')
    >('@fastgpt/service/common/mongo/sessionRun');
    await expect(
      runRealTransaction((session) =>
        createCollections({
          collections: [
            {
              teamId: String(users.owner.teamId),
              tmbId: String(users.owner.tmbId),
              datasetId: String(dataset._id),
              type: DatasetCollectionTypeEnum.apiFile,
              name: 'independent',
              inheritPermission: false
            }
          ],
          session
        })
      )
    ).rejects.toBe(DatasetErrEnum.collectionPermissionDisabled);
    expect(await MongoDatasetCollection.countDocuments({ datasetId: dataset._id })).toBe(0);
    expect(
      await MongoResourcePermission.countDocuments({ resourceType: PerResourceTypeEnum.collection })
    ).toBe(0);
  });

  it('解析队列写入失败时真实事务回滚集合、ACL 和逐文件账单', async () => {
    const users = await getFakeUsers(1);
    const dataset = await createDataset({ user: users.owner });
    const teamId = String(users.owner.teamId);
    const datasetId = String(dataset._id);
    await enableDatasetCollectionPermissions({ teamId, datasetId });
    const modelHandle = vi.spyOn(modelCatalog, 'getTeamModelHandle').mockResolvedValue({
      getModelData: (
        _ref: unknown,
        options?: { type?: string; vision?: boolean; optional?: boolean }
      ) => {
        if (options?.vision) return undefined;
        if (options?.type === 'embedding') {
          return {
            modelId: 'embedding',
            config: { defaultToken: 100, maxToken: 100, weight: 0 }
          };
        }
        return {
          modelId: 'agent',
          config: { maxContext: 8000, maxResponse: 1000 }
        };
      }
    } as unknown as Awaited<ReturnType<typeof modelCatalog.getTeamModelHandle>>);
    const error = new Error('queue unavailable');
    const queueWrite = vi.spyOn(MongoDatasetTraining, 'insertMany').mockRejectedValueOnce(error);
    const { mongoSessionRun: runRealTransaction } = await vi.importActual<
      typeof import('@fastgpt/service/common/mongo/sessionRun')
    >('@fastgpt/service/common/mongo/sessionRun');
    try {
      await expect(
        runRealTransaction((session) =>
          createApiFileCollectionsBatch({
            dataset: dataset.toObject(),
            files: [
              { name: 'first', apiFileId: 'first' },
              { name: 'second', apiFileId: 'second' }
            ],
            createCollectionParams: {
              teamId,
              tmbId: String(users.owner.tmbId),
              datasetId,
              type: DatasetCollectionTypeEnum.apiFile
            },
            billing: { mode: 'perFile' },
            session
          })
        )
      ).rejects.toBe(error);
      expect(await MongoDatasetCollection.countDocuments({ datasetId })).toBe(0);
      expect(
        await MongoResourcePermission.countDocuments({
          teamId,
          resourceType: PerResourceTypeEnum.collection
        })
      ).toBe(0);
      expect(await MongoUsage.countDocuments({ teamId })).toBe(0);
      expect(await MongoUsageItem.countDocuments({ teamId })).toBe(0);
    } finally {
      modelHandle.mockRestore();
      queueWrite.mockRestore();
    }
  });
});

describe.sequential('moveCollectionPermission', () => {
  it.each([
    { name: '目录之间', fromRoot: false, toRoot: false },
    { name: '目录移到知识库根', fromRoot: false, toRoot: true },
    { name: '知识库根移入目录', fromRoot: true, toRoot: false }
  ])('继承节点移动：$name，撤销旧父授权并合并新父授权', async ({ fromRoot, toRoot }) => {
    const users = await getFakeUsers(2);
    const dataset = await createDataset({ user: users.owner });
    const datasetId = String(dataset._id);
    const teamId = String(users.owner.teamId);
    const source = fromRoot
      ? dataset
      : await createCollection({
          legacySnapshot: true,
          user: users.owner,
          datasetId,
          name: 'source',
          type: DatasetCollectionTypeEnum.folder
        });
    const target = toRoot
      ? dataset
      : await createCollection({
          legacySnapshot: true,
          user: users.owner,
          datasetId,
          name: 'target',
          type: DatasetCollectionTypeEnum.folder
        });
    for (const { resource, reader } of [
      { resource: source, reader: users.members[0] },
      { resource: target, reader: toRoot ? undefined : users.members[1] }
    ]) {
      const isDataset = String(resource._id) === datasetId;
      await setCollaborators({
        resource: { _id: String(resource._id), type: resource.type, teamId },
        resourceModel: isDataset ? MongoDataset : MongoDatasetCollection,
        resourceType: isDataset ? PerResourceTypeEnum.dataset : PerResourceTypeEnum.collection,
        collaborators: [
          { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
          ...(reader ? [{ tmbId: String(reader.tmbId), permission: ReadRoleVal }] : [])
        ]
      });
    }
    const child = await createCollection({
      legacySnapshot: true,
      user: users.owner,
      datasetId,
      name: 'child',
      parentId: fromRoot ? undefined : String(source._id)
    });
    await expect(collectionClbs(teamId, String(child._id)).then(toPermissionMap)).resolves.toEqual(
      new Map([
        [String(users.owner.tmbId), OwnerRoleVal],
        [String(users.members[0].tmbId), ReadRoleVal]
      ])
    );

    const targetParentId = toRoot ? null : String(target._id);
    await moveCollection({ collectionId: String(child._id), targetParentId });

    await expect(MongoDatasetCollection.findById(child._id).lean()).resolves.toMatchObject({
      parentId: targetParentId,
      inheritPermission: true
    });
    const expected = new Map([[String(users.owner.tmbId), OwnerRoleVal]]);
    if (!toRoot) expected.set(String(users.members[1].tmbId), ReadRoleVal);
    await expect(collectionClbs(teamId, String(child._id)).then(toPermissionMap)).resolves.toEqual(
      expected
    );
    // 存量 ACL 的兼容移动不能隐式开启集合权限。
    expect(await datasetSwitchState(datasetId)).toBe(false);
  });

  it.each([false, true])('独立权限节点移动保持隔离，目标为 dataset 根：%s', async (toRoot) => {
    const users = await getFakeUsers(2);
    const dataset = await createDataset({ user: users.owner });
    const datasetId = String(dataset._id);
    const teamId = String(users.owner.teamId);
    await enableDatasetCollectionPermissions({ teamId, datasetId });
    const folder = await createCollection({
      user: users.owner,
      datasetId,
      name: 'folder',
      type: DatasetCollectionTypeEnum.folder
    });
    // 父级带额外 reader，避免仅 owner 的 fixture 无法识别意外继承。
    await setCollaborators({
      resource: { _id: String(folder._id), type: folder.type, teamId },
      resourceModel: MongoDatasetCollection,
      resourceType: PerResourceTypeEnum.collection,
      collaborators: [
        { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
      ]
    });
    const independent = await createCollection({
      user: users.owner,
      datasetId,
      name: 'independent',
      parentId: toRoot ? String(folder._id) : undefined,
      inheritPermission: false
    });
    const targetParentId = toRoot ? null : String(folder._id);
    await moveCollection({ collectionId: String(independent._id), targetParentId });
    await expect(MongoDatasetCollection.findById(independent._id).lean()).resolves.toMatchObject({
      parentId: targetParentId,
      inheritPermission: false
    });
    await expect(
      collectionClbs(teamId, String(independent._id)).then(toPermissionMap)
    ).resolves.toEqual(new Map([[String(users.owner.tmbId), OwnerRoleVal]]));
    expect(await datasetSwitchState(datasetId)).toBe(true);
  });

  it('propagates the new snapshot to the descendants of a moved folder', async () => {
    const users = await getFakeUsers(2);
    const dataset = await createDataset({ user: users.owner });
    const folderA = await createCollection({
      legacySnapshot: true,
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'folder-a',
      type: DatasetCollectionTypeEnum.folder
    });
    const child = await createCollection({
      legacySnapshot: true,
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'child',
      parentId: String(folderA._id)
    });
    const folderB = await createCollection({
      legacySnapshot: true,
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
    expect(await datasetSwitchState(String(dataset._id))).toBe(false);
  });
});

// 保留真实 Mongo 的快照读取与子树传播；全局 session mock 不提供事务回滚验证。
describe.sequential(
  'moveCollectionPermissionsBatch / syncMovedCollectionPermissionDescendants',
  () => {
    it.each(['none', 'inherited', 'independent', 'two-level'])(
      '同批移动父子时使用新快照，中间祖先模式：%s',
      async (intermediateMode) => {
        const users = await getFakeUsers(4);
        const dataset = await createDataset({ user: users.owner });
        const datasetId = String(dataset._id);
        const teamId = String(users.owner.teamId);
        await enableDatasetCollectionPermissions({ teamId, datasetId });
        const folder = (name: string, parentId?: string) =>
          createCollection({
            user: users.owner,
            datasetId,
            name,
            parentId,
            type: DatasetCollectionTypeEnum.folder
          });
        const target = await folder('target');
        const oldParent = await folder('old-parent');
        const movingParent = await folder('moving-parent', String(oldParent._id));
        const intermediate =
          intermediateMode === 'none'
            ? movingParent
            : await createCollection({
                user: users.owner,
                datasetId,
                name: 'intermediate',
                type: DatasetCollectionTypeEnum.folder,
                parentId: String(movingParent._id),
                inheritPermission: intermediateMode !== 'independent'
              });
        const newParent =
          intermediateMode === 'two-level'
            ? await folder('intermediate-child', String(intermediate._id))
            : intermediate;
        const movingChild = await folder('moving-child', String(oldParent._id));
        const descendant = await createCollection({
          user: users.owner,
          datasetId,
          name: 'descendant',
          parentId: String(movingChild._id)
        });

        // 两个父目录的协作者不同，才能同时判别旧继承剥离与新快照传播。
        for (const [resource, member] of [
          [target, users.members[0]],
          [oldParent, users.members[1]]
        ] as const) {
          await setCollaborators({
            resource: { _id: String(resource._id), type: resource.type, teamId },
            resourceModel: MongoDatasetCollection,
            resourceType: PerResourceTypeEnum.collection,
            collaborators: [
              { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
              { tmbId: String(member.tmbId), permission: ReadRoleVal }
            ]
          });
        }

        // 自定义授权放在中间节点；两层场景还验证批量 ACL 归并和完整旧父级快照。
        if (intermediateMode !== 'none') {
          await setCollaborators({
            resource: { _id: String(intermediate._id), type: intermediate.type, teamId },
            resourceModel: MongoDatasetCollection,
            resourceType: PerResourceTypeEnum.collection,
            collaborators: [
              ...(await collectionClbs(teamId, String(intermediate._id))),
              { tmbId: String(users.members[2].tmbId), permission: WriteRoleVal }
            ].filter((collaborator): collaborator is { tmbId: string; permission: number } =>
              Boolean(collaborator.tmbId)
            )
          });
        }

        await mongoSessionRun((session) =>
          bulkMoveCollectionsParent({
            teamId,
            // 子节点在前，验证拓扑解析不依赖输入顺序；中间节点不在移动列表内。
            items: [
              {
                _id: String(movingChild._id),
                datasetId,
                type: movingChild.type,
                inheritPermission: movingChild.inheritPermission,
                oldParentId: String(oldParent._id),
                newParentId: new Types.ObjectId(String(newParent._id)),
                apiFileParentId: 'new-parent'
              },
              {
                _id: String(movingParent._id),
                datasetId,
                type: movingParent.type,
                inheritPermission: movingParent.inheritPermission,
                oldParentId: String(oldParent._id),
                newParentId: new Types.ObjectId(String(target._id)),
                apiFileParentId: 'target'
              }
            ],
            session
          })
        );

        const expected = new Map([
          [String(users.owner.tmbId), OwnerRoleVal],
          [String(users.members[0].tmbId), ReadRoleVal]
        ]);
        const descendantExpected = new Map(
          intermediateMode === 'independent'
            ? [[String(users.owner.tmbId), OwnerRoleVal]]
            : expected
        );
        if (intermediateMode !== 'none') {
          descendantExpected.set(String(users.members[2].tmbId), WriteRoleVal);
        }
        for (const id of new Set(
          [movingParent._id, intermediate._id, newParent._id, movingChild._id, descendant._id].map(
            String
          )
        )) {
          await expect(collectionClbs(teamId, id).then(toPermissionMap)).resolves.toEqual(
            id === String(movingParent._id) ? expected : descendantExpected
          );
        }
        await expect(
          MongoDatasetCollection.findById(movingChild._id).lean()
        ).resolves.toMatchObject({
          parentId: String(newParent._id)
        });
        await expect(
          MongoDatasetCollection.findById(movingParent._id).lean()
        ).resolves.toMatchObject({
          parentId: String(target._id)
        });
      }
    );
  }
);

describe.sequential('moveCollectionPermissionsBatch', () => {
  it('空列表无需读取或写入权限', async () => {
    await expect(
      mongoSessionRun((session) =>
        moveCollectionPermissionsBatch({
          teamId: 'unused-team',
          items: [],
          session
        })
      )
    ).resolves.toEqual([]);
  });

  it.each(['disabled', 'independent', 'root'])(
    '无需变更快照时保持数据且不生成子树传播计划：%s',
    async (mode) => {
      const users = await getFakeUsers(1);
      const dataset = await createDataset({ user: users.owner });
      const datasetId = String(dataset._id);
      const teamId = String(users.owner.teamId);
      if (mode !== 'disabled') await enableDatasetCollectionPermissions({ teamId, datasetId });
      const collection = await createCollection({
        user: users.owner,
        datasetId,
        name: 'folder',
        type: DatasetCollectionTypeEnum.folder,
        inheritPermission: mode !== 'independent'
      });
      const collectionId = String(collection._id);
      const before = toPermissionMap(await collectionClbs(teamId, collectionId));
      await expect(
        mongoSessionRun((session) =>
          moveCollectionPermissionsBatch({
            teamId,
            items: [
              {
                collectionId,
                datasetId,
                type: collection.type,
                inheritPermission: collection.inheritPermission,
                oldParentId: null,
                newParentId: null
              }
            ],
            session
          })
        )
      ).resolves.toEqual([]);
      await expect(collectionClbs(teamId, collectionId).then(toPermissionMap)).resolves.toEqual(
        before
      );
    }
  );

  it('源父级在计划后改变时拒绝整批迁移，重建计划后撤销实际旧父级的继承权限', async () => {
    const users = await getFakeUsers(3);
    const dataset = await createDataset({ user: users.owner });
    const teamId = String(users.owner.teamId);
    const datasetId = String(dataset._id);
    await enableDatasetCollectionPermissions({ teamId, datasetId });
    const folders: Awaited<ReturnType<typeof createCollection>>[] = [];
    for (const name of ['A', 'B', 'C']) {
      folders.push(
        await createCollection({
          user: users.owner,
          datasetId,
          name,
          type: DatasetCollectionTypeEnum.folder
        })
      );
    }
    const readers = users.members.map((user) => String(user.tmbId));
    await resourcePermissionRepo.replaceResources({
      teamId,
      resourceType: PerResourceTypeEnum.collection,
      resources: folders.map((folder, index) => ({
        resourceId: String(folder._id),
        collaborators: [
          { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
          { tmbId: readers[index], permission: ReadRoleVal }
        ]
      }))
    });
    const file = await createCollection({
      user: users.owner,
      datasetId,
      name: 'body',
      parentId: String(folders[0]._id),
      type: DatasetCollectionTypeEnum.apiFile
    });
    const item = {
      _id: String(file._id),
      datasetId,
      type: file.type,
      inheritPermission: file.inheritPermission,
      oldParentId: String(folders[0]._id),
      newParentId: new Types.ObjectId(String(folders[2]._id)),
      apiFileParentId: 'C'
    };
    const { mongoSessionRun: runTransaction } = await vi.importActual<
      typeof import('@fastgpt/service/common/mongo/sessionRun')
    >('@fastgpt/service/common/mongo/sessionRun');
    await runTransaction((session) =>
      bulkMoveCollectionsParent({
        teamId,
        items: [
          { ...item, newParentId: new Types.ObjectId(String(folders[1]._id)), apiFileParentId: 'B' }
        ],
        session
      })
    );
    const before = toPermissionMap(await collectionClbs(teamId, String(file._id)));
    expect(before.get(readers[1])).toBe(ReadRoleVal);
    await expect(
      runTransaction((session) => bulkMoveCollectionsParent({ teamId, items: [item], session }))
    ).rejects.toThrow('Collection parent plan has changed');
    expect(String((await MongoDatasetCollection.findById(file._id).lean())!.parentId)).toBe(
      String(folders[1]._id)
    );
    expect(toPermissionMap(await collectionClbs(teamId, String(file._id)))).toEqual(before);
    await runTransaction((session) =>
      bulkMoveCollectionsParent({
        teamId,
        items: [{ ...item, oldParentId: String(folders[1]._id) }],
        session
      })
    );
    const after = toPermissionMap(await collectionClbs(teamId, String(file._id)));
    expect(after.has(readers[0])).toBe(false);
    expect(after.has(readers[1])).toBe(false);
    expect(after.get(readers[2])).toBe(ReadRoleVal);
  });

  it.each(['inheritPermission', 'type', 'deleted'])(
    '源状态 %s 在计划后改变时拒绝写入',
    async (mode) => {
      const users = await getFakeUsers(1);
      const dataset = await createDataset({ user: users.owner });
      const teamId = String(users.owner.teamId),
        datasetId = String(dataset._id);
      await enableDatasetCollectionPermissions({ teamId, datasetId });
      const file = await createCollection({
        user: users.owner,
        datasetId,
        name: 'file',
        type: DatasetCollectionTypeEnum.apiFile
      });
      const target = await createCollection({
        user: users.owner,
        datasetId,
        name: 'target',
        type: DatasetCollectionTypeEnum.folder
      });
      if (mode === 'deleted') await MongoDatasetCollection.deleteOne({ _id: file._id });
      else
        await MongoDatasetCollection.updateOne(
          { _id: file._id },
          {
            $set:
              mode === 'type'
                ? { type: DatasetCollectionTypeEnum.folder }
                : { inheritPermission: false }
          }
        );
      const before = toPermissionMap(await collectionClbs(teamId, String(file._id)));
      const { mongoSessionRun: runTransaction } = await vi.importActual<
        typeof import('@fastgpt/service/common/mongo/sessionRun')
      >('@fastgpt/service/common/mongo/sessionRun');
      await expect(
        runTransaction((session) =>
          bulkMoveCollectionsParent({
            teamId,
            items: [
              {
                _id: String(file._id),
                datasetId,
                type: file.type,
                inheritPermission: file.inheritPermission,
                oldParentId: null,
                newParentId: new Types.ObjectId(String(target._id)),
                apiFileParentId: 'target'
              }
            ],
            session
          })
        )
      ).rejects.toThrow('Collection parent plan has changed');
      expect(toPermissionMap(await collectionClbs(teamId, String(file._id)))).toEqual(before);
    }
  );

  it('独立权限节点同批脱离旧祖先时，按最终结构计算 ACL 并传播到未移动后代', async () => {
    const users = await getFakeUsers(1);
    const dataset = await createDataset({ user: users.owner });
    const teamId = String(users.owner.teamId),
      datasetId = String(dataset._id);
    await enableDatasetCollectionPermissions({ teamId, datasetId });
    const p = await createCollection({
      user: users.owner,
      datasetId,
      name: 'P',
      type: DatasetCollectionTypeEnum.folder
    });
    const a = await createCollection({
      user: users.owner,
      datasetId,
      name: 'A',
      type: DatasetCollectionTypeEnum.folder,
      parentId: String(p._id),
      inheritPermission: false
    });
    const t = await createCollection({
      user: users.owner,
      datasetId,
      name: 'T',
      type: DatasetCollectionTypeEnum.folder,
      parentId: String(a._id)
    });
    await resourcePermissionRepo.replaceResources({
      teamId,
      resourceType: PerResourceTypeEnum.collection,
      resources: [a, t].map((row) => ({
        resourceId: String(row._id),
        collaborators: [
          { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
          { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
        ]
      }))
    });
    const descendant = await createCollection({
      user: users.owner,
      datasetId,
      name: 'descendant',
      parentId: String(p._id)
    });
    const independentBefore = toPermissionMap(await collectionClbs(teamId, String(a._id)));
    const { mongoSessionRun: runTransaction } = await vi.importActual<
      typeof import('@fastgpt/service/common/mongo/sessionRun')
    >('@fastgpt/service/common/mongo/sessionRun');
    await runTransaction((session) =>
      bulkMoveCollectionsParent({
        teamId,
        items: [
          [p, null, t],
          [a, p, null]
        ].map(([row, oldParent, parent]) => ({
          _id: String(row!._id),
          datasetId,
          type: row!.type,
          inheritPermission: row!.inheritPermission,
          oldParentId: oldParent ? String(oldParent._id) : null,
          newParentId: parent ? new Types.ObjectId(String(parent._id)) : null,
          apiFileParentId: parent?.name ?? null
        })),
        session
      })
    );
    expect((await MongoDatasetCollection.findById(a._id).lean())!.parentId).toBeNull();
    expect(String((await MongoDatasetCollection.findById(p._id).lean())!.parentId)).toBe(
      String(t._id)
    );
    expect(toPermissionMap(await collectionClbs(teamId, String(a._id)))).toEqual(independentBefore);
    for (const row of [p, descendant]) {
      expect(
        toPermissionMap(await collectionClbs(teamId, String(row._id))).get(
          String(users.members[0].tmbId)
        )
      ).toBe(ReadRoleVal);
    }
  });

  it('多个移动节点共享两层外部祖先时复用新快照，两个分支都继承新权限', async () => {
    const users = await getFakeUsers(2);
    const dataset = await createDataset({ user: users.owner });
    const datasetId = String(dataset._id);
    const teamId = String(users.owner.teamId);
    await enableDatasetCollectionPermissions({ teamId, datasetId });
    const folder = (name: string, parentId?: string) =>
      createCollection({
        user: users.owner,
        datasetId,
        name,
        parentId,
        type: DatasetCollectionTypeEnum.folder
      });
    const target = await folder('target');
    const ancestor = await folder('ancestor');
    const shared = await folder('shared', String(ancestor._id));
    const left = await folder('left', String(shared._id));
    const right = await folder('right', String(shared._id));
    const movingLeft = await folder('moving-left');
    const movingRight = await folder('moving-right');
    const movingSameParent = await folder('moving-same-parent');
    await setCollaborators({
      resource: { _id: String(target._id), type: target.type, teamId },
      resourceModel: MongoDatasetCollection,
      resourceType: PerResourceTypeEnum.collection,
      collaborators: [
        { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
      ]
    });

    // shared、left、right 都不移动。先解析 left 再解析 right，第二条路径会经过已算过的 shared。
    const moves = [
      [movingLeft, left],
      [movingRight, right],
      [movingSameParent, left],
      [ancestor, target]
    ] as const;
    await mongoSessionRun((session) =>
      bulkMoveCollectionsParent({
        teamId,
        items: moves.map(([collection, parent]) => ({
          _id: String(collection._id),
          datasetId,
          type: collection.type,
          inheritPermission: collection.inheritPermission,
          oldParentId: null,
          newParentId: new Types.ObjectId(String(parent._id)),
          apiFileParentId: parent.name
        })),
        session
      })
    );

    const expected = new Map([
      [String(users.owner.tmbId), OwnerRoleVal],
      [String(users.members[0].tmbId), ReadRoleVal]
    ]);
    for (const collection of [
      ancestor,
      shared,
      left,
      right,
      movingLeft,
      movingRight,
      movingSameParent
    ]) {
      await expect(
        collectionClbs(teamId, String(collection._id)).then(toPermissionMap)
      ).resolves.toEqual(expected);
    }
    for (const [collection, parent] of moves) {
      await expect(MongoDatasetCollection.findById(collection._id).lean()).resolves.toMatchObject({
        parentId: String(parent._id)
      });
    }
  });

  it('旧节点缺少 ACL 快照时按空快照重建，移入空权限父级时撤销继承授权', async () => {
    const users = await getFakeUsers(2);
    const dataset = await createDataset({ user: users.owner });
    const datasetId = String(dataset._id);
    const teamId = String(users.owner.teamId);
    await enableDatasetCollectionPermissions({ teamId, datasetId });
    const folder = (name: string, parentId?: string) =>
      createCollection({
        user: users.owner,
        datasetId,
        name,
        parentId,
        type: DatasetCollectionTypeEnum.folder
      });
    const target = await folder('target');
    const emptyParent = await folder('legacy-empty-parent');
    const ancestor = await folder('legacy-ancestor', String(emptyParent._id));
    const intermediate = await folder('legacy-intermediate', String(ancestor._id));
    const movingChild = await folder('legacy-moving-child', String(emptyParent._id));
    await setCollaborators({
      resource: { _id: String(target._id), type: target.type, teamId },
      resourceModel: MongoDatasetCollection,
      resourceType: PerResourceTypeEnum.collection,
      collaborators: [
        { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
        { tmbId: String(users.members[0].tmbId), permission: ReadRoleVal }
      ]
    });
    await resourcePermissionRepo.deleteByResources({
      teamId,
      resourceType: PerResourceTypeEnum.collection,
      resourceIds: [emptyParent, ancestor, intermediate, movingChild].map((node) =>
        String(node._id)
      )
    });

    await mongoSessionRun((session) =>
      bulkMoveCollectionsParent({
        teamId,
        items: [
          [movingChild, intermediate],
          [ancestor, target]
        ].map(([collection, parent]) => ({
          _id: String(collection._id),
          datasetId,
          type: collection.type,
          oldParentId: String(emptyParent._id),
          newParentId: new Types.ObjectId(String(parent._id)),
          apiFileParentId: parent.name
        })),
        session
      })
    );
    for (const collection of [ancestor, intermediate, movingChild]) {
      await expect(
        collectionClbs(teamId, String(collection._id)).then(toPermissionMap)
      ).resolves.toEqual(
        new Map([
          [String(users.owner.tmbId), ManageRoleVal],
          [String(users.members[0].tmbId), ReadRoleVal]
        ])
      );
    }
    await mongoSessionRun((session) =>
      bulkMoveCollectionsParent({
        teamId,
        items: [
          {
            _id: String(movingChild._id),
            datasetId,
            type: movingChild.type,
            oldParentId: String(intermediate._id),
            newParentId: new Types.ObjectId(String(emptyParent._id)),
            apiFileParentId: emptyParent.name
          }
        ],
        session
      })
    );
    await expect(collectionClbs(teamId, String(movingChild._id))).resolves.toEqual([]);
  });

  it.each(['disabled', 'independent'])('权限模式 %s 仍拒绝将目录移入自身后代', async (mode) => {
    const users = await getFakeUsers(1);
    const dataset = await createDataset({ user: users.owner });
    const datasetId = String(dataset._id);
    const teamId = String(users.owner.teamId);
    if (mode === 'independent') await enableDatasetCollectionPermissions({ teamId, datasetId });
    const parent = await createCollection({
      user: users.owner,
      datasetId,
      name: 'parent',
      type: DatasetCollectionTypeEnum.folder,
      inheritPermission: mode !== 'independent'
    });
    const child = await createCollection({
      user: users.owner,
      datasetId,
      name: 'child',
      type: DatasetCollectionTypeEnum.folder,
      parentId: String(parent._id)
    });
    await expect(
      mongoSessionRun((session) =>
        bulkMoveCollectionsParent({
          teamId,
          session,
          items: [
            {
              _id: String(parent._id),
              datasetId,
              type: parent.type,
              inheritPermission: parent.inheritPermission,
              oldParentId: null,
              newParentId: new Types.ObjectId(String(child._id)),
              apiFileParentId: 'child'
            }
          ]
        })
      )
    ).rejects.toThrow('Circular parent plan');
    expect((await MongoDatasetCollection.findById(parent._id).lean())?.parentId).toBeNull();
    expect(String((await MongoDatasetCollection.findById(child._id).lean())?.parentId)).toBe(
      String(parent._id)
    );
  });

  it.each(['moving', 'external-self', 'external-pair', 'mixed'])(
    '目标父级循环在写入前失败，保留原快照和父级：%s',
    async (mode) => {
      const users = await getFakeUsers(1);
      const dataset = await createDataset({ user: users.owner });
      const datasetId = String(dataset._id);
      const teamId = String(users.owner.teamId);
      await enableDatasetCollectionPermissions({ teamId, datasetId });
      const folders = await Promise.all(
        ['a', 'b', 'moving'].map((name) =>
          createCollection({
            user: users.owner,
            datasetId,
            name,
            type: DatasetCollectionTypeEnum.folder
          })
        )
      );
      const [a, b, moving] = folders;
      // 直接写入历史脏树，避免通过业务移动接口构造时提前拒绝环。
      if (mode === 'external-self' || mode === 'external-pair') {
        await MongoDatasetCollection.updateOne(
          { _id: a._id },
          { $set: { parentId: String(mode === 'external-self' ? a._id : b._id) } }
        );
        if (mode === 'external-pair') {
          await MongoDatasetCollection.updateOne(
            { _id: b._id },
            { $set: { parentId: String(a._id) } }
          );
        }
      } else if (mode === 'mixed') {
        await MongoDatasetCollection.updateOne(
          { _id: a._id },
          { $set: { parentId: String(moving._id) } }
        );
      }
      const before = await Promise.all(
        folders.map(async (folder) => ({
          parentId: (await MongoDatasetCollection.findById(folder._id).lean())?.parentId,
          permissions: toPermissionMap(await collectionClbs(teamId, String(folder._id)))
        }))
      );
      const moves =
        mode === 'moving'
          ? [
              [a, b],
              [b, a]
            ]
          : [[moving, a]];
      await expect(
        mongoSessionRun((session) =>
          bulkMoveCollectionsParent({
            teamId,
            items: moves.map(([collection, parent]) => ({
              _id: String(collection._id),
              datasetId,
              type: collection.type,
              oldParentId: null,
              newParentId: new Types.ObjectId(String(parent._id)),
              apiFileParentId: parent.name
            })),
            session
          })
        )
      ).rejects.toThrow('Circular parent plan');
      for (const [index, folder] of folders.entries()) {
        await expect(
          collectionClbs(teamId, String(folder._id)).then(toPermissionMap)
        ).resolves.toEqual(before[index].permissions);
        expect((await MongoDatasetCollection.findById(folder._id).lean())?.parentId).toBe(
          before[index].parentId
        );
      }
    }
  );
});

describe('syncMovedCollectionPermissionDescendants', () => {
  it('空传播计划直接返回', async () => {
    await expect(
      mongoSessionRun((session) =>
        syncMovedCollectionPermissionDescendants({
          teamId: 'unused-team',
          folders: [],
          movedCollectionIds: new Set(),
          session
        })
      )
    ).resolves.toBeUndefined();
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
      legacySnapshot: true,
      user: users.owner,
      datasetId: String(childDataset._id),
      name: 'child-root-collection'
    });

    const newRootClbs = [
      { tmbId: String(users.owner.tmbId), permission: OwnerRoleVal },
      { tmbId: String(users.members[2].tmbId), permission: ReadRoleVal }
    ];
    // 开关按 dataset 独立判定：被断言 collection 所属的 child dataset 需为启用态
    await enableDatasetCollectionPermissions({
      teamId: String(users.owner.teamId),
      datasetId: String(childDataset._id)
    });
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

  it('dataset folder（自身开关关闭）授权透传到子知识库的 collection folder 与文件', async () => {
    const users = await getFakeUsers(2);
    const teamId = String(users.owner.teamId);
    const ownerTmbId = String(users.owner.tmbId);
    const memberTmbId = String(users.members[0].tmbId);

    // folder 类型 dataset 永远不会开启 collection 权限开关
    const outerFolder = await mongoSessionRun(async (session) => {
      const folder = await MongoDataset.create({
        teamId,
        tmbId: ownerTmbId,
        type: DatasetTypeEnum.folder,
        name: 'outer-folder'
      });
      await createResourceDefaultCollaborators({
        resource: { _id: String(folder._id), type: folder.type, teamId },
        resourceType: PerResourceTypeEnum.dataset,
        session,
        tmbId: ownerTmbId
      });
      return folder;
    });
    const dataset = await mongoSessionRun(async (session) => {
      const child = await MongoDataset.create({
        teamId,
        tmbId: ownerTmbId,
        parentId: outerFolder._id,
        type: DatasetTypeEnum.dataset,
        name: 'child-dataset'
      });
      await createResourceDefaultCollaborators({
        resource: { _id: String(child._id), type: child.type, teamId },
        resourceType: PerResourceTypeEnum.dataset,
        session,
        tmbId: ownerTmbId
      });
      return child;
    });
    await enableDatasetCollectionPermissions({ teamId, datasetId: String(dataset._id) });

    const folder = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'collection-folder',
      type: DatasetCollectionTypeEnum.folder
    });
    const file = await createCollection({
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'file',
      parentId: String(folder._id)
    });

    await mongoSessionRun(async (session) => {
      const oldOuterClbs = await getResourceOwnedClbs({
        teamId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: String(outerFolder._id),
        session
      });
      const newOuterClbs = [...oldOuterClbs, { tmbId: memberTmbId, permission: ManageRoleVal }];
      // 生产顺序：先同步 collection，再写 dataset 树（后代快照此时仍是旧值）
      await syncDatasetToCollections({
        teamId,
        datasetId: String(outerFolder._id),
        oldEffectiveClbs: oldOuterClbs,
        newEffectiveClbs: newOuterClbs,
        session
      });
      await updateResourceCollaborators({
        resource: { _id: String(outerFolder._id), type: outerFolder.type, teamId },
        resourceModel: MongoDataset,
        resourceType: PerResourceTypeEnum.dataset,
        oldCollaborators: oldOuterClbs,
        newCollaborators: newOuterClbs,
        session
      });
    });

    const expectedMap = new Map([
      [ownerTmbId, OwnerRoleVal],
      [memberTmbId, ManageRoleVal]
    ]);
    for (const collectionId of [String(folder._id), String(file._id)]) {
      await expect(collectionClbs(teamId, collectionId).then(toPermissionMap)).resolves.toEqual(
        expectedMap
      );
    }
  });

  it('开关按 dataset 独立判定：关闭态子知识库的 collection 快照保持不变', async () => {
    const users = await getFakeUsers(2);
    const teamId = String(users.owner.teamId);
    const ownerTmbId = String(users.owner.tmbId);
    const memberTmbId = String(users.members[0].tmbId);

    const outerFolder = await mongoSessionRun(async (session) => {
      const folder = await MongoDataset.create({
        teamId,
        tmbId: ownerTmbId,
        type: DatasetTypeEnum.folder,
        name: 'outer-folder'
      });
      await createResourceDefaultCollaborators({
        resource: { _id: String(folder._id), type: folder.type, teamId },
        resourceType: PerResourceTypeEnum.dataset,
        session,
        tmbId: ownerTmbId
      });
      return folder;
    });
    const createChildDataset = (name: string) =>
      mongoSessionRun(async (session) => {
        const child = await MongoDataset.create({
          teamId,
          tmbId: ownerTmbId,
          parentId: outerFolder._id,
          type: DatasetTypeEnum.dataset,
          name
        });
        await createResourceDefaultCollaborators({
          resource: { _id: String(child._id), type: child.type, teamId },
          resourceType: PerResourceTypeEnum.dataset,
          session,
          tmbId: ownerTmbId
        });
        return child;
      });
    const enabledDataset = await createChildDataset('enabled-dataset');
    const disabledDataset = await createChildDataset('disabled-dataset');
    await enableDatasetCollectionPermissions({ teamId, datasetId: String(enabledDataset._id) });

    const enabledFile = await createCollection({
      user: users.owner,
      datasetId: String(enabledDataset._id),
      name: 'enabled-file'
    });
    // 关闭态存量数据可能残留 ACL 行，跨树同步不应触碰
    const disabledFile = await createCollection({
      user: users.owner,
      datasetId: String(disabledDataset._id),
      name: 'disabled-file',
      legacySnapshot: true
    });

    await mongoSessionRun(async (session) => {
      const oldOuterClbs = await getResourceOwnedClbs({
        teamId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: String(outerFolder._id),
        session
      });
      const newOuterClbs = [...oldOuterClbs, { tmbId: memberTmbId, permission: ReadRoleVal }];
      await syncDatasetToCollections({
        teamId,
        datasetId: String(outerFolder._id),
        oldEffectiveClbs: oldOuterClbs,
        newEffectiveClbs: newOuterClbs,
        session
      });
    });

    await expect(
      collectionClbs(teamId, String(enabledFile._id)).then(toPermissionMap)
    ).resolves.toEqual(
      new Map([
        [ownerTmbId, OwnerRoleVal],
        [memberTmbId, ReadRoleVal]
      ])
    );
    await expect(
      collectionClbs(teamId, String(disabledFile._id)).then(toPermissionMap)
    ).resolves.toEqual(new Map([[ownerTmbId, OwnerRoleVal]]));
  });

  it('收集阶段剪掉独立权限子树：不查询其后代，也不加载其 ACL', async () => {
    const users = await getFakeUsers(1);
    const teamId = String(users.owner.teamId);
    const ownerTmbId = String(users.owner.tmbId);

    const root = await createDataset({ user: users.owner });
    const independent = await MongoDataset.create({
      teamId,
      tmbId: ownerTmbId,
      parentId: root._id,
      type: DatasetTypeEnum.folder,
      name: 'independent-folder',
      inheritPermission: false
    });
    // 独立子树内的后代即使开启继承，也不会受 root 授权变化影响
    const independentGrandChild = await MongoDataset.create({
      teamId,
      tmbId: ownerTmbId,
      parentId: independent._id,
      type: DatasetTypeEnum.dataset,
      name: 'independent-child'
    });

    const findSpy = vi.spyOn(MongoDataset, 'find');
    const aclReadSpy = vi.spyOn(resourcePermissionRepo, 'findByResourceIds');
    try {
      const rootClbs = [{ tmbId: ownerTmbId, permission: OwnerRoleVal }];
      await mongoSessionRun((session) =>
        syncDatasetToCollections({
          teamId,
          datasetId: String(root._id),
          oldEffectiveClbs: rootClbs,
          newEffectiveClbs: rootClbs,
          session
        })
      );

      // 独立分支在收集阶段就被剪掉：只查询 root 这一层，不再以独立节点为父级继续下探
      expect(findSpy).toHaveBeenCalledTimes(1);
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: { $in: [String(root._id)] } }),
        expect.any(String)
      );
      const loadedResourceIds = aclReadSpy.mock.calls.flatMap(([args]) =>
        args.resourceIds.map(String)
      );
      expect(loadedResourceIds).not.toContain(String(independent._id));
      expect(loadedResourceIds).not.toContain(String(independentGrandChild._id));
    } finally {
      findSpy.mockRestore();
      aclReadSpy.mockRestore();
    }
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
      legacySnapshot: true,
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'root-file'
    });
    const rootFolder = await createCollection({
      legacySnapshot: true,
      user: users.owner,
      datasetId: String(dataset._id),
      name: 'root-folder',
      type: DatasetCollectionTypeEnum.folder
    });
    const child = await createCollection({
      legacySnapshot: true,
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

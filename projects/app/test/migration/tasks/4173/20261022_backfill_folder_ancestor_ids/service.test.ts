import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types, type Model } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import {
  migrateFolderMigrationBatch,
  readFolderMigrationDocsByIds,
  getFolderMigrationSnapshot,
  readFolderMigrationBatch
} from '@/migration/tasks/4173/20261022_backfill_folder_ancestor_ids/service';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  createResourceDefaultCollaborators,
  getResourceOwnedClbs
} from '@fastgpt/service/support/permission/controller';
import { enableDatasetCollectionPermissions } from '@fastgpt/service/support/permission/collection/enable';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import updateHandler from '@/pages/api/core/app/update';

// 这些用例验证真实提交、冲突重试和回滚，不能沿用全局的无事务 mock。
vi.mock('@fastgpt/service/common/mongo/sessionRun', async (importOriginal) => importOriginal());

const teamId = new Types.ObjectId();
const appIds = [
  new Types.ObjectId(),
  new Types.ObjectId(),
  new Types.ObjectId(),
  new Types.ObjectId(),
  new Types.ObjectId()
];
const datasetIds = Array.from({ length: 4 }, () => new Types.ObjectId());
const depthIds = Array.from({ length: 22 }, () => new Types.ObjectId());

describe('folder ancestor path migration service', () => {
  afterEach(async () => {
    await Promise.all([
      MongoApp.collection.deleteMany({ _id: { $in: appIds } }),
      MongoDataset.collection.deleteMany({ _id: { $in: [...datasetIds, ...depthIds] } })
    ]);
  });

  it('bounds stable batches by the initial snapshot, includes soft-deleted rows, and ignores invalid retry IDs', async () => {
    expect(await getFolderMigrationSnapshot('apps')).toEqual({ endId: null, total: 0 });
    await MongoApp.collection.insertMany([
      { _id: appIds[0], teamId, type: 'folder' },
      { _id: appIds[1], teamId, type: 'folder', deleteTime: new Date() },
      { _id: appIds[2], teamId, type: 'folder' }
    ]);
    const { endId, total } = await getFolderMigrationSnapshot('apps');
    expect(String(endId)).toBe(String(appIds[2]));
    expect(total).toBe(3);
    await MongoApp.collection.insertOne({ _id: appIds[3], teamId, type: 'folder' });
    const first = await readFolderMigrationBatch({
      stage: 'apps',
      lastId: null,
      endId: endId!,
      limit: 2
    });
    expect(first.map((doc) => String(doc._id))).toEqual(appIds.slice(0, 2).map(String));
    const last = await readFolderMigrationBatch({
      stage: 'apps',
      lastId: appIds[1],
      endId: endId!,
      limit: 2
    });
    expect(last.map((doc) => String(doc._id))).toEqual([String(appIds[2])]);
    expect(await readFolderMigrationDocsByIds({ stage: 'apps', ids: ['invalid'] })).toEqual([]);
  });

  it('rebuilds App and tool folder paths independently and clears non-folder paths', async () => {
    await MongoApp.collection.insertMany([
      { _id: appIds[0], teamId, type: 'folder', parentId: null },
      { _id: appIds[1], teamId, type: 'folder', parentId: appIds[0], ancestorIds: [appIds[2]] },
      { _id: appIds[2], teamId, type: 'toolFolder', parentId: null },
      { _id: appIds[3], teamId, type: 'advanced', parentId: null, ancestorIds: [appIds[0]] }
    ]);

    const result = await migrateFolderMigrationBatch({
      stage: 'apps',
      docs: await MongoApp.collection
        .find({ _id: { $in: appIds } })
        .sort({ _id: 1 })
        .toArray()
    });

    expect(result).toEqual({ errors: [], changedCount: 4 });
    expect(await MongoApp.collection.findOne({ _id: appIds[0] })).toMatchObject({
      ancestorIds: []
    });
    expect(await MongoApp.collection.findOne({ _id: appIds[1] })).toMatchObject({
      ancestorIds: [appIds[0]]
    });
    expect(await MongoApp.collection.findOne({ _id: appIds[2] })).toMatchObject({
      ancestorIds: []
    });
    expect(await MongoApp.collection.findOne({ _id: appIds[3] })).not.toHaveProperty('ancestorIds');
  });

  it('skips invalid parents, cycles, and over-depth rows without partial path writes', async () => {
    await MongoDataset.collection.insertMany([
      { _id: datasetIds[0], teamId, type: 'folder', parentId: datasetIds[1] },
      { _id: datasetIds[1], teamId, type: 'dataset', parentId: null },
      { _id: datasetIds[2], teamId, type: 'folder', parentId: datasetIds[3] },
      { _id: datasetIds[3], teamId, type: 'folder', parentId: datasetIds[2] },
      ...depthIds.map((id, index) => ({
        _id: id,
        teamId,
        type: 'folder',
        parentId: depthIds[index - 1] ?? null
      }))
    ]);

    const invalidDocs = await MongoDataset.collection
      .find({ _id: { $in: [datasetIds[2], depthIds[depthIds.length - 1]] } })
      .toArray();
    const result = await migrateFolderMigrationBatch({ stage: 'datasets', docs: invalidDocs });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        { id: String(datasetIds[2]), reason: 'folder parent cycle detected' },
        {
          id: String(depthIds[depthIds.length - 1]),
          reason: 'folder hierarchy exceeds the traversal limit'
        }
      ])
    );
    expect(result.errors).toHaveLength(2);
    expect(await MongoDataset.collection.findOne({ _id: datasetIds[2] })).not.toHaveProperty(
      'ancestorIds'
    );
  });

  it('moves cross-tree children to the root instead of failing the migration', async () => {
    await MongoApp.collection.insertMany([
      // 普通文件夹被挂在工具文件夹下：直接父级跨树，记录移到顶层。
      { _id: appIds[0], teamId, type: 'folder', parentId: appIds[2], ancestorIds: [appIds[2]] },
      // 普通应用挂在同树文件夹下，属于正常数据。
      {
        _id: appIds[1],
        teamId,
        type: 'advanced',
        parentId: appIds[0],
        ancestorIds: [appIds[2], appIds[0]]
      },
      { _id: appIds[2], teamId, type: 'toolFolder', parentId: null, ancestorIds: [] },
      // 工具文件夹被挂在普通文件夹下：同样移到顶层。
      { _id: appIds[3], teamId, type: 'toolFolder', parentId: appIds[4], ancestorIds: [appIds[4]] },
      { _id: appIds[4], teamId, type: 'folder', parentId: null, ancestorIds: [] }
    ]);

    const result = await migrateFolderMigrationBatch({
      stage: 'apps',
      docs: await MongoApp.collection
        .find({ _id: { $in: appIds } })
        .sort({ _id: 1 })
        .toArray()
    });

    // 跨树记录不再计入失败，迁移不会因此整体失败。
    expect(result.errors).toEqual([]);
    expect(await MongoApp.collection.findOne({ _id: appIds[0] })).toMatchObject({
      parentId: null,
      ancestorIds: []
    });
    expect(await MongoApp.collection.findOne({ _id: appIds[3] })).toMatchObject({
      parentId: null,
      ancestorIds: []
    });
    // 非文件夹资源不维护路径字段。
    expect(await MongoApp.collection.findOne({ _id: appIds[1] })).toMatchObject({
      parentId: appIds[0]
    });
    expect(await MongoApp.collection.findOne({ _id: appIds[1] })).not.toHaveProperty('ancestorIds');

    // 改写后必须能通过校验，否则重试会反复卡在同一条记录上。
    await expect(
      migrateFolderMigrationBatch({
        stage: 'apps',
        docs: await MongoApp.collection.find({ _id: { $in: appIds } }).toArray(),
        verifyOnly: true
      })
    ).resolves.toEqual({ errors: [], changedCount: 0 });
  });

  it('truncates the path at the cross-tree boundary without cascading to descendants', async () => {
    await MongoApp.collection.insertMany([
      // appIds[0] 同属 app 树，但它的父级是工具文件夹。
      { _id: appIds[0], teamId, type: 'folder', parentId: appIds[4], ancestorIds: [appIds[4]] },
      // 子孙路径曾被写入跨树的工具文件夹 ID，必须截断成只含同树祖先。
      {
        _id: appIds[2],
        teamId,
        type: 'folder',
        parentId: appIds[0],
        ancestorIds: [appIds[4], appIds[0]]
      },
      { _id: appIds[1], teamId, type: 'folder', parentId: appIds[2], ancestorIds: [] },
      { _id: appIds[4], teamId, type: 'toolFolder', parentId: null, ancestorIds: [] }
    ]);

    await migrateFolderMigrationBatch({
      stage: 'apps',
      docs: await MongoApp.collection.find({ _id: { $in: appIds } }).toArray()
    });

    // 直接父级跨树的 appIds[0] 移到顶层。
    expect(await MongoApp.collection.findOne({ _id: appIds[0] })).toMatchObject({
      parentId: null,
      ancestorIds: []
    });
    // 子孙与父级的同树关系保持不变，只把路径里越界的工具文件夹裁掉。
    expect(await MongoApp.collection.findOne({ _id: appIds[2] })).toMatchObject({
      parentId: appIds[0],
      ancestorIds: [appIds[0]]
    });
    expect(await MongoApp.collection.findOne({ _id: appIds[1] })).toMatchObject({
      parentId: appIds[2],
      ancestorIds: [appIds[0], appIds[2]]
    });
  });

  it('backfills folders deeper than the create-time policy limit', async () => {
    // 历史数据存在在深度上限生效前就已超过 4 层的合法嵌套；迁移必须能回填，
    // 不能把“新建文件夹”的策略上限当成迁移边界。
    const chainIds = Array.from({ length: 6 }, () => new Types.ObjectId());
    await MongoDataset.collection.insertMany(
      chainIds.map((id, index) => ({
        _id: id,
        teamId,
        type: 'folder',
        parentId: chainIds[index - 1] ?? null
      }))
    );

    try {
      const result = await migrateFolderMigrationBatch({
        stage: 'datasets',
        docs: await MongoDataset.collection
          .find({ _id: { $in: chainIds } })
          .sort({ _id: 1 })
          .toArray()
      });

      expect(result.errors).toEqual([]);
      // 第 6 层文件夹的路径应包含全部 5 个祖先。
      const tail = await MongoDataset.collection.findOne({ _id: chainIds[5] });
      expect(tail?.ancestorIds?.map(String)).toEqual(chainIds.slice(0, 5).map(String));

      // 回填后必须能通过校验。
      await expect(
        migrateFolderMigrationBatch({
          stage: 'datasets',
          docs: await MongoDataset.collection.find({ _id: { $in: chainIds } }).toArray(),
          verifyOnly: true
        })
      ).resolves.toEqual({ errors: [], changedCount: 0 });
    } finally {
      await MongoDataset.collection.deleteMany({ _id: { $in: chainIds } });
    }
  });

  it('validates without writing and remains idempotent after a successful backfill', async () => {
    await MongoDataset.collection.insertMany([
      { _id: datasetIds[0], teamId, type: 'folder', parentId: null, ancestorIds: ['stale'] }
    ]);
    const docs = await MongoDataset.collection.find({ _id: datasetIds[0] }).toArray();

    expect(await migrateFolderMigrationBatch({ stage: 'datasets', docs })).toMatchObject({
      changedCount: 1,
      errors: []
    });
    const migrated = await MongoDataset.collection.find({ _id: datasetIds[0] }).toArray();
    await expect(
      migrateFolderMigrationBatch({ stage: 'datasets', docs: migrated, verifyOnly: true })
    ).resolves.toEqual({ errors: [], changedCount: 0 });
    expect(await MongoDataset.collection.findOne({ _id: datasetIds[0] })).toMatchObject({
      ancestorIds: []
    });
  });
});

describe('folder migration transactions and permissions', () => {
  afterEach(() => vi.restoreAllMocks());

  /** 用真实物化 ACL 构造跨树目录；直接授权和独立分支用于校验权限差量边界。 */
  const fixture = async (
    stage: 'apps' | 'datasets' = 'apps',
    toolFolder = false,
    inheritPermission = true
  ) => {
    const { owner, members } = await getFakeUsers(2);
    const model: Model<any> = stage === 'apps' ? MongoApp : MongoDataset;
    const resourceType = stage === 'apps' ? PerResourceTypeEnum.app : PerResourceTypeEnum.dataset;
    const folderType =
      stage === 'datasets'
        ? DatasetTypeEnum.folder
        : toolFolder
          ? AppTypeEnum.toolFolder
          : AppTypeEnum.folder;
    const parentType =
      stage === 'datasets'
        ? DatasetTypeEnum.dataset
        : toolFolder
          ? AppTypeEnum.folder
          : AppTypeEnum.toolFolder;
    const leafType =
      stage === 'datasets'
        ? DatasetTypeEnum.dataset
        : toolFolder
          ? AppTypeEnum.workflowTool
          : AppTypeEnum.workflow;
    const teamId = String(owner.teamId);
    const create = async (type: string, parentId?: string, inheritPermission = true) => {
      const doc = await model.create({
        teamId,
        tmbId: owner.tmbId,
        name: 'migration-test',
        type,
        parentId,
        inheritPermission
      });
      await mongoSessionRun((session) =>
        createResourceDefaultCollaborators({
          resource: doc,
          resourceType,
          tmbId: String(owner.tmbId),
          session
        })
      );
      return doc;
    };
    const grant = (id: string, memberIndex: number, permission: number) =>
      MongoResourcePermission.create({
        teamId,
        resourceType,
        resourceId: id,
        tmbId: members[memberIndex].tmbId,
        permission
      });
    const parent = await create(parentType);
    await grant(String(parent._id), 0, ReadRoleVal);
    const folder = await create(folderType, String(parent._id), inheritPermission);
    await grant(String(folder._id), 1, WriteRoleVal);
    const child = await create(folderType, String(folder._id));
    const leaf = await create(leafType, String(child._id));
    const independent = await create(folderType, String(folder._id), false);
    await grant(String(independent._id), 0, ReadRoleVal);
    const independentLeaf = await create(leafType, String(independent._id));
    const permissions = (id: string, type = resourceType) =>
      getResourceOwnedClbs({ teamId, resourceId: id, resourceType: type });
    return {
      owner,
      members,
      teamId,
      model,
      resourceType,
      folderType,
      parent,
      folder,
      child,
      leaf,
      independent,
      independentLeaf,
      create,
      permissions
    };
  };

  it.each([
    ['apps', false],
    ['apps', true],
    ['datasets', false]
  ] as const)(
    'rebases %s folder ACLs (tool=%s), including enabled descendant Collections',
    async (stage, toolFolder) => {
      const f = await fixture(stage, toolFolder);
      const collectionIds: string[] = [];
      if (stage === 'datasets') {
        const folder = await MongoDatasetCollection.create({
          teamId: f.teamId,
          tmbId: f.owner.tmbId,
          datasetId: f.leaf._id,
          name: 'folder',
          type: DatasetCollectionTypeEnum.folder
        });
        const file = await MongoDatasetCollection.create({
          teamId: f.teamId,
          tmbId: f.owner.tmbId,
          datasetId: f.leaf._id,
          name: 'file',
          parentId: folder._id,
          type: DatasetCollectionTypeEnum.virtual
        });
        collectionIds.push(String(folder._id), String(file._id));
        await enableDatasetCollectionPermissions({
          teamId: f.teamId,
          datasetId: String(f.leaf._id)
        });
        expect(
          (await MongoDataset.findById(f.folder._id).lean())?.collectionPermissionEnabled
        ).toBe(false);
      }
      const ids = [f.folder, f.child, f.leaf].map((doc) => String(doc._id));
      const before = await f.permissions(ids[0]);
      const docs = await readFolderMigrationDocsByIds({ stage, ids: [ids[0]] });
      expect(
        (await migrateFolderMigrationBatch({ stage, docs, verifyOnly: true })).errors
      ).toHaveLength(1);
      expect(await f.permissions(ids[0])).toEqual(before);
      expect(await migrateFolderMigrationBatch({ stage, docs })).toEqual({
        errors: [],
        changedCount: 1
      });
      expect(await f.model.findById(f.folder._id).lean()).toMatchObject({
        parentId: null,
        ancestorIds: []
      });
      for (const id of ids) {
        const rows = await f.permissions(id);
        expect(rows.find((row) => String(row.tmbId) === String(f.owner.tmbId))?.permission).toBe(
          OwnerRoleVal
        );
        expect(rows.some((row) => String(row.tmbId) === String(f.members[0].tmbId))).toBe(false);
        expect(
          rows.find((row) => String(row.tmbId) === String(f.members[1].tmbId))?.permission
        ).toBe(WriteRoleVal);
      }
      for (const id of collectionIds) {
        const rows = await f.permissions(id, PerResourceTypeEnum.collection);
        expect(rows.some((row) => String(row.tmbId) === String(f.members[0].tmbId))).toBe(false);
        expect(
          rows.find((row) => String(row.tmbId) === String(f.members[1].tmbId))?.permission
        ).toBe(WriteRoleVal);
      }
      for (const doc of [f.independent, f.independentLeaf]) {
        const rows = await f.permissions(String(doc._id));
        expect(
          rows.find((row) => String(row.tmbId) === String(f.members[0].tmbId))?.permission
        ).toBe(ReadRoleVal);
      }
      // 重放旧批次也必须以事务内的新数据判断，不能重复剥离权限。
      expect(await migrateFolderMigrationBatch({ stage, docs })).toEqual({
        errors: [],
        changedCount: 0
      });
    }
  );

  it('preserves independent folder ACLs when detaching them', async () => {
    const f = await fixture('apps', false, false);
    const ids = [f.folder, f.child, f.leaf].map((doc) => String(doc._id));
    const before = await Promise.all(ids.map((id) => f.permissions(id)));
    expect(await migrateFolderMigrationBatch({ stage: 'apps', docs: [f.folder] })).toEqual({
      errors: [],
      changedCount: 1
    });
    expect((await f.model.collection.findOne({ _id: f.folder._id }))?.parentId).toBeNull();
    expect(await Promise.all(ids.map((id) => f.permissions(id)))).toEqual(before);
  });

  it('re-reads stale batches after a successful API move and skips deleted records', async () => {
    const f = await fixture();
    const docs = await readFolderMigrationDocsByIds({ stage: 'apps', ids: [String(f.folder._id)] });
    const target = await f.create(f.folderType);
    const response = await Call(updateHandler, {
      auth: f.owner,
      query: { appId: String(f.folder._id) },
      body: { parentId: String(target._id) }
    });
    expect(response.code).toBe(200);
    expect(await migrateFolderMigrationBatch({ stage: 'apps', docs })).toEqual({
      errors: [],
      changedCount: 0
    });
    expect(String((await MongoApp.findById(f.folder._id).lean())?.parentId)).toBe(
      String(target._id)
    );
    await MongoApp.deleteOne({ _id: f.folder._id });
    expect(await migrateFolderMigrationBatch({ stage: 'apps', docs })).toEqual({
      errors: [],
      changedCount: 0
    });
    expect(await migrateFolderMigrationBatch({ stage: 'apps', docs: [] })).toEqual({
      errors: [],
      changedCount: 0
    });
  });

  it('retries the entire transaction after a concurrent move commits', async () => {
    const f = await fixture();
    const docs = await readFolderMigrationDocsByIds({ stage: 'apps', ids: [String(f.folder._id)] });
    const target = await f.create(f.folderType);
    const ready = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const original = MongoApp.collection.bulkWrite.bind(MongoApp.collection);
    vi.spyOn(MongoApp.collection, 'bulkWrite').mockImplementationOnce(async (...args) => {
      ready.resolve();
      await resume.promise;
      return original(...args);
    });
    const migrating = migrateFolderMigrationBatch({ stage: 'apps', docs });
    try {
      await ready.promise;
      const response = await Call(updateHandler, {
        auth: f.owner,
        query: { appId: String(f.folder._id) },
        body: { parentId: String(target._id) }
      });
      expect(response.code).toBe(200);
    } finally {
      resume.resolve();
    }
    expect(await migrating).toEqual({ errors: [], changedCount: 0 });
    expect(String((await MongoApp.findById(f.folder._id).lean())?.parentId)).toBe(
      String(target._id)
    );
  });

  it.each(['apps', 'datasets'] as const)(
    'rolls back %s parent, path, and descendant ACL writes together after a later failure',
    async (stage) => {
      const f = await fixture(stage);
      const collection = f.model.collection;
      const collections: Array<{
        id: string;
        before: Awaited<ReturnType<typeof getResourceOwnedClbs>>;
      }> = [];
      if (stage === 'datasets') {
        const file = await MongoDatasetCollection.create({
          teamId: f.teamId,
          tmbId: f.owner.tmbId,
          datasetId: f.leaf._id,
          name: 'rollback-file',
          type: DatasetCollectionTypeEnum.virtual
        });
        await enableDatasetCollectionPermissions({
          teamId: f.teamId,
          datasetId: String(f.leaf._id)
        });
        collections.push({
          id: String(file._id),
          before: await f.permissions(String(file._id), PerResourceTypeEnum.collection)
        });
      }
      await collection.updateOne({ _id: f.leaf._id }, { $set: { ancestorIds: [f.folder._id] } });
      const ids = [f.folder, f.child, f.leaf].map((doc) => String(doc._id));
      const before = await Promise.all(ids.map((id) => f.permissions(id)));
      const original = collection.bulkWrite.bind(collection);
      vi.spyOn(collection, 'bulkWrite').mockImplementation(async (...args) => {
        const result = await original(...args);
        if (
          args[0].some(
            (op) =>
              'updateOne' in op && !Array.isArray(op.updateOne.update) && op.updateOne.update.$unset
          )
        ) {
          // 在同一 session 中确认目录及后代权限已经改写，再模拟后续失败。
          expect(
            (await collection.findOne({ _id: f.folder._id }, { session: args[1]!.session! }))
              ?.parentId
          ).toBeNull();
          const rows = await getResourceOwnedClbs({
            teamId: f.teamId,
            resourceId: String(f.leaf._id),
            resourceType: f.resourceType,
            session: args[1]!.session!
          });
          expect(rows.some((row) => String(row.tmbId) === String(f.members[0].tmbId))).toBe(false);
          for (const item of collections) {
            const rows = await getResourceOwnedClbs({
              teamId: f.teamId,
              resourceId: item.id,
              resourceType: PerResourceTypeEnum.collection,
              session: args[1]!.session!
            });
            expect(rows.some((row) => String(row.tmbId) === String(f.members[0].tmbId))).toBe(
              false
            );
          }
          throw new Error('late batch write failed');
        }
        return result;
      });
      await expect(
        migrateFolderMigrationBatch({ stage, docs: [f.folder, f.leaf] })
      ).rejects.toThrow('late batch write failed');
      expect(String((await collection.findOne({ _id: f.folder._id }))?.parentId)).toBe(
        String(f.parent._id)
      );
      expect((await collection.findOne({ _id: f.leaf._id }))?.ancestorIds).toEqual([f.folder._id]);
      expect(await Promise.all(ids.map((id) => f.permissions(id)))).toEqual(before);
      for (const item of collections) {
        expect(await f.permissions(item.id, PerResourceTypeEnum.collection)).toEqual(item.before);
      }
    }
  );
});

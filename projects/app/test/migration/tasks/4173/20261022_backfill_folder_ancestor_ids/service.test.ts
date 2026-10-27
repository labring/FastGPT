import { afterEach, describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { migrateFolderMigrationBatch } from '@/migration/tasks/4173/20261022_backfill_folder_ancestor_ids/service';

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
          reason: 'folder depth exceeds the configured maximum'
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

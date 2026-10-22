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
      .find({ _id: { $in: [datasetIds[0], datasetIds[2], depthIds[depthIds.length - 1]] } })
      .toArray();
    const result = await migrateFolderMigrationBatch({ stage: 'datasets', docs: invalidDocs });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        { id: String(datasetIds[0]), reason: 'parent folder type does not match this tree' },
        { id: String(datasetIds[2]), reason: 'folder parent cycle detected' },
        {
          id: String(depthIds[depthIds.length - 1]),
          reason: 'folder depth exceeds the configured maximum'
        }
      ])
    );
    expect(result.errors).toHaveLength(3);
    expect(await MongoDataset.collection.findOne({ _id: datasetIds[0] })).not.toHaveProperty(
      'ancestorIds'
    );
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

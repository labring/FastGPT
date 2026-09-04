import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemMigrationContext } from '@/migration/registry';
import type { SystemMigrationProgressInput } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { MongoDatasetCollectionTagsV2 } from '@fastgpt/service/core/dataset/tag/schemaV2';
import { migrateDatasetTagsV2 } from '@/migration/tasks/20260907_migrate_dataset_tags_v2';

vi.mock('@/migration/constants', () => ({ systemMigrationBatchSize: 1 }));

const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  const context = {
    migrationId: '20260907_migrate_dataset_tags_v2',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint === undefined ? undefined : schema.parse(checkpoint),
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
    }),
    assertActive: vi.fn(async () => undefined),
    reportProgress: vi.fn(async (_value: SystemMigrationProgressInput) => undefined),
    getFailedRecords: vi.fn(async () => []),
    reportFailedRecords: vi.fn(async () => undefined),
    fail: vi.fn(async () => {
      throw new Error('Blocking tasks must throw');
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return { context, getCheckpoint: () => checkpoint };
};

const seedMigrationData = async () => {
  const teamId = new Types.ObjectId();
  const tmbId = new Types.ObjectId();
  const datasetId = new Types.ObjectId();
  await MongoDataset.collection.insertOne({
    _id: datasetId,
    teamId,
    tmbId,
    name: 'dataset',
    type: 'dataset'
  });
  const legacyTagId = new Types.ObjectId();
  await MongoDatasetCollectionTags.collection.insertOne({
    _id: legacyTagId,
    teamId,
    datasetId,
    tag: 'legacy'
  });
  const collectionId = new Types.ObjectId();
  await MongoDatasetCollection.collection.insertOne({
    _id: collectionId,
    teamId,
    tmbId,
    datasetId,
    name: 'file',
    type: 'file',
    tags: [String(legacyTagId)]
  });
  return { datasetId, collectionId };
};

describe('migrateDatasetTagsV2', () => {
  beforeEach(async () => {
    await Promise.all([
      MongoDataset.collection.deleteMany({}),
      MongoDatasetCollection.collection.deleteMany({}),
      MongoDatasetCollectionTags.collection.deleteMany({}),
      MongoDatasetCollectionTagsV2.collection.deleteMany({})
    ]);
  });

  it('migrates legacy collection tags before validation succeeds', async () => {
    const ids = await seedMigrationData();
    const { context } = createContext();

    await expect(migrateDatasetTagsV2(context)).resolves.toMatchObject({
      datasetsProcessedCount: 1,
      collectionsMigratedCount: 1,
      legacyCollectionCount: 0
    });
    const carrier = await MongoDatasetCollectionTagsV2.collection.findOne({
      datasetId: ids.datasetId,
      fromMigration: true
    });
    expect(carrier).toMatchObject({ tag: 'default_tag', tagType: 'array' });
    expect(
      (await MongoDatasetCollection.collection.findOne({ _id: ids.collectionId }))?.tags
    ).toEqual([{ tagId: String(carrier?._id), value: ['legacy'] }]);
    expect(context.getFailedRecords).not.toHaveBeenCalled();
    expect(context.reportFailedRecords).not.toHaveBeenCalled();
  });

  it('can rerun without duplicating carriers or changing migrated data', async () => {
    const ids = await seedMigrationData();
    await migrateDatasetTagsV2(createContext().context);
    const firstCollection = await MongoDatasetCollection.collection.findOne({
      _id: ids.collectionId
    });

    await expect(migrateDatasetTagsV2(createContext().context)).resolves.toMatchObject({
      collectionsMigratedCount: 0,
      duplicateDefinitionsDeletedCount: 0,
      legacyCollectionCount: 0
    });
    expect(
      await MongoDatasetCollectionTagsV2.collection.countDocuments({
        datasetId: ids.datasetId,
        fromMigration: true
      })
    ).toBe(1);
    expect(await MongoDatasetCollection.collection.findOne({ _id: ids.collectionId })).toEqual(
      firstCollection
    );
  });

  it('resumes from the saved checkpoint and safely replays after interruption', async () => {
    await seedMigrationData();
    const state = createContext();
    state.context.reportProgress.mockImplementation(async (progress) => {
      if (progress.key === 'datasets' && progress.status === 'running' && progress.current === 1) {
        throw new Error('interrupted');
      }
    });

    await expect(migrateDatasetTagsV2(state.context)).rejects.toThrow('interrupted');
    expect(state.getCheckpoint()).toMatchObject({
      version: 1,
      stages: { datasets: { lastId: expect.any(String), processedCount: 1 } }
    });
    state.context.reportProgress.mockResolvedValue(undefined);
    await expect(migrateDatasetTagsV2(state.context)).resolves.toMatchObject({
      datasetsProcessedCount: 1,
      collectionsMigratedCount: 1
    });
  });

  it('does not complete when final validation observes a late legacy write', async () => {
    const ids = await seedMigrationData();
    const state = createContext();
    state.context.reportProgress.mockImplementation(async (progress) => {
      if (progress.key !== 'validation' || progress.status !== 'running') return;
      const dataset = await MongoDataset.collection.findOne({ _id: ids.datasetId });
      await MongoDatasetCollection.collection.insertOne({
        teamId: dataset?.teamId,
        tmbId: new Types.ObjectId(),
        datasetId: ids.datasetId,
        name: 'late legacy write',
        type: 'file',
        tags: [String(new Types.ObjectId())]
      });
    });

    await expect(migrateDatasetTagsV2(state.context)).rejects.toThrow(
      'Dataset tag migration validation failed'
    );
    expect(state.getCheckpoint()).toMatchObject({
      stages: {
        datasets: { initialized: false, completed: false },
        collections: { initialized: false, completed: false }
      }
    });
    expect(state.context.reportProgress).not.toHaveBeenCalledWith({
      key: 'validation',
      status: 'succeeded'
    });
  });
});

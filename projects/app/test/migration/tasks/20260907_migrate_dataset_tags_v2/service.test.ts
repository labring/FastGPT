import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { MongoDatasetCollectionTagsV2 } from '@fastgpt/service/core/dataset/tag/schemaV2';
import {
  migrateCollectionTagValues,
  migrateDatasetTagDefinitions
} from '@/migration/tasks/20260907_migrate_dataset_tags_v2/service';

const tagUniqueIndexName = 'teamId_1_datasetId_1_tag_1';
const teamId = new Types.ObjectId();
const datasetId = new Types.ObjectId();
const tmbId = new Types.ObjectId();

describe('dataset tag v2 migration service', () => {
  beforeEach(async () => {
    await Promise.all([
      MongoDatasetCollection.collection.deleteMany({ teamId }),
      MongoDatasetCollectionTags.collection.deleteMany({ teamId }),
      MongoDatasetCollectionTagsV2.collection.deleteMany({ teamId })
    ]);
  });

  afterEach(async () => {
    await Promise.all([
      MongoDatasetCollection.collection.deleteMany({ teamId }),
      MongoDatasetCollectionTags.collection.deleteMany({ teamId }),
      MongoDatasetCollectionTagsV2.collection.deleteMany({ teamId })
    ]);
    await MongoDatasetCollectionTagsV2.createIndexes({ background: true });
  });

  it('removes duplicate references before definitions and remains idempotent', async () => {
    await MongoDatasetCollectionTagsV2.collection.dropIndex(tagUniqueIndexName).catch(() => {});
    const keptId = new Types.ObjectId();
    const duplicateId = new Types.ObjectId();
    const unrelatedId = new Types.ObjectId();
    await MongoDatasetCollectionTagsV2.collection.insertMany([
      { _id: keptId, teamId, datasetId, tag: 'product', tagType: 'string' },
      { _id: duplicateId, teamId, datasetId, tag: 'product', tagType: 'string' },
      { _id: unrelatedId, teamId, datasetId, tag: 'score', tagType: 'number' }
    ]);
    const collection = await MongoDatasetCollection.collection.insertOne({
      teamId,
      tmbId,
      datasetId,
      name: 'file',
      type: 'file',
      tags: [
        { tagId: String(duplicateId), value: 'FastGPT' },
        { tagId: String(unrelatedId), value: 10 }
      ]
    });

    await expect(migrateDatasetTagDefinitions({ datasetId, teamId })).resolves.toMatchObject({
      migratedCount: 1,
      deletedDefinitionCount: 1,
      deletedReferenceCollectionCount: 1
    });
    expect(await MongoDatasetCollectionTagsV2.collection.findOne({ _id: keptId })).toBeTruthy();
    expect(await MongoDatasetCollectionTagsV2.collection.findOne({ _id: duplicateId })).toBeNull();
    expect(
      (await MongoDatasetCollection.collection.findOne({ _id: collection.insertedId }))?.tags
    ).toEqual([{ tagId: String(unrelatedId), value: 10 }]);
    expect(
      await MongoDatasetCollectionTagsV2.collection.countDocuments({ teamId, datasetId })
    ).toBe(2);

    await expect(migrateDatasetTagDefinitions({ datasetId, teamId })).resolves.toMatchObject({
      deletedDefinitionCount: 0,
      deletedReferenceCollectionCount: 0
    });
  });

  it('converts legacy tag ids into the dataset carrier array and preserves typed tags', async () => {
    const legacy = await MongoDatasetCollectionTags.create({
      teamId,
      datasetId,
      tag: 'legacy-name'
    });
    const typed = await MongoDatasetCollectionTagsV2.create({
      teamId,
      datasetId,
      tag: 'score',
      tagType: 'number'
    });
    const collection = await MongoDatasetCollection.collection.insertOne({
      teamId,
      tmbId,
      datasetId,
      name: 'file',
      type: 'file',
      tags: [String(legacy._id), { tagId: String(typed._id), value: 10 }]
    });

    await expect(
      migrateCollectionTagValues({ collectionId: collection.insertedId })
    ).resolves.toEqual({ migratedCount: 1 });
    const carrier = await MongoDatasetCollectionTagsV2.collection.findOne({
      teamId,
      datasetId,
      fromMigration: true
    });
    expect(carrier).toMatchObject({ tag: 'default_tag', tagType: 'array' });
    expect(
      (await MongoDatasetCollection.collection.findOne({ _id: collection.insertedId }))?.tags
    ).toEqual([
      { tagId: String(typed._id), value: 10 },
      { tagId: String(carrier?._id), value: ['legacy-name'] }
    ]);
  });

  it('treats default_tag as a normal name and identifies carriers only by fromMigration', async () => {
    const ordinary = await MongoDatasetCollectionTagsV2.create({
      teamId,
      datasetId,
      tag: 'default_tag',
      tagType: 'string'
    });
    const carrier = await MongoDatasetCollectionTagsV2.create({
      teamId,
      datasetId,
      tag: 'renamed carrier',
      tagType: 'string',
      fromMigration: true
    });

    await expect(migrateDatasetTagDefinitions({ datasetId, teamId })).resolves.toMatchObject({
      deletedDefinitionCount: 0
    });
    expect(await MongoDatasetCollectionTagsV2.findById(ordinary._id).lean()).toMatchObject({
      tag: 'default_tag',
      tagType: 'string',
      fromMigration: false
    });
    expect(await MongoDatasetCollectionTagsV2.findById(carrier._id).lean()).toMatchObject({
      tag: 'renamed carrier',
      tagType: 'array',
      fromMigration: true
    });
  });
});

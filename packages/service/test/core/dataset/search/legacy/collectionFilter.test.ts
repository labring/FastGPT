import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetCollectionTagsV2 } from '@fastgpt/service/core/dataset/tag/schemaV2';
import { filterLegacyCollectionByMetadata } from '@fastgpt/service/core/dataset/search/defaultRecall/legacy/collectionFilter';

const teamId = new Types.ObjectId();
const tmbId = new Types.ObjectId();
const datasetA = new Types.ObjectId();
const datasetB = new Types.ObjectId();

const createCollection = async ({
  datasetId,
  tags
}: {
  datasetId: Types.ObjectId;
  tags: unknown[];
}) =>
  MongoDatasetCollection.collection.insertOne({
    teamId,
    tmbId,
    datasetId,
    name: 'test',
    type: 'file',
    tags
  });

describe('filterLegacyCollectionByMetadata', () => {
  beforeEach(async () => {
    global.feConfigs = { ...global.feConfigs, isPlus: true };
    await Promise.all([
      MongoDatasetCollection.collection.deleteMany({ teamId }),
      MongoDatasetCollectionTagsV2.collection.deleteMany({ teamId })
    ]);
  });

  afterEach(() => {
    global.feConfigs = { ...global.feConfigs, isPlus: false };
  });

  it('uses AND exclusively when AND and OR are both present', async () => {
    const carrier = await MongoDatasetCollectionTagsV2.create({
      teamId,
      datasetId: datasetA,
      tag: 'default_tag',
      tagType: 'array',
      fromMigration: true
    });
    const [andCollection, orCollection] = await Promise.all([
      createCollection({
        datasetId: datasetA,
        tags: [{ tagId: String(carrier._id), value: ['A'] }]
      }),
      createCollection({
        datasetId: datasetA,
        tags: [{ tagId: String(carrier._id), value: ['B'] }]
      })
    ]);

    const result = await filterLegacyCollectionByMetadata({
      teamId: String(teamId),
      datasetIds: [String(datasetA)],
      collectionFilterMatch: JSON.stringify({ tags: { $and: ['A'], $or: ['B'] } })
    });

    expect(result).toEqual([String(andCollection.insertedId)]);
    expect(result).not.toContain(String(orCollection.insertedId));
  });

  it('matches null only against truly empty tags', async () => {
    const carrier = await MongoDatasetCollectionTagsV2.create({
      teamId,
      datasetId: datasetA,
      tag: 'default_tag',
      tagType: 'array',
      fromMigration: true
    });
    const empty = await createCollection({ datasetId: datasetA, tags: [] });
    await createCollection({
      datasetId: datasetA,
      tags: [{ tagId: String(carrier._id), value: [] }]
    });

    const result = await filterLegacyCollectionByMetadata({
      teamId: String(teamId),
      datasetIds: [String(datasetA)],
      collectionFilterMatch: JSON.stringify({ tags: { $and: [null] } })
    });
    expect(result).toEqual([String(empty.insertedId)]);
  });

  it('uses each dataset carrier independently and does not widen when one is missing', async () => {
    const [carrierA, carrierB] = await MongoDatasetCollectionTagsV2.create([
      {
        teamId,
        datasetId: datasetA,
        tag: 'default_tag',
        tagType: 'array',
        fromMigration: true
      },
      {
        teamId,
        datasetId: datasetB,
        tag: 'default_tag',
        tagType: 'array',
        fromMigration: true
      }
    ]);
    const [collectionA, collectionB] = await Promise.all([
      createCollection({
        datasetId: datasetA,
        tags: [{ tagId: String(carrierA._id), value: ['A'] }]
      }),
      createCollection({
        datasetId: datasetB,
        tags: [{ tagId: String(carrierB._id), value: ['A'] }]
      })
    ]);

    expect(
      await filterLegacyCollectionByMetadata({
        teamId: String(teamId),
        datasetIds: [String(datasetA), String(datasetB)],
        collectionFilterMatch: JSON.stringify({ tags: { $or: ['A'] } })
      })
    ).toEqual(
      expect.arrayContaining([String(collectionA.insertedId), String(collectionB.insertedId)])
    );

    await MongoDatasetCollectionTagsV2.deleteOne({ _id: carrierB._id });
    expect(
      await filterLegacyCollectionByMetadata({
        teamId: String(teamId),
        datasetIds: [String(datasetB)],
        collectionFilterMatch: JSON.stringify({ tags: { $or: ['A'] } })
      })
    ).toEqual([]);
  });
});

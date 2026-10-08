import { DatasetCollectionTagTypeEnum } from '@fastgpt/global/core/dataset/type';
import { Types, type ClientSession } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { ensureDatasetTagMigrationCarrier } from '@fastgpt/service/core/dataset/collection/utils';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { MongoDatasetCollectionTagsV2 } from '@fastgpt/service/core/dataset/tag/schemaV2';

export type DatasetTagMigrationRecord = {
  _id: Types.ObjectId;
  teamId?: Types.ObjectId;
};

export type MigrationRecordResult = {
  migratedCount?: number;
  deletedDefinitionCount?: number;
  deletedReferenceCollectionCount?: number;
};

const asObjectId = (value: unknown) => {
  const stringValue = String(value ?? '');
  return Types.ObjectId.isValid(stringValue) ? new Types.ObjectId(stringValue) : undefined;
};

/**
 * 整理单个知识库的 v2 标签定义：保留最早的同名定义，重复项先删引用再删定义，
 * 并整理已有的 fromMigration 承载记录。没有旧字符串标签的知识库不预建承载记录。
 */
export const migrateDatasetTagDefinitions = async ({
  datasetId,
  teamId,
  session
}: {
  datasetId: Types.ObjectId;
  teamId: Types.ObjectId;
  session?: ClientSession;
}): Promise<MigrationRecordResult> => {
  const migrate = async (activeSession: ClientSession): Promise<MigrationRecordResult> => {
    const definitions = await MongoDatasetCollectionTagsV2.collection
      .find({ teamId, datasetId }, { session: activeSession })
      .sort({ _id: 1 })
      .toArray();
    const deleteIds = new Map<string, Types.ObjectId>();

    const definitionsByName = new Map<string, typeof definitions>();
    for (const definition of definitions) {
      if (deleteIds.has(String(definition._id))) continue;
      const group = definitionsByName.get(String(definition.tag)) ?? [];
      group.push(definition);
      definitionsByName.set(String(definition.tag), group);
    }
    for (const group of definitionsByName.values()) {
      group.slice(1).forEach((definition) => {
        deleteIds.set(String(definition._id), definition._id);
      });
    }

    const migrationDefinitions = definitions.filter(
      (definition) => definition.fromMigration === true && !deleteIds.has(String(definition._id))
    );
    const carrier = migrationDefinitions[0];
    migrationDefinitions.slice(1).forEach((definition) => {
      deleteIds.set(String(definition._id), definition._id);
    });

    const duplicateIds = [...deleteIds.values()];
    let deletedReferenceCollectionCount = 0;
    if (duplicateIds.length > 0) {
      const duplicateTagIds: Array<string | Types.ObjectId> = [
        ...duplicateIds,
        ...duplicateIds.map(String)
      ];
      const duplicateTagIdStrings = duplicateIds.map(String);
      const pullResult = await MongoDatasetCollection.collection.updateMany(
        { teamId, datasetId, 'tags.tagId': { $in: duplicateTagIds } },
        [
          {
            $set: {
              tags: {
                $filter: {
                  input: '$tags',
                  as: 'tag',
                  cond: {
                    $not: {
                      $in: [
                        {
                          $convert: {
                            input: '$$tag.tagId',
                            to: 'string',
                            onError: null,
                            onNull: null
                          }
                        },
                        duplicateTagIdStrings
                      ]
                    }
                  }
                }
              }
            }
          }
        ],
        { session: activeSession }
      );
      deletedReferenceCollectionCount = pullResult.modifiedCount;
      const remainingReferences = await MongoDatasetCollection.collection.countDocuments(
        { teamId, datasetId, 'tags.tagId': { $in: duplicateTagIds } },
        { session: activeSession }
      );
      if (remainingReferences > 0) {
        throw new Error('Duplicate dataset tag references remain after cleanup');
      }
      await MongoDatasetCollectionTagsV2.collection.deleteMany(
        { _id: { $in: duplicateIds }, teamId, datasetId },
        { session: activeSession }
      );
    }

    if (carrier) {
      const carrierIdStr = String(carrier._id);
      const [legacyTags, usedValues] = await Promise.all([
        MongoDatasetCollectionTags.collection
          .find({ teamId, datasetId }, { projection: { tag: 1 }, session: activeSession })
          .toArray(),
        MongoDatasetCollection.collection
          .aggregate(
            [
              {
                $match: {
                  teamId,
                  datasetId,
                  'tags.tagId': { $in: [carrier._id, carrierIdStr] }
                }
              },
              { $unwind: '$tags' },
              {
                $match: {
                  $expr: {
                    $in: [{ $toString: '$tags.tagId' }, [carrierIdStr]]
                  }
                }
              },
              { $unwind: '$tags.value' },
              {
                $group: {
                  _id: null,
                  values: { $addToSet: '$tags.value' }
                }
              }
            ],
            { session: activeSession }
          )
          .toArray()
      ]);

      const legacyTagNames = legacyTags
        .map((t) => t.tag)
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
      const usedTagNames = ((usedValues[0]?.values as unknown[]) ?? []).filter(
        (v): v is string => typeof v === 'string' && v.trim().length > 0
      );
      const existingOptions = Array.isArray(carrier.options)
        ? carrier.options.filter((o: unknown): o is string => typeof o === 'string')
        : [];

      const mergedOptions = [...new Set([...existingOptions, ...legacyTagNames, ...usedTagNames])];

      await MongoDatasetCollectionTagsV2.collection.updateOne(
        { _id: carrier._id, teamId, datasetId },
        {
          $set: {
            tagType: DatasetCollectionTagTypeEnum.array,
            fromMigration: true,
            options: mergedOptions
          }
        },
        { session: activeSession }
      );
    }

    return {
      migratedCount: 1,
      deletedDefinitionCount: duplicateIds.length,
      deletedReferenceCollectionCount
    };
  };

  return session ? migrate(session) : mongoSessionRun(migrate);
};

/** 将单个 Collection 的旧标签 ID 转换为当前 dataset 承载标签的名称数组。 */
export const migrateCollectionTagValues = async ({
  collectionId,
  session
}: {
  collectionId: Types.ObjectId;
  session?: ClientSession;
}): Promise<MigrationRecordResult> => {
  const migrate = async (activeSession: ClientSession): Promise<MigrationRecordResult> => {
    const collection = await MongoDatasetCollection.collection.findOne(
      { _id: collectionId },
      { projection: { teamId: 1, datasetId: 1, tags: 1 }, session: activeSession }
    );
    if (!collection) return {};

    const currentTags = Array.isArray(collection.tags) ? collection.tags : [];
    const legacyTagIds = currentTags.filter((tag): tag is string => typeof tag === 'string');
    if (legacyTagIds.length === 0) return {};

    const objectIds = legacyTagIds
      .map(asObjectId)
      .filter((id): id is Types.ObjectId => Boolean(id));
    const legacyDefinitions = objectIds.length
      ? await MongoDatasetCollectionTags.collection
          .find(
            { _id: { $in: objectIds }, teamId: collection.teamId, datasetId: collection.datasetId },
            { projection: { tag: 1 }, session: activeSession }
          )
          .toArray()
      : [];
    const carrier = await ensureDatasetTagMigrationCarrier({
      teamId: String(collection.teamId),
      datasetId: String(collection.datasetId),
      session: activeSession
    });

    const carrierId = String(carrier._id);
    const existingCarrier = currentTags.find(
      (tag) => tag && typeof tag === 'object' && String(tag.tagId) === carrierId
    );
    const existingValues = Array.isArray(existingCarrier?.value)
      ? existingCarrier.value.filter((value: unknown): value is string => typeof value === 'string')
      : [];
    const migratedValues = legacyDefinitions
      .map((definition) => definition.tag)
      .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
    const mergedValues = [...new Set([...existingValues, ...migratedValues])];
    const nextTags = currentTags.filter(
      (tag) => typeof tag !== 'string' && String(tag?.tagId ?? '') !== carrierId
    );
    if (mergedValues.length > 0) nextTags.push({ tagId: carrierId, value: mergedValues });

    const result = await MongoDatasetCollection.collection.updateOne(
      { _id: collectionId, tags: currentTags },
      { $set: { tags: nextTags } },
      { session: activeSession }
    );
    if (result.matchedCount !== 1) {
      throw new Error('Collection tags changed concurrently during migration');
    }

    if (migratedValues.length > 0) {
      await MongoDatasetCollectionTagsV2.collection.updateOne(
        {
          _id: new Types.ObjectId(carrierId),
          teamId: collection.teamId,
          datasetId: collection.datasetId
        },
        { $addToSet: { options: { $each: migratedValues } } },
        { session: activeSession }
      );
    }

    return { migratedCount: 1 };
  };

  return session ? migrate(session) : mongoSessionRun(migrate);
};

export const migrationCollections = {
  datasets: MongoDataset.collection,
  collections: MongoDatasetCollection.collection
};

/** 创建标签唯一索引并在迁移成功前校验所有必要不变量。 */
export const validateDatasetTagMigration = async () => {
  await Promise.all([
    MongoDatasetCollectionTagsV2.createIndexes({ background: true }),
    MongoDatasetCollection.createIndexes({ background: true })
  ]);

  const [legacyCollectionCount, duplicateGroups, duplicateCarrierGroups, invalidCarrierCount] =
    await Promise.all([
      MongoDatasetCollection.collection.countDocuments({
        tags: { $elemMatch: { $type: 'string' } }
      }),
      MongoDatasetCollectionTagsV2.collection
        .aggregate([
          {
            $group: {
              _id: { teamId: '$teamId', datasetId: '$datasetId', tag: '$tag' },
              n: { $sum: 1 }
            }
          },
          { $match: { n: { $gt: 1 } } },
          { $limit: 1 }
        ])
        .toArray(),
      MongoDatasetCollectionTagsV2.collection
        .aggregate([
          {
            $match: { fromMigration: true }
          },
          {
            $group: {
              _id: { teamId: '$teamId', datasetId: '$datasetId' },
              n: { $sum: 1 }
            }
          },
          { $match: { n: { $gt: 1 } } },
          { $limit: 1 }
        ])
        .toArray(),
      MongoDatasetCollectionTagsV2.collection.countDocuments({
        fromMigration: true,
        tagType: { $ne: DatasetCollectionTagTypeEnum.array }
      })
    ]);

  if (
    legacyCollectionCount > 0 ||
    duplicateGroups.length > 0 ||
    duplicateCarrierGroups.length > 0 ||
    invalidCarrierCount > 0
  ) {
    throw new Error(
      `Dataset tag migration validation failed: legacyCollections=${legacyCollectionCount}, duplicateTagGroups=${duplicateGroups.length}, duplicateCarrierGroups=${duplicateCarrierGroups.length}, invalidCarriers=${invalidCarrierCount}`
    );
  }

  return { legacyCollectionCount };
};

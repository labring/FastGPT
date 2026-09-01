import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoDatasetCollectionTags } from '@fastgpt/service/core/dataset/tag/schema';
import { MongoDatasetCollectionTagsV2 } from '@fastgpt/service/core/dataset/tag/schemaV2';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  DEFAULT_TAG,
  DatasetCollectionTagTypeEnum,
  type CollectionTagValueType
} from '@fastgpt/global/core/dataset/type';
import { getLogger } from '@fastgpt/service/common/logger';

const logger = getLogger(['migrateTags']);
const isLegacyTag = (tag: unknown): tag is string => typeof tag === 'string';

export default NextAPI(async function handler(req) {
  await authCert({ req, authRoot: true });

  // 清理 v2 表重复行，避免 unique 索引构建失败；保留 _id 最早的一条（ObjectId 含创建时间，排序即时间序）
  const dupGroups = await MongoDatasetCollectionTagsV2.aggregate([
    {
      $group: {
        _id: { teamId: '$teamId', datasetId: '$datasetId', tag: '$tag' },
        ids: { $push: '$_id' }
      }
    },
    { $match: { $expr: { $gt: [{ $size: '$ids' }, 1] } } }
  ]);
  for (const group of dupGroups) {
    const [, ...dups] = [...group.ids].sort();
    await MongoDatasetCollectionTagsV2.deleteMany({ _id: { $in: dups } });
  }

  const datasetIds = (await MongoDatasetCollectionTags.distinct('datasetId')) as string[];
  logger.info(`[TagMigration] Starting tag migration for ${datasetIds.length} datasets`);
  let migratedDatasets = 0;
  let migratedCollections = 0;

  for (const datasetId of datasetIds) {
    const legacyTags = await MongoDatasetCollectionTags.find(
      { datasetId },
      '_id tag teamId'
    ).lean();
    const tagNameMap = new Map(legacyTags.map((tag) => [String(tag._id), tag.tag]));
    logger.info(
      `[TagMigration] datasetId=${datasetId}, legacyTags=${JSON.stringify(Array.from(tagNameMap.values()))}`
    );
    if (tagNameMap.size === 0) continue;
    const firstLegacyTag = legacyTags[0];
    if (!firstLegacyTag) continue;

    // default_tag 承载记录按 fromMigration 定位；存量按名称创建的记录回填标记并确保 tagType=array
    let defaultTag = await MongoDatasetCollectionTagsV2.findOne({
      datasetId,
      fromMigration: true
    }).lean();
    if (!defaultTag) {
      const legacyDefaultTag = await MongoDatasetCollectionTagsV2.findOne({
        datasetId,
        tag: DEFAULT_TAG
      }).lean();
      if (legacyDefaultTag) {
        await MongoDatasetCollectionTagsV2.updateOne(
          { _id: legacyDefaultTag._id },
          { $set: { fromMigration: true, tagType: DatasetCollectionTagTypeEnum.array } }
        );
        defaultTag = {
          ...legacyDefaultTag,
          fromMigration: true,
          tagType: DatasetCollectionTagTypeEnum.array
        };
      } else {
        try {
          const createdTag = await MongoDatasetCollectionTagsV2.create({
            teamId: firstLegacyTag.teamId,
            datasetId,
            tag: DEFAULT_TAG,
            tagType: DatasetCollectionTagTypeEnum.array,
            fromMigration: true
          });
          defaultTag = createdTag.toObject();
        } catch (error: any) {
          // 并发创建撞 unique 索引 → 复用已存在记录
          if (error?.code !== 11000) throw error;
          defaultTag = await MongoDatasetCollectionTagsV2.findOne({
            datasetId,
            fromMigration: true
          }).lean();
          if (!defaultTag) throw error;
        }
      }
    }
    if (!defaultTag) continue;
    const defaultTagId = String(defaultTag._id);

    const collections = await MongoDatasetCollection.find({ datasetId }, '_id tags').lean();
    let migratedInDataset = 0;
    for (const collection of collections) {
      const tags = (Array.isArray(collection.tags) ? collection.tags : []) as (
        | string
        | CollectionTagValueType
      )[];
      if (!tags.some(isLegacyTag)) continue;

      const tagNames = tags
        .filter(isLegacyTag)
        .map((tagId) => tagNameMap.get(tagId))
        .filter((tagName): tagName is string => Boolean(tagName));
      const existingDefaultTag = tags.find(
        (tag): tag is CollectionTagValueType =>
          typeof tag === 'object' && tag !== null && tag.tagId === defaultTagId
      );
      const existingDefaultValues = Array.isArray(existingDefaultTag?.value)
        ? existingDefaultTag.value.filter((value): value is string => typeof value === 'string')
        : [];
      const mergedTagNames = [...new Set([...existingDefaultValues, ...tagNames])];
      const migratedTags: (string | CollectionTagValueType)[] = tags.filter(
        (tag) => !isLegacyTag(tag) && tag !== existingDefaultTag
      );
      migratedTags.push({ tagId: defaultTagId, value: mergedTagNames });
      logger.info(
        `[TagMigration] collectionId=${String(collection._id)}, collectionTags=${JSON.stringify(tags)}`
      );

      await MongoDatasetCollection.updateOne(
        { _id: collection._id },
        { $set: { tags: migratedTags } }
      );
      migratedCollections += 1;
      migratedInDataset += 1;
    }

    if (migratedInDataset > 0 || defaultTag) migratedDatasets += 1;
  }

  return { migratedDatasets, migratedCollections };
});

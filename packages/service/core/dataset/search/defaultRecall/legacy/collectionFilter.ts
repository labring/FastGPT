import json5 from 'json5';
import { MongoDatasetCollection } from '../../../collection/schema';
import { MongoDatasetCollectionTagsV2 } from '../../../tag/schemaV2';
import { readFromSecondary } from '../../../../../common/mongo/utils';
import { applySharedCollectionMetadataFilters } from '../collectionFilterShared';
import type { LegacyCollectionFilterMatch } from './type';

/**
 * 按 dataset 读取迁移承载标签。每个知识库独立解析 tagId，不依赖可修改的标签名。
 */
const getMigrationTagIds = async ({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}) =>
  MongoDatasetCollectionTagsV2.find(
    { teamId, datasetId: { $in: datasetIds }, fromMigration: true },
    '_id datasetId',
    { ...readFromSecondary }
  ).lean();

/**
 * 存量知识库检索节点的标签过滤。
 * `$and` 存在时完全忽略 `$or`；null 只匹配 tags 真正为空或不存在的 Collection。
 */
const filterLegacyCollectionByTags = async ({
  teamId,
  datasetIds,
  tags
}: {
  teamId: string;
  datasetIds: string[];
  tags?: LegacyCollectionFilterMatch['tags'];
}): Promise<string[] | undefined> => {
  const andTags = tags?.$and;
  const orTags = tags?.$or;
  const activeTags = andTags?.length ? andTags : orTags;
  if (!activeTags?.length) return;

  const hasNull = activeTags.includes(null);
  const stringTags = [
    ...new Set(activeTags.filter((tag): tag is string => typeof tag === 'string'))
  ];
  if (andTags?.length && hasNull && stringTags.length > 0) return [];

  if (andTags?.length && hasNull) {
    const collections = await MongoDatasetCollection.find(
      {
        teamId,
        datasetId: { $in: datasetIds },
        $or: [{ tags: { $size: 0 } }, { tags: { $exists: false } }]
      },
      '_id',
      { ...readFromSecondary }
    ).lean();
    return collections.map((item) => String(item._id));
  }

  const migrationTags = stringTags.length ? await getMigrationTagIds({ teamId, datasetIds }) : [];
  const queries = migrationTags.map((migrationTag) => ({
    teamId,
    datasetId: migrationTag.datasetId,
    tags: {
      $elemMatch: {
        tagId: String(migrationTag._id),
        value: andTags?.length ? { $all: stringTags } : { $in: stringTags }
      }
    }
  }));

  const match = {
    teamId,
    datasetId: { $in: datasetIds },
    $or: [
      ...queries,
      ...(!andTags?.length && hasNull ? [{ tags: { $size: 0 } }, { tags: { $exists: false } }] : [])
    ]
  };
  if (match.$or.length === 0) return [];

  const collections = await MongoDatasetCollection.find(match, '_id', {
    ...readFromSecondary
  }).lean();
  return collections.map((item) => String(item._id));
};

/** 旧节点完整元数据过滤入口；旧配置解析失败时保持历史降级行为。 */
export const filterLegacyCollectionByMetadata = async ({
  teamId,
  datasetIds,
  collectionFilterMatch
}: {
  teamId: string;
  datasetIds: string[];
  collectionFilterMatch?: string;
}): Promise<string[] | undefined> => {
  if (!collectionFilterMatch || !global.feConfigs.isPlus) return;

  try {
    const metadataMatch = json5.parse(collectionFilterMatch) as LegacyCollectionFilterMatch;
    const tagCollectionIds = await filterLegacyCollectionByTags({
      teamId,
      datasetIds,
      tags: metadataMatch.tags
    });
    return applySharedCollectionMetadataFilters({
      teamId,
      datasetIds,
      metadataMatch,
      tagCollectionIds
    });
  } catch {
    return;
  }
};

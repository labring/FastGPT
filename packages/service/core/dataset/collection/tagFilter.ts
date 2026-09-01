import { type CollectionTagFilterItem } from '@fastgpt/global/core/dataset/type';
import {
  collectionTagValueKey,
  isCollectionTagValue,
  isUsableCollectionTagFilterValue,
  sortCollectionTagValues
} from '@fastgpt/global/core/dataset/tagUtils';
import type { TagFilterOptionItemType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { Types } from '../../../common/mongo';
import { MongoDatasetCollection } from './schema';

/**
 * 从 Collection 上聚合每个 tagId「当前已被使用」的值。
 * 不返回标签名/类型，由调用方用已有标签定义拼接；选项类只保留实际出现过的选项。
 */
export const collectUsedTagValues = (
  collections: Array<{ tags?: unknown[] }>
): TagFilterOptionItemType[] => {
  const valuesByTagId = new Map<string, Map<string, string | number>>();

  const addValue = (tagId: string, value: unknown) => {
    if (!isUsableCollectionTagFilterValue(value)) return;
    const current = valuesByTagId.get(tagId) ?? new Map<string, string | number>();
    current.set(collectionTagValueKey(value), value);
    valuesByTagId.set(tagId, current);
  };

  for (const collection of collections) {
    for (const item of collection.tags ?? []) {
      if (!isCollectionTagValue(item)) continue;

      const tagId = String(item.tagId);
      if (Array.isArray(item.value)) {
        for (const value of item.value) addValue(tagId, value);
        continue;
      }
      addValue(tagId, item.value);
    }
  }

  return [...valuesByTagId.entries()]
    .map(([tagId, values]) => ({
      tagId,
      values: sortCollectionTagValues(Array.from(values.values()))
    }))
    .sort((a, b) => a.tagId.localeCompare(b.tagId));
};

/**
 * 按 tagFilters 组装 Collection 列表的标签过滤条件。
 * 同一标签多值为 OR（value $in），不同标签为 AND。
 */
export const buildCollectionListTagMatch = (tagFilters: CollectionTagFilterItem[] = []) => {
  if (tagFilters.length === 0) return {};

  const conditions = tagFilters.map((filter) => ({
    tags: {
      $elemMatch: {
        tagId: filter.tagId,
        value: { $in: filter.values }
      }
    }
  }));

  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
};

/**
 * 聚合当前知识库 Collection 上已被使用的标签值，不含标签定义。
 */
export const getDatasetTagFilterOptions = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<TagFilterOptionItemType[]> => {
  // 筛选弹窗打开后立刻读，走主库避免刚写入的标签值被从库滞后挡住
  const collections = await MongoDatasetCollection.find(
    {
      teamId: new Types.ObjectId(teamId),
      datasetId: new Types.ObjectId(datasetId)
    },
    'tags'
  ).lean();

  return collectUsedTagValues(collections);
};

import { type CollectionTagFilterItem } from '@fastgpt/global/core/dataset/type';
import {
  isUsableCollectionTagFilterValue,
  sortCollectionTagValues
} from '@fastgpt/global/core/dataset/tagUtils';
import type { TagFilterOptionItemType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { Types } from '../../../common/mongo';
import { MongoDatasetCollection } from './schema';

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

type UsedTagValueGroup = {
  _id: string;
  values: unknown[];
};

/**
 * 聚合当前知识库 Collection 上已被使用的标签值，不含标签定义。
 * Mongo unwind + $addToSet 按 tagId 去重后再拉回 Node，空串和非有限数字在本地丢掉。
 */
export const getDatasetTagFilterOptions = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<TagFilterOptionItemType[]> => {
  const grouped = await MongoDatasetCollection.aggregate<UsedTagValueGroup>([
    {
      $match: {
        teamId: new Types.ObjectId(teamId),
        datasetId: new Types.ObjectId(datasetId)
      }
    },
    { $project: { tags: 1 } },
    { $unwind: '$tags' },
    {
      $match: {
        'tags.tagId': { $exists: true, $nin: [null, ''] },
        'tags.value': { $exists: true }
      }
    },
    {
      $project: {
        tagId: { $toString: '$tags.tagId' },
        values: {
          $cond: {
            if: { $isArray: '$tags.value' },
            then: '$tags.value',
            else: ['$tags.value']
          }
        }
      }
    },
    { $unwind: '$values' },
    {
      $group: {
        _id: '$tagId',
        values: { $addToSet: '$values' }
      }
    }
  ]);

  return grouped
    .map((item) => ({
      tagId: String(item._id),
      values: sortCollectionTagValues(item.values.filter(isUsableCollectionTagFilterValue))
    }))
    .filter((item) => item.values.length > 0)
    .sort((a, b) => a.tagId.localeCompare(b.tagId));
};

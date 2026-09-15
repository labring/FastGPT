import type { FilterQuery, PipelineStage } from 'mongoose';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import { AppListSortEnum, appListSortMongoMap } from '@fastgpt/global/core/app/constants';
import { MongoApp } from './schema';

type AppListQuery = {
  filter: FilterQuery<AppSchemaType>;
  fields: string;
  sort?: AppListSortEnum;
  pinnedFirst?: boolean;
  offset?: number;
  limit?: number;
};

// SXF 特有功能
const getPinnedListStages = ({
  fields,
  sort,
  offset = 0,
  limit
}: AppListQuery): PipelineStage.FacetPipelineStage[] => [
  {
    $addFields: {
      _pinRank: { $cond: [{ $eq: ['$isPinned', true] }, 1, 0] },
      ...(!sort && {
        _listSortTime: { $cond: [{ $eq: ['$isPinned', true] }, '$pinnedAt', '$updateTime'] }
      })
    }
  },
  {
    $sort: {
      _pinRank: -1,
      ...(sort ? appListSortMongoMap[sort] : { _listSortTime: -1 as const }),
      _id: -1
    }
  },
  ...(offset ? [{ $skip: offset }] : []),
  ...(limit ? [{ $limit: limit }] : []),
  {
    $project: Object.fromEntries(
      fields
        .trim()
        .split(/\s+/)
        .map((field) => [field, 1])
    )
  }
];

/** Reads a legacy array, sorting both pin groups in a single query when requested. */
export const findAppsForList = async (options: AppListQuery) => {
  const { filter, fields, sort, pinnedFirst = false, offset = 0, limit } = options;
  if (!pinnedFirst) {
    return MongoApp.find(filter, fields, {
      limit,
      sort: { ...appListSortMongoMap[sort ?? AppListSortEnum.updateTimeDesc], _id: -1 },
      skip: offset
    }).lean();
  }

  return MongoApp.aggregate<AppSchemaType>([
    { $match: MongoApp.find(filter).cast(MongoApp) },
    ...getPinnedListStages(options)
  ]);
};

/** Reads a page and its total from the same input stream when pin ordering is enabled. */
export const findAppsPage = async (options: AppListQuery & { limit: number }) => {
  if (!options.pinnedFirst) {
    const [list, total] = await Promise.all([
      findAppsForList(options),
      MongoApp.countDocuments(options.filter)
    ]);
    return { list, total };
  }

  const [page] = await MongoApp.aggregate<{
    list: AppSchemaType[];
    count: { total: number }[];
  }>([
    { $match: MongoApp.find(options.filter).cast(MongoApp) },
    {
      $facet: {
        list: getPinnedListStages(options),
        count: [{ $count: 'total' }]
      }
    }
  ]);
  return { list: page?.list ?? [], total: page?.count[0]?.total ?? 0 };
};

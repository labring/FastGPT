import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { Types, type PipelineStage } from '@fastgpt/service/common/mongo';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DatasetTrainingErrorPaginationLimits,
  GetDatasetTrainingErrorBodySchema,
  GetDatasetTrainingErrorResponseSchema,
  type GetDatasetTrainingErrorBody,
  type GetDatasetTrainingErrorResponse,
  type TrainingErrorGroupType,
  type TrainingErrorItemType
} from '@fastgpt/global/openapi/core/dataset/training/api';
import {
  finalErrorTrainingMatch,
  trainingModeRanks
} from '@fastgpt/service/core/dataset/training/query';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';

async function handler(req: ApiRequestProps): Promise<GetDatasetTrainingErrorResponse> {
  const {
    datasetId,
    collectionId,
    itemOffset = 0,
    itemPageSize = DatasetTrainingErrorPaginationLimits.defaultItemPageSize
  } = parseApiInput({
    req,
    bodySchema: GetDatasetTrainingErrorBodySchema
  }).body;
  const { offset, pageSize: rawPageSize } = parsePaginationRequest(req);
  const pageSize = Math.min(rawPageSize, DatasetTrainingErrorPaginationLimits.maxPageSize);
  const itemLimit = Math.min(itemPageSize, DatasetTrainingErrorPaginationLimits.maxItemPageSize);
  const itemSkip = Math.min(itemOffset, DatasetTrainingErrorPaginationLimits.maxItemOffset);

  const { teamId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  const baseTrainingMatch = {
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(dataset._id),
    ...finalErrorTrainingMatch
  };

  /**
   * 复用集合内异常 chunk 查询流水线，确保首屏和“加载更多”的排序完全一致。
   */
  const buildItemPipeline = ({
    match,
    skip,
    limit
  }: {
    match: Record<string, any>;
    skip: number;
    limit: number;
  }): PipelineStage[] => [
    { $match: match },
    {
      $addFields: {
        modeRank: {
          $switch: {
            branches: trainingModeRanks.map(({ mode, rank }) => ({
              case: { $eq: ['$mode', mode] },
              then: rank
            })),
            default: 999
          }
        }
      }
    },
    { $sort: { modeRank: 1, chunkIndex: 1, _id: 1 } },
    { $skip: skip },
    { $limit: limit },
    { $project: { modeRank: 0 } }
  ];

  if (collectionId) {
    const collection = await MongoDatasetCollection.findOne(
      {
        teamId: new Types.ObjectId(teamId),
        datasetId: new Types.ObjectId(dataset._id),
        _id: new Types.ObjectId(collectionId),
        type: { $ne: DatasetCollectionTypeEnum.folder }
      },
      undefined,
      readFromSecondary
    ).lean();

    if (!collection) {
      return GetDatasetTrainingErrorResponseSchema.parse({
        total: 0,
        list: []
      });
    }

    const collectionMatch = {
      ...baseTrainingMatch,
      collectionId: new Types.ObjectId(collection._id)
    };
    const [items, errorCount] = await Promise.all([
      MongoDatasetTraining.aggregate(
        buildItemPipeline({
          match: collectionMatch,
          skip: itemSkip,
          limit: itemLimit
        }),
        readFromSecondary
      ),
      MongoDatasetTraining.countDocuments(collectionMatch, { ...readFromSecondary })
    ]);
    const { sourceName, sourceId } = getCollectionSourceData(collection);

    return GetDatasetTrainingErrorResponseSchema.parse({
      total: errorCount > 0 ? 1 : 0,
      list:
        errorCount > 0
          ? [
              {
                collection: {
                  _id: collection._id,
                  collectionId: collection._id,
                  name: collection.name,
                  type: collection.type,
                  sourceName,
                  sourceId
                },
                items,
                errorCount,
                hasMoreItems: itemSkip + items.length < errorCount
              }
            ]
          : []
    });
  }

  const [collectionStats, totalResult] = await Promise.all([
    MongoDatasetTraining.aggregate(
      [
        { $match: baseTrainingMatch },
        {
          $group: {
            _id: '$collectionId',
            errorCount: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } },
        { $skip: offset },
        { $limit: pageSize }
      ],
      readFromSecondary
    ),
    MongoDatasetTraining.aggregate(
      [
        { $match: baseTrainingMatch },
        {
          $group: {
            _id: '$collectionId'
          }
        },
        { $count: 'total' }
      ],
      readFromSecondary
    )
  ]);
  const total = totalResult[0]?.total ?? 0;

  const collectionIds = collectionStats.map((item: { _id: any }) => item._id);
  const collections = collectionIds.length
    ? await MongoDatasetCollection.find(
        {
          teamId: new Types.ObjectId(teamId),
          datasetId: new Types.ObjectId(dataset._id),
          _id: { $in: collectionIds },
          type: { $ne: DatasetCollectionTypeEnum.folder }
        },
        undefined,
        readFromSecondary
      ).lean()
    : [];
  const collectionMap = new Map(
    collections.map((collection) => [String(collection._id), collection])
  );
  const statsMap = new Map(
    collectionStats.map((item: { _id: any; errorCount: number }) => [
      String(item._id),
      item.errorCount
    ])
  );
  const itemsList = collectionIds.length
    ? await Promise.all(
        collectionIds.map((id: any) =>
          MongoDatasetTraining.aggregate(
            buildItemPipeline({
              match: {
                ...baseTrainingMatch,
                collectionId: id
              },
              skip: 0,
              limit: itemLimit
            }),
            readFromSecondary
          )
        )
      )
    : [];

  const list = collectionIds.reduce<TrainingErrorGroupType[]>((groups, id: any, index: number) => {
    const collection = collectionMap.get(String(id));
    const errorCount = statsMap.get(String(id)) ?? 0;
    const items = (itemsList[index] ?? []) as TrainingErrorItemType[];
    if (!collection || errorCount === 0 || items.length === 0) return groups;

    const { sourceName, sourceId } = getCollectionSourceData(collection);

    groups.push({
      collection: {
        _id: collection._id,
        collectionId: collection._id,
        name: collection.name,
        type: collection.type,
        sourceName,
        sourceId
      },
      items,
      errorCount,
      hasMoreItems: items.length < errorCount
    });
    return groups;
  }, []);

  return GetDatasetTrainingErrorResponseSchema.parse({
    total,
    list
  });
}

export default NextAPI(handler);
export type getDatasetTrainingErrorBody = GetDatasetTrainingErrorBody;
export type getDatasetTrainingErrorResponse = GetDatasetTrainingErrorResponse;

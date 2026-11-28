import { parseRepoRows } from '@fastgpt/dal/db/parse';
import { DatasetQaTrainingCollectionName } from '@fastgpt/dal/db/mongo/datasetQaTrainingCollectionName';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { optionalNullToUndefined } from '@fastgpt/global/common/zod';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  datasetDataRebuildFailedStatuses,
  datasetDataRebuildIndexProcessingStatuses,
  datasetDataRebuildSynonymProcessingStatuses
} from '@fastgpt/global/core/dataset/data/utils';
import { DatasetCollectionSchema } from '@fastgpt/global/core/dataset/type';
import {
  TrainingErrorItemSchema,
  type GetDatasetTrainingErrorResponse,
  type TrainingErrorItemType
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { type PipelineStage, Types } from '../../../../common/mongo';
import { readFromSecondary } from '../../../../common/mongo/utils';
import { DatasetColCollectionName, MongoDatasetCollection } from '../../collection/schema';
import { datasetDataTrainingStatusMatch } from '../../data/query';
import { DatasetDataCollectionName } from '../../data/schema';
import { BLOCKED_LOCK_TIME, trainingModeRanks } from '../query';

type TrainingErrorScope = {
  teamId: string;
  datasetId: string;
  collectionId?: string;
  collectionIds?: readonly string[];
};

type TrainingErrorPageInput = {
  scope: TrainingErrorScope;
  offset: number;
  limit: number;
};

const TrainingErrorCollectionReadSchema = DatasetCollectionSchema.pick({
  _id: true,
  name: true,
  type: true
}).extend({
  fileId: optionalNullToUndefined(DatasetCollectionSchema.shape.fileId),
  rawLink: optionalNullToUndefined(DatasetCollectionSchema.shape.rawLink),
  externalFileId: optionalNullToUndefined(DatasetCollectionSchema.shape.externalFileId),
  externalFileUrl: optionalNullToUndefined(DatasetCollectionSchema.shape.externalFileUrl),
  apiFileId: optionalNullToUndefined(DatasetCollectionSchema.shape.apiFileId)
});

const epoch = new Date(0);
const unpaidError = i18nT('common:code_error.team_error.ai_points_not_enough');

/** 检查授权范围内是否有最终失败或欠费阻塞的工作项。 */
export const hasTrainingErrors = async (scope: TrainingErrorScope) => {
  const [result] = await MongoDatasetCollection.aggregate(
    [...(await getTrainingErrorPipeline(scope, { summaryOnly: true })), { $limit: 1 }],
    readFromSecondary
  );
  return result !== undefined;
};

/** 页内 ID 和总数在同次聚合中读取，正文逐条返回以避免整页触及 BSON 大小上限。 */
export const getTrainingErrorPage = async ({
  scope,
  offset,
  limit
}: TrainingErrorPageInput): Promise<{ items: TrainingErrorItemType[]; total: number }> => {
  const [result] = await MongoDatasetCollection.aggregate<{
    items: { _id: Types.ObjectId }[];
    counts: { total: number }[];
  }>(
    [
      ...(await getTrainingErrorPipeline(scope, { summaryOnly: true })),
      {
        $facet: {
          items: [...pageTrainingErrors(offset, limit), { $project: { _id: 1 } }],
          counts: [{ $count: 'total' }]
        }
      }
    ],
    readFromSecondary
  );
  const total = result?.counts[0]?.total ?? 0;
  const itemIds = result?.items.map(({ _id }) => _id) ?? [];
  const items = itemIds.length ? await listTrainingErrors({ scope, limit, itemIds }) : [];
  return { items, total };
};

/** 在数据库分页选出有异常的集合，再分别读取每个集合的预览。 */
export const getTrainingErrorCollectionPage = async ({
  scope,
  offset,
  limit,
  itemLimit
}: TrainingErrorPageInput & { itemLimit: number }): Promise<GetDatasetTrainingErrorResponse> => {
  const [result] = await MongoDatasetCollection.aggregate<{
    list: { _id: Types.ObjectId; errorCount: number }[];
    counts: { total: number }[];
  }>(
    [
      ...(await getTrainingErrorPipeline(scope, { summaryOnly: true })),
      { $group: { _id: '$collectionId', errorCount: { $sum: 1 } } },
      {
        $facet: {
          list: [{ $sort: { _id: 1 } }, { $skip: offset }, { $limit: limit }],
          counts: [{ $count: 'total' }]
        }
      }
    ],
    readFromSecondary
  );
  const total = result?.counts[0]?.total ?? 0;
  const stats = result?.list ?? [];
  if (stats.length === 0) return { list: [], total };

  const [collections, previews] = await Promise.all([
    MongoDatasetCollection.find(
      {
        teamId: scope.teamId,
        datasetId: scope.datasetId,
        _id: { $in: stats.map(({ _id }) => _id) },
        type: { $ne: DatasetCollectionTypeEnum.folder }
      },
      'name type fileId rawLink externalFileId externalFileUrl apiFileId',
      readFromSecondary
    ).lean(),
    Promise.all(
      stats.map(({ _id }) =>
        listTrainingErrors({ scope: { ...scope, collectionId: String(_id) }, limit: itemLimit })
      )
    )
  ]);
  const collectionMap = new Map(
    parseRepoRows({
      table: DatasetColCollectionName,
      schema: TrainingErrorCollectionReadSchema,
      rows: collections
    }).map((collection) => [collection._id, collection])
  );
  const list = stats.flatMap(({ _id, errorCount }, index) => {
    const collection = collectionMap.get(String(_id));
    const items = previews[index];
    if (!collection || items.length === 0) return [];

    return [
      {
        collection: {
          _id: collection._id,
          collectionId: collection._id,
          name: collection.name,
          type: collection.type,
          ...getCollectionSourceData(collection)
        },
        items,
        errorCount,
        hasMoreItems: items.length < errorCount
      }
    ];
  });
  return { list, total };
};

const listTrainingErrors = async ({
  scope,
  limit,
  itemIds
}: {
  scope: TrainingErrorScope;
  limit: number;
  itemIds?: Types.ObjectId[];
}) => {
  const rows = await MongoDatasetCollection.aggregate(
    [...(await getTrainingErrorPipeline(scope, { itemIds })), ...pageTrainingErrors(0, limit)],
    readFromSecondary
  );
  return parseRepoRows({
    table: DatasetColCollectionName,
    schema: TrainingErrorItemSchema,
    rows
  });
};

/** 集合错误与知识库错误统一排序，详情和翻页使用同一个顺序。 */
const pageTrainingErrors = (offset: number, limit: number): PipelineStage.FacetPipelineStage[] => [
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
  { $skip: offset },
  { $limit: limit },
  { $project: { modeRank: 0 } }
];

/** 在原有 Mongo 模型上聚合文档解析、QA 原文和分块异常。 */
const getTrainingErrorPipeline = async (
  { teamId, datasetId, collectionId, collectionIds }: TrainingErrorScope,
  { summaryOnly = false, itemIds }: { summaryOnly?: boolean; itemIds?: Types.ObjectId[] }
): Promise<PipelineStage[]> => {
  const datasetScope = {
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  };
  const collectionMatch =
    collectionId !== undefined || collectionIds !== undefined
      ? {
          ...(collectionId !== undefined && { $eq: new Types.ObjectId(collectionId) }),
          ...(collectionIds !== undefined && {
            $in: collectionIds.map((id) => new Types.ObjectId(id))
          })
        }
      : undefined;
  const scope = {
    ...datasetScope,
    ...(collectionMatch && { collectionId: collectionMatch }),
    ...(itemIds && { _id: { $in: itemIds } })
  };
  const collectionScope = { ...datasetScope, ...(collectionMatch && { _id: collectionMatch }) };
  const pausedCollections = await MongoDatasetCollection.aggregate<{ _id: Types.ObjectId }>(
    [
      { $match: { ...collectionScope, 'training.status': 'paused_unpaid' } },
      { $project: { _id: 1 } }
    ],
    readFromSecondary
  );
  const pausedIds = pausedCollections.map(({ _id }) => _id);
  const paused = { $in: ['$collectionId', pausedIds] };

  // 旧队列的调度字段继续以固定值返回，欠费沿用原暂停标记。
  const compatibilityFields = {
    teamId: 1,
    tmbId: 1,
    datasetId: 1,
    collectionId: 1,
    q: { $ifNull: ['$q', ''] },
    a: { $ifNull: ['$a', ''] },
    chunkIndex: { $ifNull: ['$chunkIndex', 0] },
    expireAt: { $literal: epoch },
    lockTime: { $cond: [paused, BLOCKED_LOCK_TIME, epoch] },
    retryCount: { $literal: 0 },
    weight: { $literal: 0 }
  };

  const dataModeExpr = {
    $switch: {
      branches: [
        {
          case: {
            $in: [
              '$indexStatus',
              [
                ...datasetDataRebuildIndexProcessingStatuses,
                DatasetDataIndexStatusEnum.rebuildIndexFailed
              ]
            ]
          },
          then: TrainingModeEnum.rebuildIndex
        },
        {
          case: {
            $in: [
              '$indexStatus',
              [
                ...datasetDataRebuildSynonymProcessingStatuses,
                DatasetDataIndexStatusEnum.rebuildSynonymFailed
              ]
            ]
          },
          then: TrainingModeEnum.rebuildSynonym
        }
      ],
      default: '$indexStatus'
    }
  };

  return [
    {
      $match: {
        ...collectionScope,
        ...(itemIds && { $and: [{ _id: { $in: itemIds } }] }),
        $or: [
          { 'training.parse.status': 'error' },
          { 'training.status': 'paused_unpaid', 'training.parse.status': 'active' }
        ]
      }
    },
    {
      $project: summaryOnly
        ? {
            collectionId: '$_id',
            mode: { $literal: TrainingModeEnum.parse },
            chunkIndex: { $literal: 0 }
          }
        : {
            ...compatibilityFields,
            collectionId: '$_id',
            mode: { $literal: TrainingModeEnum.parse },
            indexes: { $literal: [] },
            lockTime: {
              $cond: [{ $eq: ['$training.status', 'paused_unpaid'] }, BLOCKED_LOCK_TIME, epoch]
            },
            errorMsg: {
              $cond: [
                { $eq: ['$training.parse.status', 'error'] },
                '$training.parse.errorMsg',
                unpaidError
              ]
            }
          }
    },
    {
      $unionWith: {
        coll: DatasetQaTrainingCollectionName,
        pipeline: [
          {
            $match: {
              ...scope,
              $or: [{ status: 'error' }, { collectionId: { $in: pausedIds }, status: 'active' }]
            }
          },
          {
            $project: summaryOnly
              ? {
                  collectionId: 1,
                  mode: { $literal: TrainingModeEnum.qa },
                  chunkIndex: { $ifNull: ['$chunkIndex', 0] }
                }
              : {
                  ...compatibilityFields,
                  mode: { $literal: TrainingModeEnum.qa },
                  dataMetadata: 1,
                  indexes: { $literal: [] },
                  errorMsg: { $cond: [{ $eq: ['$status', 'error'] }, '$errorMsg', unpaidError] }
                }
          }
        ]
      }
    },
    {
      $unionWith: {
        coll: DatasetDataCollectionName,
        pipeline: [
          {
            $match: {
              ...scope,
              ...datasetDataTrainingStatusMatch,
              $or: [
                { indexError: true },
                { indexStatus: { $in: datasetDataRebuildFailedStatuses } },
                { collectionId: { $in: pausedIds } }
              ]
            }
          },
          {
            $project: summaryOnly
              ? {
                  collectionId: 1,
                  mode: dataModeExpr,
                  chunkIndex: { $ifNull: ['$chunkIndex', 0] }
                }
              : {
                  ...compatibilityFields,
                  mode: dataModeExpr,
                  dataId: '$_id',
                  imageId: 1,
                  imageDescMap: 1,
                  dataMetadata: '$metadata',
                  indexSize: '$trainingIndexSize',
                  indexes: { $ifNull: ['$draftIndexes', { $ifNull: ['$indexes', []] }] },
                  errorMsg: {
                    $cond: [
                      {
                        $or: [
                          { $eq: ['$indexError', true] },
                          { $in: ['$indexStatus', datasetDataRebuildFailedStatuses] }
                        ]
                      },
                      { $ifNull: ['$indexErrorMsg', ''] },
                      unpaidError
                    ]
                  }
                }
          }
        ]
      }
    }
  ];
};

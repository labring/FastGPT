import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  datasetDataRebuildFailedStatuses,
  datasetDataRebuildIndexProcessingStatuses,
  datasetDataRebuildSynonymProcessingStatuses
} from '@fastgpt/global/core/dataset/data/utils';
import type { TrainingErrorItemType } from '@fastgpt/global/openapi/core/dataset/training/api';
import { type PipelineStage, Types } from '../../../common/mongo';
import { readFromSecondary } from '../../../common/mongo/utils';
import { MongoDatasetCollection } from '../collection/schema';
import { datasetDataTrainingStatusMatch } from '../data/query';
import { DatasetDataCollectionName } from '../data/schema';
import { DatasetQaTrainingCollectionName } from './qaSchema';
import { BLOCKED_LOCK_TIME, trainingModeRanks } from './query';

type TrainingErrorScope = {
  teamId: Types.ObjectId;
  datasetId: Types.ObjectId;
  collectionId?: Types.ObjectId;
  collectionIds?: Types.ObjectId[];
  itemIds?: Types.ObjectId[];
  idsOnly?: boolean;
};

/** 汇总各存储的异常，投影成现有训练错误 DTO，再由调用方排序、计数或分页。 */
export const getTrainingErrorPipeline = async ({
  teamId,
  datasetId,
  collectionId,
  collectionIds,
  itemIds,
  idsOnly = false
}: TrainingErrorScope): Promise<PipelineStage[]> => {
  const datasetScope = { teamId, datasetId };
  const collectionMatch =
    collectionId !== undefined || collectionIds !== undefined
      ? {
          ...(collectionId !== undefined && { $eq: collectionId }),
          ...(collectionIds !== undefined && { $in: collectionIds })
        }
      : undefined;
  const scope = {
    ...datasetScope,
    ...(collectionMatch && { collectionId: collectionMatch }),
    ...(itemIds && { _id: { $in: itemIds } })
  };
  const collectionScope = { ...datasetScope, ...(collectionMatch && { _id: collectionMatch }) };
  const pausedCollections = await MongoDatasetCollection.find(
    {
      ...collectionScope,
      'training.status': 'paused_unpaid'
    },
    { _id: 1 },
    readFromSecondary
  ).lean();
  const pausedIds = pausedCollections.map(({ _id }) => new Types.ObjectId(_id));
  const paused = { $in: ['$collectionId', pausedIds] };
  const unpaidError = i18nT('common:code_error.team_error.ai_points_not_enough');
  const epoch = new Date(0);

  // 响应还保留旧队列的必填调度字段。新任务不使用这些字段，日期用固定值，欠费用原暂停标记。
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
      $project: idsOnly
        ? {
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
            $project: idsOnly
              ? {
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
            $project: idsOnly
              ? {
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

/** 集合错误与知识库错误统一排序，详情和翻页使用同一个顺序。 */
export const pageTrainingErrors = (
  offset: number,
  limit: number
): PipelineStage.FacetPipelineStage[] => [
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

/** 同次聚合读取页内 ID 和总数，正文保持逐条返回，避免整页触及 BSON 文档大小上限。 */
export const getTrainingErrorPage = async ({
  scope,
  offset,
  limit
}: {
  scope: TrainingErrorScope;
  offset: number;
  limit: number;
}) => {
  const [result] = await MongoDatasetCollection.aggregate<{
    items: { _id: Types.ObjectId }[];
    counts: { total: number }[];
  }>(
    [
      ...(await getTrainingErrorPipeline({ ...scope, idsOnly: true })),
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
  if (!itemIds.length) return { items: [], total };
  const items = await MongoDatasetCollection.aggregate<TrainingErrorItemType>(
    [...(await getTrainingErrorPipeline({ ...scope, itemIds })), ...pageTrainingErrors(0, limit)],
    readFromSecondary
  );
  return { items, total };
};

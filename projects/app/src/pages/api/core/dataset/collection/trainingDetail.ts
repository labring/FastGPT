import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { Types } from '@fastgpt/service/common/mongo';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetCollectionTrainingDetailQuerySchema,
  GetCollectionTrainingDetailResponseSchema,
  type GetCollectionTrainingDetailResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import {
  activeTrainingExpr,
  finalErrorTrainingExpr,
  remainingTrainingMatch
} from '@fastgpt/service/core/dataset/training/query';
import { datasetDataStatusCountFields } from '@fastgpt/service/core/dataset/data/query';
import { TRAINING_LEASE_TIMEOUT_MS } from '@fastgpt/global/core/dataset/training/constant';

const defaultCounts: Record<TrainingModeEnum, number> = {
  chunk: 0, // 兼容尚未迁移的历史任务统计
  parse: 0,
  qa: 0,
  rebuildIndex: 0,
  rebuildSynonym: 0,
  index: 0,
  image: 0,
  auto: 0,
  imageParse: 0
};

/** 汇总普通训练阶段；重建按 data 状态区分待重建、重建中和失败，一次聚合获取。 */
async function handler(req: ApiRequestProps): Promise<GetCollectionTrainingDetailResponseType> {
  const { collectionId } = parseApiInput({
    req,
    querySchema: GetCollectionTrainingDetailQuerySchema
  }).query;

  const { collection } = await authDatasetCollection({
    req,
    collectionId,
    per: ReadPermissionVal,
    authToken: true,
    authApiKey: true
  });

  const match = {
    teamId: new Types.ObjectId(collection.teamId),
    datasetId: new Types.ObjectId(collection.datasetId),
    collectionId: new Types.ObjectId(collection._id)
  };

  const leaseExpiredAt = new Date(Date.now() - TRAINING_LEASE_TIMEOUT_MS);
  const [modeCounts, [dataStatus]] = await Promise.all([
    MongoDatasetTraining.aggregate<{
      _id: TrainingModeEnum;
      queuedCount: number;
      trainingCount: number;
      errorCount: number;
    }>([
      {
        $match: {
          ...match,
          ...remainingTrainingMatch,
          mode: { $nin: [TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym] }
        }
      },
      {
        $group: {
          _id: '$mode',
          queuedCount: {
            $sum: {
              $cond: [{ $and: [activeTrainingExpr, { $lte: ['$lockTime', leaseExpiredAt] }] }, 1, 0]
            }
          },
          trainingCount: {
            $sum: {
              $cond: [{ $and: [activeTrainingExpr, { $gt: ['$lockTime', leaseExpiredAt] }] }, 1, 0]
            }
          },
          errorCount: { $sum: { $cond: [finalErrorTrainingExpr, 1, 0] } }
        }
      }
    ]),
    MongoDatasetData.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          ...datasetDataStatusCountFields,
          rebuildIndexPendingCount: {
            $sum: {
              $cond: [
                { $eq: ['$indexStatus', DatasetDataIndexStatusEnum.rebuildIndexPending] },
                1,
                0
              ]
            }
          },
          rebuildSynonymPendingCount: {
            $sum: {
              $cond: [
                { $eq: ['$indexStatus', DatasetDataIndexStatusEnum.rebuildSynonymPending] },
                1,
                0
              ]
            }
          }
        }
      }
    ])
  ]);

  const queuedCounts = { ...defaultCounts };
  const trainingCounts = { ...defaultCounts };
  const errorCounts = { ...defaultCounts };
  for (const item of modeCounts) {
    queuedCounts[item._id] = item.queuedCount;
    trainingCounts[item._id] = item.trainingCount;
    errorCounts[item._id] = item.errorCount;
  }

  queuedCounts.rebuildIndex = dataStatus?.rebuildIndexPendingCount ?? 0;
  trainingCounts.rebuildIndex =
    (dataStatus?.rebuildIndexActiveCount ?? 0) - queuedCounts.rebuildIndex;
  errorCounts.rebuildIndex = dataStatus?.rebuildIndexFailedCount ?? 0;
  queuedCounts.rebuildSynonym = dataStatus?.rebuildSynonymPendingCount ?? 0;
  trainingCounts.rebuildSynonym =
    (dataStatus?.rebuildSynonymActiveCount ?? 0) - queuedCounts.rebuildSynonym;
  errorCounts.rebuildSynonym = dataStatus?.rebuildSynonymFailedCount ?? 0;

  return GetCollectionTrainingDetailResponseSchema.parse({
    trainingType: collection.trainingType,
    advancedTraining: {
      customPdfParse: !!collection.customPdfParse,
      imageIndex: !!collection.imageIndex,
      autoIndexes: !!collection.autoIndexes
    },
    queuedCounts,
    trainingCounts,
    errorCounts,
    trainedCount: dataStatus?.trainedCount ?? 0
  });
}

export default NextAPI(handler);

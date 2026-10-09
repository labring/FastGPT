import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
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
  BLOCKED_LOCK_TIME,
  finalErrorTrainingMatch
} from '@fastgpt/service/core/dataset/training/query';
import { subMinutes } from 'date-fns';
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

const TRAINING_LOCK_TIMEOUT_MINUTES = TRAINING_LEASE_TIMEOUT_MS / 60 / 1000;

/** 汇总普通训练阶段；重建处理中、失败及已就绪数量统一从 data 一次聚合获取。 */
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

  const now = new Date();
  const activeLockTimeExpr = {
    $gt: subMinutes(now, TRAINING_LOCK_TIMEOUT_MINUTES),
    $lt: BLOCKED_LOCK_TIME
  };

  const [ququedCountData, trainingCountData, errorCountData, [dataStatus]] = await Promise.all([
    MongoDatasetTraining.aggregate<{ _id: TrainingModeEnum; count: number }>([
      {
        $match: {
          ...match,
          mode: { $nin: [TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym] },
          retryCount: { $gt: 0 },
          lockTime: { $lte: subMinutes(now, TRAINING_LOCK_TIMEOUT_MINUTES) }
        }
      },
      {
        $group: {
          _id: '$mode',
          count: { $sum: 1 }
        }
      }
    ]),
    MongoDatasetTraining.aggregate<{ _id: TrainingModeEnum; count: number }>([
      {
        $match: {
          ...match,
          mode: { $nin: [TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym] },
          retryCount: { $gt: 0 },
          lockTime: activeLockTimeExpr
        }
      },
      {
        $group: {
          _id: '$mode',
          count: { $sum: 1 }
        }
      }
    ]),
    MongoDatasetTraining.aggregate<{ _id: TrainingModeEnum; count: number }>([
      {
        $match: {
          ...match,
          mode: { $nin: [TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym] },
          ...finalErrorTrainingMatch
        }
      },
      {
        $group: {
          _id: '$mode',
          count: { $sum: 1 }
        }
      }
    ]),
    MongoDatasetData.aggregate([
      { $match: match },
      { $group: { _id: null, ...datasetDataStatusCountFields } }
    ])
  ]);

  const queuedCounts = ququedCountData.reduce(
    (acc, item) => {
      acc[item._id] = item.count;
      return acc;
    },
    { ...defaultCounts }
  );
  const trainingCounts = trainingCountData.reduce(
    (acc, item) => {
      acc[item._id] = item.count;
      return acc;
    },
    { ...defaultCounts }
  );
  const errorCounts = errorCountData.reduce(
    (acc, item) => {
      acc[item._id] = item.count;
      return acc;
    },
    { ...defaultCounts }
  );

  trainingCounts.rebuildIndex = dataStatus?.rebuildIndexActiveCount ?? 0;
  errorCounts.rebuildIndex = dataStatus?.rebuildIndexFailedCount ?? 0;
  trainingCounts.rebuildSynonym = dataStatus?.rebuildSynonymActiveCount ?? 0;
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

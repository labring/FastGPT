import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { type TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
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
import { indexedDatasetDataMatch } from '@fastgpt/global/core/dataset/data/utils';
import { TRAINING_LEASE_TIMEOUT_MS } from '@fastgpt/global/core/dataset/training/constant';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';

const defaultCounts: Record<TrainingModeEnum, number> = {
  chunk: 0, // 兼容尚未迁移的历史任务统计
  parse: 0,
  qa: 0,
  rebuild: 0,
  index: 0,
  image: 0,
  auto: 0,
  imageParse: 0
};

const TRAINING_LOCK_TIMEOUT_MINUTES = TRAINING_LEASE_TIMEOUT_MS / 60 / 1000;

/** 汇总当前集合的训练阶段；重建等待数同时包含尚未入队的 data，已入队项只按 training 统计。 */
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

  // 已训练数只统计完成索引的数据：提前落库后集合内会立即出现待索引数据，
  // 不区分状态会让"就绪"步骤直接跳到满值，而实际尚未索引。
  const trainedMatch = {
    ...match,
    ...indexedDatasetDataMatch
  };

  const now = new Date();
  const activeLockTimeExpr = {
    $gt: subMinutes(now, TRAINING_LOCK_TIMEOUT_MINUTES),
    $lt: BLOCKED_LOCK_TIME
  };

  const [ququedCountData, trainingCountData, errorCountData, trainedCount, waitingRebuildCount] =
    await Promise.all([
      MongoDatasetTraining.aggregate<{ _id: TrainingModeEnum; count: number }>([
        {
          $match: {
            ...match,
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
      MongoDatasetData.countDocuments(trainedMatch),
      // waitingRebuild 尚无 training；入队时原子变为 rebuilding，不能把后者再计入等待。
      MongoDatasetData.countDocuments({
        ...match,
        indexStatus: DatasetDataIndexStatusEnum.waitingRebuild
      })
    ]);

  const queuedCounts = ququedCountData.reduce(
    (acc, item) => {
      acc[item._id] = item.count;
      return acc;
    },
    { ...defaultCounts }
  );
  queuedCounts.rebuild += waitingRebuildCount;
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
    trainedCount
  });
}

export default NextAPI(handler);

import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { type TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { type ApiRequestProps } from '@fastgpt/next/types';
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

const defaultCounts: Record<TrainingModeEnum, number> = {
  parse: 0,
  qa: 0,
  chunk: 0,
  image: 0,
  auto: 0,
  imageParse: 0
};

const MODE_LOCK_TIMEOUT_MINUTES: Record<TrainingModeEnum, number> = {
  parse: 10,
  qa: 10,
  chunk: 3,
  image: 10,
  auto: 10,
  imageParse: 10
};

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
  const activeTrainingExpr = Object.entries(MODE_LOCK_TIMEOUT_MINUTES).map(
    ([mode, timeoutMinutes]) => ({
      mode,
      lockTime: { $gt: subMinutes(now, timeoutMinutes), $lt: BLOCKED_LOCK_TIME }
    })
  );

  const [ququedCountData, trainingCountData, errorCountData, trainedCount] = (await Promise.all([
    MongoDatasetTraining.aggregate([
      {
        $match: {
          ...match,
          retryCount: { $gt: 0 },
          lockTime: { $lt: BLOCKED_LOCK_TIME },
          // 只统计当前集合里未被 worker 领取或锁超时后可重试的任务，避免跨知识库队列污染状态展示。
          $nor: activeTrainingExpr
        }
      },
      {
        $group: {
          _id: '$mode',
          count: { $sum: 1 }
        }
      }
    ]),
    MongoDatasetTraining.aggregate([
      {
        $match: {
          ...match,
          retryCount: { $gt: 0 },
          $or: activeTrainingExpr
        }
      },
      {
        $group: {
          _id: '$mode',
          count: { $sum: 1 }
        }
      }
    ]),
    MongoDatasetTraining.aggregate([
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
    MongoDatasetData.countDocuments(match)
  ])) as [
    { _id: TrainingModeEnum; count: number }[],
    { _id: TrainingModeEnum; count: number }[],
    { _id: TrainingModeEnum; count: number }[],
    number
  ];

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

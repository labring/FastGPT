import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  DatasetCollectionDataProcessModeEnum,
  type TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { Types } from '@fastgpt/service/common/mongo';
import {
  GetCollectionTrainingDetailQuerySchema,
  GetCollectionTrainingDetailResponseSchema,
  type GetCollectionTrainingDetailResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';

const defaultCounts: Record<TrainingModeEnum, number> = {
  parse: 0,
  qa: 0,
  chunk: 0,
  image: 0,
  auto: 0,
  imageParse: 0,
  databaseSchema: 0,
  hype: 0,
  small2Big: 0,
  synonymStandardize: 0,
  synonymRestore: 0
};

async function handler(req: ApiRequestProps): Promise<GetCollectionTrainingDetailResponseType> {
  const { collectionId } = GetCollectionTrainingDetailQuerySchema.parse(req.query);

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

  // retryCount > 0 即代表可重试（含重试中的瞬态错误），errorMsg 状态不影响 active 判定；
  // 真正的终态错误由 terminalErrorMatch 单独统计。
  const activeTrainingMatch = {
    retryCount: { $gt: 0 },
    lockTime: { $lt: new Date('2050/1/1') }
  };
  const terminalErrorMatch = {
    retryCount: { $lte: 0 },
    errorMsg: { $exists: true }
  };

  // Computed global queue
  const minId = (
    await MongoDatasetTraining.findOne(
      { ...match, ...activeTrainingMatch },
      { sort: { _id: 1 }, select: '_id' }
    ).lean()
  )?._id;

  const [ququedCountData, trainingCountData, errorCountData, trainedCount] = (await Promise.all([
    minId
      ? MongoDatasetTraining.aggregate([
          {
            $match: {
              _id: { $lt: new Types.ObjectId(minId) },
              ...activeTrainingMatch
            }
          },
          {
            $group: {
              _id: '$mode',
              count: { $sum: 1 }
            }
          }
        ])
      : Promise.resolve([]),
    MongoDatasetTraining.aggregate([
      {
        $match: {
          ...match,
          ...activeTrainingMatch
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
          ...terminalErrorMatch
        }
      },
      {
        $group: {
          _id: '$mode',
          count: { $sum: 1 }
        }
      }
    ]),
    MongoDatasetData.countDocuments({ ...match, indexingCompleteTime: { $exists: true } })
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
      autoIndexes: !!collection.autoIndexes,
      small2bigIndexes: !!collection.small2bigIndexes,
      hypeIndexes: !!collection.hypeIndexes
    },
    queuedCounts,
    trainingCounts,
    errorCounts,
    trainedCount,
    parsingCompleteTime: collection.parsingCompleteTime,
    indexingCompleteTime: collection.indexingCompleteTime
  });
}

export default NextAPI(handler);

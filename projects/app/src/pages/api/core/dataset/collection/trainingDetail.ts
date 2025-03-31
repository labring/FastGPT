import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  DatasetCollectionDataProcessModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { ApiRequestProps } from '@fastgpt/service/type/next';

type getTrainingDetailParams = {
  collectionId: string;
};

export type getTrainingDetailResult = {
  trainingType: DatasetCollectionDataProcessModeEnum;
  advancedTraining: {
    customPdfParse: boolean;
    imageIndex: boolean;
    autoIndexes: boolean;
  };
  waitingCounts: Record<TrainingModeEnum, number>;
  trainingCounts: Record<TrainingModeEnum, number>;
  errorCounts: Record<TrainingModeEnum, number>;
  trainedCount: number;
};

const defaultCounts: Record<TrainingModeEnum, number> = {
  qa: 0,
  chunk: 0,
  image: 0,
  auto: 0
};

async function handler(
  req: ApiRequestProps<{}, getTrainingDetailParams>
): Promise<getTrainingDetailResult> {
  const { collectionId } = req.query;

  const { collection } = await authDatasetCollection({
    req,
    authToken: true,
    collectionId: collectionId as string,
    per: ReadPermissionVal
  });

  const match = {
    teamId: collection.teamId,
    datasetId: collection.datasetId,
    collectionId: collection._id
  };

  const group = {
    _id: null,
    qa: { $sum: { $cond: [{ $eq: ['$mode', TrainingModeEnum.qa] }, 1, 0] } },
    chunk: { $sum: { $cond: [{ $eq: ['$mode', TrainingModeEnum.chunk] }, 1, 0] } },
    image: { $sum: { $cond: [{ $eq: ['$mode', TrainingModeEnum.image] }, 1, 0] } },
    auto: { $sum: { $cond: [{ $eq: ['$mode', TrainingModeEnum.auto] }, 1, 0] } }
  };

  const minId = await MongoDatasetTraining.findOne(
    {
      teamId: collection.teamId,
      datasetId: collection.datasetId,
      collectionId: collection._id
    },
    { sort: { _id: 1 } },
    readFromSecondary
  );

  const [trainingCountsResult, errorCountsResult, trainedCount, waitingCountsResult] =
    await Promise.all([
      // 获取训练计数
      MongoDatasetTraining.aggregate([{ $match: match }, { $group: group }], readFromSecondary),
      // 获取错误计数
      MongoDatasetTraining.aggregate(
        [
          {
            $match: {
              ...match,
              errorMsg: { $exists: true }
            }
          },
          { $group: group }
        ],
        readFromSecondary
      ),
      // 获取训练完成计数
      MongoDatasetData.countDocuments(match, readFromSecondary),
      // 获取等待训练计数
      MongoDatasetTraining.aggregate(
        [{ $match: { _id: { $lt: minId?._id }, retryCount: { $gt: 0 } } }, { $group: group }],
        readFromSecondary
      )
    ]);

  const trainingCounts = trainingCountsResult[0] || defaultCounts;
  const errorCounts = errorCountsResult[0] || defaultCounts;
  const waitingCounts = waitingCountsResult[0] || defaultCounts;

  return {
    trainingType: collection.trainingType,
    advancedTraining: {
      customPdfParse: !!collection.customPdfParse,
      imageIndex: !!collection.imageIndex,
      autoIndexes: !!collection.autoIndexes
    },

    waitingCounts,
    trainingCounts,

    errorCounts,
    trainedCount
  };
}

export default NextAPI(handler);

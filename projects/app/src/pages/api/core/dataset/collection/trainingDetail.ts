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

  // Computed global queue
  const minId = await MongoDatasetTraining.findOne(
    {
      teamId: collection.teamId,
      datasetId: collection.datasetId,
      collectionId: collection._id
    },
    { sort: { _id: 1 }, select: '_id' },
    readFromSecondary
  ).lean();

  // 获取所有训练模式
  const trainingModes = Object.values(TrainingModeEnum);

  const [trainingCounts, errorCounts, trainedCount, waitingCounts] = await Promise.all([
    // 获取训练计数
    Promise.all(
      trainingModes.map((mode) =>
        MongoDatasetTraining.countDocuments(
          {
            ...match,
            mode
          },
          readFromSecondary
        )
      )
    ).then((counts) => {
      const trainingCounts = {
        ...defaultCounts,
        ...Object.fromEntries(trainingModes.map((mode, i) => [mode, counts[i]]))
      };
      return trainingCounts;
    }),

    // 获取错误计数
    Promise.all(
      trainingModes.map((mode) =>
        MongoDatasetTraining.countDocuments(
          {
            ...match,
            mode,
            errorMsg: { $exists: true }
          },
          readFromSecondary
        )
      )
    ).then((counts) => {
      const errorCounts = {
        ...defaultCounts,
        ...Object.fromEntries(trainingModes.map((mode, i) => [mode, counts[i]]))
      };
      return errorCounts;
    }),

    // 获取训练完成计数
    MongoDatasetData.countDocuments(match, readFromSecondary),

    // 获取等待训练计数
    Promise.all(
      trainingModes.map((mode) =>
        MongoDatasetTraining.countDocuments(
          {
            _id: { $lt: minId?._id },
            retryCount: { $gt: 0 },
            lockTime: { $lt: new Date('2050/1/1') },
            mode
          },
          readFromSecondary
        )
      )
    ).then((counts) => {
      const waitingCounts = {
        ...defaultCounts,
        ...Object.fromEntries(trainingModes.map((mode, i) => [mode, counts[i]]))
      };
      return waitingCounts;
    })
  ]);

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

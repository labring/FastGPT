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

  const [result, trainedCount] = await Promise.all([
    MongoDatasetTraining.aggregate(
      [
        { $match: match },
        {
          $facet: {
            trainingCounts: [{ $group: { _id: '$mode', count: { $sum: 1 } } }],
            errorCounts: [
              { $match: { errorMsg: { $exists: true } } },
              { $group: { _id: '$mode', count: { $sum: 1 } } }
            ],
            waitingCounts: [
              {
                $match: {
                  _id: { $lt: minId?._id },
                  retryCount: { $gt: 0 },
                  lockTime: { $lt: new Date('2050/1/1') }
                }
              },
              { $group: { _id: '$mode', count: { $sum: 1 } } }
            ]
          }
        }
      ],
      readFromSecondary
    ),
    MongoDatasetData.countDocuments(match, readFromSecondary)
  ]);

  const trainingCounts = result[0].trainingCounts.reduce(
    (acc: Record<TrainingModeEnum, number>, item: { _id: TrainingModeEnum; count: number }) => {
      acc[item._id] = item.count;
      return acc;
    },
    defaultCounts
  );

  const errorCounts = result[0].errorCounts.reduce(
    (acc: Record<TrainingModeEnum, number>, item: { _id: TrainingModeEnum; count: number }) => {
      acc[item._id] = item.count;
      return acc;
    },
    defaultCounts
  );

  const waitingCounts = result[0].waitingCounts.reduce(
    (acc: Record<TrainingModeEnum, number>, item: { _id: TrainingModeEnum; count: number }) => {
      acc[item._id] = item.count;
      return acc;
    },
    defaultCounts
  );

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

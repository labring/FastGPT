import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import type {
  DatasetCollectionDataProcessModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { type ApiRequestProps } from '@fastgpt/service/type/next';

type getTrainingDetailParams = {
  collectionId: string;
};

export type getTrainingDetailResponse = {
  trainingType: DatasetCollectionDataProcessModeEnum;
  advancedTraining: {
    customPdfParse: boolean;
    imageIndex: boolean;
    autoIndexes: boolean;
  };
  queuedCounts: Record<TrainingModeEnum, number>;
  trainingCounts: Record<TrainingModeEnum, number>;
  errorCounts: Record<TrainingModeEnum, number>;
  trainedCount: number;
};

const defaultCounts: Record<TrainingModeEnum, number> = {
  parse: 0,
  qa: 0,
  chunk: 0,
  image: 0,
  auto: 0,
  imageParse: 0
};

async function handler(
  req: ApiRequestProps<{}, getTrainingDetailParams>
): Promise<getTrainingDetailResponse> {
  const { collectionId } = req.query;

  const { collection } = await authDatasetCollection({
    req,
    collectionId,
    per: ReadPermissionVal,
    authToken: true,
    authApiKey: true
  });

  const match = {
    teamId: collection.teamId,
    datasetId: collection.datasetId,
    collectionId: collection._id
  };

  // Computed global queue
  const minId = (
    await MongoDatasetTraining.findOne(
      {
        teamId: collection.teamId,
        datasetId: collection.datasetId,
        collectionId: collection._id
      },
      { sort: { _id: 1 }, select: '_id' },
      readFromSecondary
    ).lean()
  )?._id;

  const [ququedCountData, trainingCountData, errorCountData, trainedCount] = (await Promise.all([
    minId
      ? MongoDatasetTraining.aggregate(
          [
            {
              $match: {
                _id: { $lt: minId },
                retryCount: { $gt: 0 },
                lockTime: { $lt: new Date('2050/1/1') }
              }
            },
            {
              $group: {
                _id: '$mode',
                count: { $sum: 1 }
              }
            }
          ],
          readFromSecondary
        )
      : Promise.resolve([]),
    MongoDatasetTraining.aggregate(
      [
        {
          $match: {
            ...match,
            retryCount: { $gt: 0 },
            lockTime: { $lt: new Date('2050/1/1') }
          }
        },
        {
          $group: {
            _id: '$mode',
            count: { $sum: 1 }
          }
        }
      ],
      readFromSecondary
    ),
    MongoDatasetTraining.aggregate(
      [
        {
          $match: {
            ...match,
            retryCount: { $lte: 0 },
            errorMsg: { $exists: true }
          }
        },
        {
          $group: {
            _id: '$mode',
            count: { $sum: 1 }
          }
        }
      ],
      readFromSecondary
    ),
    MongoDatasetData.countDocuments(match, readFromSecondary)
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

  return {
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
  };
}

export default NextAPI(handler);

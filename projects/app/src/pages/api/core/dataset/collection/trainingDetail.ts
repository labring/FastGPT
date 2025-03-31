import { NextApiRequest } from 'next';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  DatasetCollectionDataProcessModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';

type getTrainingCountsAggregationParams = {
  collectionId: string;
};

type IndexCounts = {
  default: number;
  image: number;
  auto: number;
};

type TrainingCounts = Record<TrainingModeEnum, number>;

export type TrainingErrorItem = {
  data: DatasetTrainingSchemaType[];
  total: number;
};

export type DatasetCollectionTrainingDetailType = {
  trainingType: DatasetCollectionDataProcessModeEnum;
  advancedTraining: {
    customPdfParse: boolean;
    imageIndex: boolean;
    autoIndexes: boolean;
  };
  indexesCounts: IndexCounts;
  trainingCounts: TrainingCounts;
  trainingWaitingCounts: TrainingCounts;
  errorList?: TrainingErrorItem;
};

const defaultTrainingCounts: TrainingCounts = {
  qa: 0,
  chunk: 0,
  image: 0,
  auto: 0
};

const getTrainingCountsAggregation = (match: Record<string, string>, expireAt?: Date) => {
  const matchStage = {
    ...match,
    ...(expireAt && { expireAt: { $lt: expireAt } })
  };

  return [
    { $match: matchStage },
    {
      $group: {
        _id: null,
        qa: { $sum: { $cond: [{ $eq: ['$mode', TrainingModeEnum.qa] }, 1, 0] } },
        chunk: { $sum: { $cond: [{ $eq: ['$mode', TrainingModeEnum.chunk] }, 1, 0] } },
        image: { $sum: { $cond: [{ $eq: ['$mode', TrainingModeEnum.image] }, 1, 0] } },
        auto: { $sum: { $cond: [{ $eq: ['$mode', TrainingModeEnum.auto] }, 1, 0] } }
      }
    }
  ];
};

async function handler(req: NextApiRequest) {
  const { collectionId } = req.query as getTrainingCountsAggregationParams;

  if (!collectionId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

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

  // 获取最小过期时间
  const [minExpireAtResult] = await MongoDatasetTraining.aggregate(
    [
      {
        $match: match
      },
      {
        $group: {
          _id: null,
          minExpireAt: { $min: '$expireAt' }
        }
      }
    ],
    readFromSecondary
  );

  const minExpireAt = minExpireAtResult?.minExpireAt || new Date();

  const [trainingCounts, errorItems, errorTotal, indexesCounts, trainingWaitingCounts] =
    await Promise.all([
      // 获取训练计数
      MongoDatasetTraining.aggregate(getTrainingCountsAggregation(match), readFromSecondary),
      // 获取错误项
      MongoDatasetTraining.find(
        {
          collectionId,
          errorMsg: { $exists: true },
          retryCount: { $lte: 0 }
        },
        { mode: 1, chunkIndex: 1, errorMsg: 1 },
        { ...readFromSecondary, limit: 30 }
      ).lean(),
      // 获取错误总数
      MongoDatasetTraining.countDocuments(
        {
          collectionId,
          errorMsg: { $exists: true },
          retryCount: { $lte: 0 }
        },
        readFromSecondary
      ),
      // 获取索引计数
      MongoDatasetData.aggregate(
        [
          { $match: match },
          { $unwind: '$indexes' },
          {
            $group: {
              _id: null,
              default: {
                $sum: {
                  $cond: [{ $eq: ['$indexes.type', DatasetDataIndexTypeEnum.default] }, 1, 0]
                }
              },
              image: {
                $sum: { $cond: [{ $eq: ['$indexes.type', DatasetDataIndexTypeEnum.image] }, 1, 0] }
              },
              auto: {
                $sum: {
                  $cond: [
                    {
                      $not: [
                        {
                          $in: [
                            '$indexes.type',
                            [DatasetDataIndexTypeEnum.default, DatasetDataIndexTypeEnum.image]
                          ]
                        }
                      ]
                    },
                    1,
                    0
                  ]
                }
              }
            }
          }
        ],
        readFromSecondary
      ),
      // 获取等待训练计数
      MongoDatasetTraining.aggregate(
        getTrainingCountsAggregation(match, minExpireAt),
        readFromSecondary
      )
    ]);

  return {
    trainingType: collection.trainingType,
    advancedTraining: {
      customPdfParse: collection.customPdfParse,
      imageIndex: collection.imageIndex,
      autoIndexes: collection.autoIndexes
    },
    indexesCounts: indexesCounts[0] || { default: 0, image: 0, auto: 0 },
    trainingCounts: trainingCounts[0] || defaultTrainingCounts,
    trainingWaitingCounts: trainingWaitingCounts[0] || defaultTrainingCounts,
    errorList: { data: errorItems, total: errorTotal }
  };
}

export default NextAPI(handler);

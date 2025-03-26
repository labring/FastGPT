import { NextApiRequest } from 'next';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  DatasetCollectionDataProcessModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { NextAPI } from '@/service/middleware/entry';
import { Types } from 'mongoose';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  DatasetDataSchemaType,
  DatasetTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';

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

const getErrorQuery = (collectionId: string) => ({
  collectionId: new Types.ObjectId(collectionId),
  errorMsg: { $exists: true, $ne: '' },
  retryCount: { $lt: 0 }
});

const getIndexCounts = (data: DatasetDataSchemaType[]): IndexCounts =>
  data.reduce(
    (acc, { indexes }) => {
      if (!Array.isArray(indexes)) return acc;

      indexes.forEach(({ type }) => {
        switch (type) {
          case DatasetDataIndexTypeEnum.default:
            acc.default++;
            break;
          case DatasetDataIndexTypeEnum.image:
            acc.image++;
            break;
          default:
            acc.auto++;
        }
      });
      return acc;
    },
    { default: 0, image: 0, auto: 0 }
  );

const getTrainingCountsAggregation = (collectionId: string, expireAt?: Date) => {
  const matchStage = {
    collectionId: new Types.ObjectId(collectionId),
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
  const { collectionId } = req.query;

  if (!collectionId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { collection } = await authDatasetCollection({
    req,
    authToken: true,
    collectionId: collectionId as string,
    per: ReadPermissionVal
  });

  // 获取最小过期时间
  const [minExpireAtResult] = await MongoDatasetTraining.aggregate(
    [
      {
        $match: { collectionId: new Types.ObjectId(collectionId as string) }
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

  // 并行执行所有查询
  const [trainingCounts, errorItems, errorTotal, allData, trainingWaitingCounts] =
    await Promise.all([
      // 获取训练计数
      MongoDatasetTraining.aggregate(
        getTrainingCountsAggregation(collectionId as string),
        readFromSecondary
      ),
      // 获取错误项
      MongoDatasetTraining.find(
        getErrorQuery(collectionId as string),
        { mode: 1, chunkIndex: 1, errorMsg: 1 },
        { ...readFromSecondary, limit: 30 }
      ).lean(),
      // 获取错误总数
      MongoDatasetTraining.countDocuments(getErrorQuery(collectionId as string), readFromSecondary),
      // 获取所有数据
      MongoDatasetData.find({
        teamId: collection.teamId,
        datasetId: collection.datasetId,
        collectionId: collection._id
      }),
      // 获取等待训练计数
      MongoDatasetTraining.aggregate(
        getTrainingCountsAggregation(collectionId as string, minExpireAt),
        readFromSecondary
      )
    ]);

  const indexesCounts = getIndexCounts(allData);

  return {
    trainingType: collection.trainingType,
    advancedTraining: {
      customPdfParse: collection.customPdfParse,
      imageIndex: collection.imageIndex,
      autoIndexes: collection.autoIndexes
    },
    indexesCounts,
    trainingCounts: trainingCounts[0] || defaultTrainingCounts,
    trainingWaitingCounts: trainingWaitingCounts[0] || defaultTrainingCounts,
    errorList: { data: errorItems, total: errorTotal }
  };
}

export default NextAPI(handler);

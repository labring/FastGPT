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
import { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';

const ERROR_QUERY_LIMIT = 30;

type IndexCounts = {
  default: number;
  image: number;
  auto: number;
};

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
  trainingCounts: Record<TrainingModeEnum, number>;
  errorList?: TrainingErrorItem;
};

const getErrorQuery = (collectionId: string) => ({
  collectionId: new Types.ObjectId(collectionId),
  errorMsg: { $exists: true, $ne: '' },
  retryCount: { $lt: 0 }
});

const getIndexCounts = (data: any[]): IndexCounts =>
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

  const [modeStats, errorItems, errorTotal, allData] = await Promise.all([
    MongoDatasetTraining.aggregate(
      [
        {
          $match: { collectionId: new Types.ObjectId(collectionId as string) }
        },
        {
          $group: {
            _id: '$mode',
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            mode: '$_id',
            count: 1,
            _id: 0
          }
        }
      ],
      readFromSecondary
    ),
    MongoDatasetTraining.find(
      getErrorQuery(collectionId as string),
      { mode: 1, chunkIndex: 1, errorMsg: 1 },
      { ...readFromSecondary, limit: ERROR_QUERY_LIMIT }
    ).lean(),
    MongoDatasetTraining.countDocuments(getErrorQuery(collectionId as string), readFromSecondary),
    MongoDatasetData.find({
      teamId: collection.teamId,
      datasetId: collection.datasetId,
      collectionId: collection._id
    })
  ]);

  const indexesCounts = getIndexCounts(allData);
  const trainingCounts = Object.values(TrainingModeEnum).reduce(
    (acc, mode) => ({
      ...acc,
      [mode]: modeStats.find((stat) => stat.mode === mode)?.count || 0
    }),
    {} as Record<TrainingModeEnum, number>
  );

  return {
    trainingType: collection.trainingType,
    advancedTraining: {
      customPdfParse: collection.customPdfParse,
      imageIndex: collection.imageIndex,
      autoIndexes: collection.autoIndexes
    },
    indexesCounts,
    trainingCounts,
    errorList: { data: errorItems, total: errorTotal }
  };
}

export default NextAPI(handler);

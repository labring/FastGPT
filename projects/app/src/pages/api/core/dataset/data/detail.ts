import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { Types } from 'mongoose';
import {
  DatasetTrainingStatusEnum,
  type DatasetTrainingStatusType
} from '@fastgpt/global/core/dataset/constants';

export type Response = {
  id: string;
  q: string;
  a: string;
  imageId?: string;
  source: string;
  metadata?: Record<string, any>;
  trainingStatus?: DatasetTrainingStatusType;
};

async function handler(
  req: ApiRequestProps<
    {},
    {
      id: string;
    }
  >
) {
  const { id: dataId } = req.query;

  const { datasetData } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: ReadPermissionVal
  });

  // 查询训练队列，推导 trainingStatus
  const trainingRecord = await MongoDatasetTraining.findOne(
    { dataId: new Types.ObjectId(dataId) },
    { retryCount: 1 }
  ).lean();

  let trainingStatus: DatasetTrainingStatusType = DatasetTrainingStatusEnum.ready;
  if (trainingRecord) {
    trainingStatus =
      trainingRecord.retryCount > 0
        ? DatasetTrainingStatusEnum.training
        : DatasetTrainingStatusEnum.error;
  }

  return {
    ...datasetData,
    trainingStatus
  };
}

export default NextAPI(handler);

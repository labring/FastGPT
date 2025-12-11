import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainset } from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { updateTrainData } from '@fastgpt/service/core/train/rerank/data/controller';
import { MongoRerankTrainsetData } from '@fastgpt/service/core/train/rerank/data/schema';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { UpdateRerankTrainDataRequest } from '@fastgpt/global/core/train/rerank/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { dataId, query, positiveDocs, negativeDocs } = req.body as UpdateRerankTrainDataRequest;

  if (!dataId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // Get data
  const data = await MongoRerankTrainsetData.findById(dataId).lean();
  if (!data) {
    return Promise.reject(RerankTrainErrEnum.trainDataNotExist);
  }

  // Authenticate permission via trainset
  await authRerankTrainset({
    req,
    authToken: true,
    trainsetId: String(data.trainsetId),
    per: WritePermissionVal
  });

  // Update
  await updateTrainData({
    dataId,
    query,
    positiveDocs,
    negativeDocs
  });

  return 'success';
}

export default NextAPI(handler);

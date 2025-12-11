import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainset } from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { deleteTrainData } from '@fastgpt/service/core/train/rerank/data/controller';
import { MongoRerankTrainsetData } from '@fastgpt/service/core/train/rerank/data/schema';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { DeleteRerankTrainDataRequest } from '@fastgpt/global/core/train/rerank/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { dataIds } = req.body as DeleteRerankTrainDataRequest;

  if (!dataIds?.length) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // Get first data entry
  const firstData = await MongoRerankTrainsetData.findById(dataIds[0]).lean();
  if (!firstData) {
    return Promise.reject(RerankTrainErrEnum.trainDataNotExist);
  }

  // Authenticate permission via trainset
  await authRerankTrainset({
    req,
    authToken: true,
    trainsetId: String(firstData.trainsetId),
    per: WritePermissionVal
  });

  // Batch delete
  const deletedCount = await deleteTrainData(dataIds);

  return { deletedCount };
}

export default NextAPI(handler);

import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainset } from '@fastgpt/service/support/permission/train/rerank/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import type {
  RerankTrainsetDetailRequest,
  RerankTrainsetDetailResponse
} from '@fastgpt/global/core/train/rerank/api';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RerankTrainsetDetailResponse>
): Promise<RerankTrainsetDetailResponse> {
  const { trainsetId } = req.query as RerankTrainsetDetailRequest;

  if (!trainsetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // Authenticate and get trainset by trainsetId
  const { trainset, app } = await authRerankTrainset({
    req,
    authToken: true,
    trainsetId,
    per: ReadPermissionVal
  });

  return {
    ...trainset,
    app: {
      _id: String(app._id),
      name: app.name,
      avatar: app.avatar
    }
  };
}

export default NextAPI(handler);

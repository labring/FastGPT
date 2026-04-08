import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainset } from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createManualRerankTrainData } from '@fastgpt/service/core/train/rerank/data/controller';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  CreateRerankTrainDataRequest,
  CreateRerankTrainDataResponse
} from '@fastgpt/global/core/train/rerank/api';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateRerankTrainDataResponse>
): Promise<CreateRerankTrainDataResponse> {
  const { trainsetId, query, positiveDocs, negativeDocs, reason } =
    req.body as CreateRerankTrainDataRequest;

  if (!trainsetId || !query || !positiveDocs?.length || !negativeDocs?.length) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { trainset, teamId, tmbId } = await authRerankTrainset({
    req,
    authToken: true,
    authApiKey: true,
    trainsetId,
    per: WritePermissionVal
  });

  const data = await createManualRerankTrainData({
    trainsetId: String(trainset._id),
    teamId,
    tmbId,
    query,
    positiveDocs,
    negativeDocs,
    reason
  });

  return data;
}

export default NextAPI(handler);

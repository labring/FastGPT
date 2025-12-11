import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainset } from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createManualTrainData } from '@fastgpt/service/core/train/rerank/data/controller';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { CreateRerankTrainDataRequest } from '@fastgpt/global/core/train/rerank/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { trainsetId, query, positiveDocs, negativeDocs, reason } =
    req.body as CreateRerankTrainDataRequest;

  if (!trainsetId || !query || !positiveDocs?.length || !negativeDocs?.length) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { trainset, teamId, tmbId } = await authRerankTrainset({
    req,
    authToken: true,
    trainsetId,
    per: WritePermissionVal
  });

  const dataId = await createManualTrainData({
    trainsetId: String(trainset._id),
    appId: String(trainset.appId),
    teamId,
    tmbId,
    query,
    positiveDocs,
    negativeDocs,
    reason
  });

  return dataId;
}

export default NextAPI(handler);

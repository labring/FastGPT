import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authEmbeddingTrainset } from '@fastgpt/service/support/permission/train/embedding/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createManualEmbeddingTrainData } from '@fastgpt/service/core/train/embedding/data/controller';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  CreateEmbeddingTrainDataRequest,
  CreateEmbeddingTrainDataResponse
} from '@fastgpt/global/core/train/embedding/api';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateEmbeddingTrainDataResponse>
): Promise<CreateEmbeddingTrainDataResponse> {
  const { trainsetId, query, positiveDocs, negativeDocs, reason } =
    req.body as CreateEmbeddingTrainDataRequest;

  if (!trainsetId || !query || !positiveDocs?.length || !negativeDocs?.length) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { trainset, teamId, tmbId } = await authEmbeddingTrainset({
    req,
    authToken: true,
    authApiKey: true,
    trainsetId,
    per: WritePermissionVal
  });

  const data = await createManualEmbeddingTrainData({
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

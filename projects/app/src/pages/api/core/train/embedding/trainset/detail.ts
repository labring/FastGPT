import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authEmbeddingTrainset } from '@fastgpt/service/support/permission/train/embedding/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type {
  EmbeddingTrainsetDetailRequest,
  EmbeddingTrainsetDetailResponse
} from '@fastgpt/global/core/train/embedding/api';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EmbeddingTrainsetDetailResponse>
): Promise<EmbeddingTrainsetDetailResponse> {
  const { trainsetId } = req.query as EmbeddingTrainsetDetailRequest;

  if (!trainsetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // Authenticate and get trainset by trainsetId
  const { trainset } = await authEmbeddingTrainset({
    req,
    authToken: true,
    authApiKey: true,
    trainsetId,
    per: ReadPermissionVal
  });

  return trainset;
}

export default NextAPI(handler);

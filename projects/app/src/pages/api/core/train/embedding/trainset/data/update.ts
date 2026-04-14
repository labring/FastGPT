import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authEmbeddingTrainset } from '@fastgpt/service/support/permission/train/embedding/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { updateEmbeddingTrainData } from '@fastgpt/service/core/train/embedding/data/controller';
import { MongoEmbeddingTrainsetData } from '@fastgpt/service/core/train/embedding/data/schema';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { UpdateEmbeddingTrainDataRequest } from '@fastgpt/global/core/train/embedding/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { dataId, query, positiveDocs, negativeDocs } = req.body as UpdateEmbeddingTrainDataRequest;

  if (!dataId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // Get data
  const data = await MongoEmbeddingTrainsetData.findById(dataId).lean();
  if (!data) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTrainDataNotExist);
  }

  // Authenticate permission via trainset
  await authEmbeddingTrainset({
    req,
    authToken: true,
    authApiKey: true,
    trainsetId: String(data.trainsetId),
    per: WritePermissionVal
  });

  // Update
  await updateEmbeddingTrainData({
    dataId,
    query,
    positiveDocs,
    negativeDocs
  });

  return 'success';
}

export default NextAPI(handler);

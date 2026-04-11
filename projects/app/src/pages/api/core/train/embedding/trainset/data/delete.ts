import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authEmbeddingTrainset } from '@fastgpt/service/support/permission/train/embedding/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { deleteEmbeddingTrainData } from '@fastgpt/service/core/train/embedding/data/controller';
import { MongoEmbeddingTrainsetData } from '@fastgpt/service/core/train/embedding/data/schema';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { DeleteEmbeddingTrainDataRequest } from '@fastgpt/global/core/train/embedding/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { dataIds } = req.body as DeleteEmbeddingTrainDataRequest;

  if (!dataIds?.length) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // Get first data entry
  const firstData = await MongoEmbeddingTrainsetData.findById(dataIds[0]).lean();
  if (!firstData) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTrainDataNotExist);
  }

  // Authenticate permission via trainset
  await authEmbeddingTrainset({
    req,
    authToken: true,
    authApiKey: true,
    trainsetId: String(firstData.trainsetId),
    per: WritePermissionVal
  });

  // Batch delete
  const deletedCount = await deleteEmbeddingTrainData(dataIds);

  return { deletedCount };
}

export default NextAPI(handler);

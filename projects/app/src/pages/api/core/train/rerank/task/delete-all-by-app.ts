import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { deleteAllRerankTrainTasksByApp } from '@fastgpt/service/core/train/rerank/task/controller';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  DeleteAllRerankTrainTasksByAppRequest,
  DeleteAllRerankTrainTasksByAppResponse
} from '@fastgpt/global/core/train/rerank/api';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<DeleteAllRerankTrainTasksByAppResponse> {
  const { appId } = req.query as DeleteAllRerankTrainTasksByAppRequest;

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // Verify user permission for the app
  await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  // Use optimized batch deletion function
  const result = await deleteAllRerankTrainTasksByApp(appId);

  return {
    success: true,
    ...result
  };
}

export default NextAPI(handler);

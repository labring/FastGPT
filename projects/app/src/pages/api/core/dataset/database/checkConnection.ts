import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { checkDatabaseConnection } from '@fastgpt/service/core/dataset/database/clientManager';
import type { DatabaseConfig } from '@fastgpt/global/core/dataset/type';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { CheckConnectionBody } from '@fastgpt/global/core/dataset/database/api';

async function handler(req: ApiRequestProps<CheckConnectionBody, {}>): Promise<boolean> {
  const { datasetId, databaseConfig } = req.body;

  // 权限验证（如果提供了datasetId）
  if (!datasetId) {
    return Promise.reject(`${CommonErrEnum.missingParams}:Missing Params datasetId'`);
  }
  await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });
  return await checkDatabaseConnection(databaseConfig);
}

export default NextAPI(handler);

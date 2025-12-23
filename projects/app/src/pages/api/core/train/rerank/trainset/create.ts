import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/controller';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  CreateRerankTrainsetRequest,
  CreateRerankTrainsetResponse
} from '@fastgpt/global/core/train/rerank/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateRerankTrainsetResponse>
): Promise<CreateRerankTrainsetResponse> {
  const { appId, name, description } = req.body as CreateRerankTrainsetRequest;

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 1. Authenticate app write permission
  const { app, teamId, tmbId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  // 2. Create app trainset (supports 1:N relationship)
  const trainsetId = await createRerankTrainset({
    appId,
    teamId,
    tmbId,
    name,
    description
  });

  // 3. Get complete trainset object
  const trainset = await MongoRerankTrainset.findById(trainsetId).lean();
  if (!trainset) {
    return Promise.reject(RerankTrainErrEnum.trainsetNotExist);
  }

  // 4. Audit log
  const trainsetName = name || `${app.name} - Training Set`;
  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.CREATE_RERANK_TRAINSET,
    params: { appName: app.name, trainsetName }
  });

  return trainset;
}

export default NextAPI(handler);

import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/controller';
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
  const { name, description } = req.body as CreateRerankTrainsetRequest;

  // 1. Authenticate user permission
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });

  // 2. Create trainset
  const trainset = await createRerankTrainset({
    teamId,
    tmbId,
    name,
    description
  });

  // 3. Audit log
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_RERANK_TRAINSET,
      params: { trainsetName: trainset.name || String(trainset._id) }
    });
  })();

  return trainset;
}

export default NextAPI(handler);

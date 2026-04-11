import type { NextApiRequest, NextApiResponse } from 'next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { cancelRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/controller';
import { authRerankTrainTask } from '@fastgpt/service/support/permission/train/rerank/auth';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { CancelRerankTrainTaskRequest } from '@fastgpt/global/core/train/rerank/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { taskId } = req.body as CancelRerankTrainTaskRequest;

  if (!taskId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { task, teamId, tmbId } = await authRerankTrainTask({
    req,
    authToken: true,
    authApiKey: true,
    taskId,
    per: WritePermissionVal
  });

  await cancelRerankTrainTask(taskId);

  // Audit log
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CANCEL_RERANK_TRAIN_TASK,
      params: { taskName: task.name || taskId }
    });
  })();

  return { success: true };
}

export default NextAPI(handler);

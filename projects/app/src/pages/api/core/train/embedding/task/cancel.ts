import type { NextApiRequest, NextApiResponse } from 'next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { cancelEmbeddingTrainTask } from '@fastgpt/service/core/train/embedding/task/controller';
import { authEmbeddingTrainTask } from '@fastgpt/service/support/permission/train/embedding/auth';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { CancelEmbeddingTrainTaskRequest } from '@fastgpt/global/core/train/embedding/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { taskId } = req.body as CancelEmbeddingTrainTaskRequest;

  if (!taskId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { task, teamId, tmbId } = await authEmbeddingTrainTask({
    req,
    authToken: true,
    authApiKey: true,
    taskId,
    per: WritePermissionVal
  });

  await cancelEmbeddingTrainTask(taskId);

  // Audit log
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CANCEL_EMBEDDING_TRAIN_TASK,
      params: { taskName: task.name || taskId }
    });
  })();

  return { success: true };
}

export default NextAPI(handler);

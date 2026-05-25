import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { deleteRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/controller';
import { authRerankTrainTask } from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { DeleteRerankTrainTaskRequest } from '@fastgpt/global/core/train/rerank/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { taskId, force, deleteModel } = req.query as DeleteRerankTrainTaskRequest;

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

  // Prevent deletion of in-progress tasks unless force=true
  if (
    force !== 'true' &&
    (task.status === RerankTrainTaskStatusEnum.pending ||
      task.status === RerankTrainTaskStatusEnum.running)
  ) {
    return Promise.reject(RerankTrainErrEnum.rerankTaskCannotDelete);
  }

  await deleteRerankTrainTask(taskId, { deleteModel: deleteModel !== 'false' });

  // Audit log
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_RERANK_TRAIN_TASK,
      params: { taskName: task.name || taskId }
    });
  })();

  return { success: true };
}

export default NextAPI(handler);

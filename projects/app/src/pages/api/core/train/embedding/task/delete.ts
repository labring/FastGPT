import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { deleteEmbeddingTrainTask } from '@fastgpt/service/core/train/embedding/task/controller';
import { authEmbeddingTrainTask } from '@fastgpt/service/support/permission/train/embedding/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { EmbeddingTrainTaskStatusEnum } from '@fastgpt/global/core/train/embedding/constants';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { DeleteEmbeddingTrainTaskRequest } from '@fastgpt/global/core/train/embedding/api';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { taskId } = req.query as DeleteEmbeddingTrainTaskRequest;

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

  // Prevent deletion of in-progress tasks
  if (
    task.status === EmbeddingTrainTaskStatusEnum.pending ||
    task.status === EmbeddingTrainTaskStatusEnum.running
  ) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTaskCannotDelete);
  }

  await deleteEmbeddingTrainTask(taskId);

  // Audit log
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_EMBEDDING_TRAIN_TASK,
      params: { taskName: task.name || taskId }
    });
  })();

  return { success: true };
}

export default NextAPI(handler);

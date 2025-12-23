import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainset } from '@fastgpt/service/support/permission/train/rerank/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { deleteRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/controller';
import { MongoRerankTrainsetData } from '@fastgpt/service/core/train/rerank/data/schema';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { DeleteRerankTrainsetRequest } from '@fastgpt/global/core/train/rerank/api';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { trainsetId } = req.query as DeleteRerankTrainsetRequest;

  if (!trainsetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { trainset, app, teamId, tmbId } = await authRerankTrainset({
    req,
    authToken: true,
    trainsetId,
    per: ManagePermissionVal
  });

  // Check if there's a running task
  const runningTask = await MongoRerankTrainTask.findOne({
    appId: trainset.appId,
    status: {
      $in: [RerankTrainTaskStatusEnum.pending, RerankTrainTaskStatusEnum.running]
    }
  }).lean();

  if (runningTask) {
    return Promise.reject(RerankTrainErrEnum.trainsetInUse);
  }

  // Cascade delete
  await mongoSessionRun(async (session) => {
    await MongoRerankTrainsetData.deleteMany({ trainsetId }, { session });
    await deleteRerankTrainset(trainsetId);
  });

  // Audit log
  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.DELETE_RERANK_TRAINSET,
    params: { trainsetName: trainset.name, appName: app.name }
  });

  return 'success';
}

export default NextAPI(handler);

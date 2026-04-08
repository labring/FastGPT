import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authEmbeddingTrainset } from '@fastgpt/service/support/permission/train/embedding/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { deleteEmbeddingTrainset } from '@fastgpt/service/core/train/embedding/trainset/controller';
import { MongoEmbeddingTrainsetData } from '@fastgpt/service/core/train/embedding/data/schema';
import { MongoEmbeddingTrainTask } from '@fastgpt/service/core/train/embedding/task/schema';
import { EmbeddingTrainTaskStatusEnum } from '@fastgpt/global/core/train/embedding/constants';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { DeleteEmbeddingTrainsetRequest } from '@fastgpt/global/core/train/embedding/api';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const { trainsetId } = req.query as DeleteEmbeddingTrainsetRequest;

  if (!trainsetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { trainset, teamId, tmbId } = await authEmbeddingTrainset({
    req,
    authToken: true,
    authApiKey: true,
    trainsetId,
    per: WritePermissionVal
  });

  // Prevent deletion while a training task is using this trainset
  const runningTask = await MongoEmbeddingTrainTask.findOne({
    trainsetId,
    status: {
      $in: [EmbeddingTrainTaskStatusEnum.pending, EmbeddingTrainTaskStatusEnum.running]
    }
  }).lean();

  if (runningTask) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTrainsetInUse);
  }

  // Cascade delete within a transaction to ensure atomicity
  await mongoSessionRun(async (session) => {
    await MongoEmbeddingTrainsetData.deleteMany({ trainsetId }, { session });
    await deleteEmbeddingTrainset(trainsetId, session);
  });

  // Audit log
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_EMBEDDING_TRAINSET,
      params: { trainsetName: trainset.name || trainsetId }
    });
  })();

  return 'success';
}

export default NextAPI(handler);

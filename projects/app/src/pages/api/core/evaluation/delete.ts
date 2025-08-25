import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvaluation } from '@fastgpt/service/core/evaluation/evalSchema';
import { MongoEvalItem } from '@fastgpt/service/core/evaluation/evalItemSchema';
import { authEval } from '@fastgpt/service/support/permission/evaluation/auth';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { removeEvaluationJob } from '@fastgpt/service/core/evaluation/mq';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: ApiRequestProps<{}, { evalId: string }>, res: ApiResponseType<any>) {
  const { evalId } = req.query;

  const { tmbId, teamId, evaluation } = await authEval({
    req,
    per: WritePermissionVal,
    evalId,
    authToken: true,
    authApiKey: true
  });

  await mongoSessionRun(async (session) => {
    await MongoEvaluation.deleteOne(
      {
        _id: evalId
      },
      { session }
    );

    await MongoEvalItem.deleteMany(
      {
        evalId
      },
      { session }
    );

    await removeEvaluationJob(evalId);
  });

  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.DELETE_EVALUATION,
    params: {
      name: evaluation.name
    }
  });

  return {};
}

export default NextAPI(handler);

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authEval } from '@fastgpt/service/support/permission/evaluation/auth';
import { MongoEvalItem } from '@fastgpt/service/core/evaluation/evalItemSchema';
import { checkEvaluationJobActive, addEvaluationJob } from '@fastgpt/service/core/evaluation/mq';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import type { retryEvalItemBody } from '@fastgpt/global/core/evaluation/api';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: ApiRequestProps<retryEvalItemBody, {}>, res: ApiResponseType<any>) {
  const { evalItemId } = req.body;

  const evaluationItem = await MongoEvalItem.findById(evalItemId);
  if (!evaluationItem) return Promise.reject('evaluationItem not found');

  const { teamId, evaluation } = await authEval({
    req,
    per: WritePermissionVal,
    evalId: evaluationItem.evalId,
    authToken: true,
    authApiKey: true
  });

  await checkTeamAIPoints(teamId);

  await MongoEvalItem.updateOne(
    { _id: evalItemId },
    {
      $set: {
        status: EvaluationStatusEnum.queuing,
        errorMessage: null,
        response: null,
        accuracy: null,
        relevance: null,
        semanticAccuracy: null,
        score: null,
        retry: 3
      }
    }
  );
  await addEvaluationJob({ evalId: evaluation._id });
}

export default NextAPI(handler);

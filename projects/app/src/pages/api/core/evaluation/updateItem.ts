import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authEval } from '@fastgpt/service/support/permission/evaluation/auth';
import { MongoEvalItem } from '@fastgpt/service/core/evaluation/evalItemSchema';
import { addEvaluationJob } from '@fastgpt/service/core/evaluation/mq';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import type { updateEvalItemBody } from '@fastgpt/global/core/evaluation/api';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';

async function handler(req: ApiRequestProps<updateEvalItemBody, {}>, res: ApiResponseType<any>) {
  const { evalItemId, question, expectedResponse, variables } = req.body;

  const evaluationItem = await MongoEvalItem.findById(evalItemId);
  if (!evaluationItem) return Promise.reject('evaluationItem not found');

  const { teamId, evaluation } = await authEval({
    req,
    evalId: evaluationItem.evalId,
    authToken: true,
    authApiKey: true
  });
  await checkTeamAIPoints(teamId);

  await MongoEvalItem.updateOne(
    { _id: evalItemId },
    {
      $set: {
        question,
        expectedResponse,
        status: EvaluationStatusEnum.queuing,
        errorMessage: null,
        response: null,
        accuracy: null,
        relevance: null,
        semanticAccuracy: null,
        score: null,
        retry: 3,
        globalVariables: variables
      }
    }
  );

  await addEvaluationJob({ evalId: evaluation._id });
}

export default NextAPI(handler);

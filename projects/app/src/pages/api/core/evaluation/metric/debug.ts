import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import type { EvaluationRequest } from '@fastgpt/global/core/evaluation/metric/type';
import { NextAPI } from '@/service/middleware/entry';
import { createDitingClient } from '@fastgpt/service/core/evaluation/evaluator/ditingClient';
import type { DebugMetricBody } from '@fastgpt/global/core/evaluation/metric/api';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';

async function handler(req: ApiRequestProps<DebugMetricBody, {}>, res: ApiResponseType<any>) {
  const { evalCase, llmConfig, metricConfig } = req.body;

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  // Check AI points availability
  await checkTeamAIPoints(teamId);

  if (!evalCase?.userInput) {
    return Promise.reject('UserInput is required');
  }
  if (!evalCase?.actualOutput) {
    return Promise.reject('ActualOutput is required');
  }
  if (!evalCase?.expectedOutput) {
    return Promise.reject('ExpectedOutput is required');
  }
  if (!metricConfig?.prompt) {
    return Promise.reject('Prompt is required');
  }
  if (!llmConfig?.name) {
    return Promise.reject('LLM model name is required');
  }

  const ditingClient = createDitingClient();

  const evaluationRequest: EvaluationRequest = {
    evalCase,
    metricConfig,
    llmConfig
  };
  try {
    const result = await ditingClient.runEvaluation(evaluationRequest);
    return {
      score: result.data?.score,
      reason: result.data?.reason,
      usages: result.usages
    };
  } catch (err: any) {
    return Promise.reject(err?.message || 'Evaluation failed');
  }
}

export default NextAPI(handler);

export { handler };

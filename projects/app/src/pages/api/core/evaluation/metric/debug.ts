import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import type { DebugMetricBody } from '@fastgpt/global/core/evaluation/metric/api';
import { NextAPI } from '@/service/middleware/entry';
import { DitingEvaluator } from '@fastgpt/service/core/evaluation/evaluator';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamEvaluationCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { createEvaluationMetricDebugUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import {
  EvalMetricTypeValues,
  MetricResultStatusEnum
} from '@fastgpt/global/core/evaluation/metric/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { addLog } from '@fastgpt/service/common/system/log';
import {
  MAX_USER_INPUT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_OUTPUT_LENGTH,
  MAX_PROMPT_LENGTH
} from '@fastgpt/global/core/evaluation/constants';

async function handler(req: ApiRequestProps<DebugMetricBody, {}>, res: ApiResponseType<any>) {
  const { evalCase, llmConfig, metricConfig } = req.body;

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: TeamEvaluationCreatePermissionVal
  });

  if (!evalCase) {
    return Promise.reject(EvaluationErrEnum.evalCaseRequired);
  }

  if (
    !evalCase.userInput ||
    typeof evalCase.userInput !== 'string' ||
    evalCase.userInput.trim().length === 0
  ) {
    return Promise.reject(EvaluationErrEnum.evalCaseUserInputRequired);
  }

  if (evalCase.userInput.trim().length > MAX_USER_INPUT_LENGTH) {
    return Promise.reject(EvaluationErrEnum.evalCaseUserInputTooLong);
  }

  if (
    !evalCase.actualOutput ||
    typeof evalCase.actualOutput !== 'string' ||
    evalCase.actualOutput.trim().length === 0
  ) {
    return Promise.reject(EvaluationErrEnum.evalCaseActualOutputRequired);
  }

  if (evalCase.actualOutput.trim().length > MAX_OUTPUT_LENGTH) {
    return Promise.reject(EvaluationErrEnum.evalCaseActualOutputTooLong);
  }

  if (
    !evalCase.expectedOutput ||
    typeof evalCase.expectedOutput !== 'string' ||
    evalCase.expectedOutput.trim().length === 0
  ) {
    return Promise.reject(EvaluationErrEnum.evalCaseExpectedOutputRequired);
  }

  if (evalCase.expectedOutput.trim().length > MAX_OUTPUT_LENGTH) {
    return Promise.reject(EvaluationErrEnum.evalCaseExpectedOutputTooLong);
  }

  if (!metricConfig) {
    return Promise.reject(EvaluationErrEnum.evalCaseRequired);
  }

  if (
    !metricConfig.metricName ||
    typeof metricConfig.metricName !== 'string' ||
    metricConfig.metricName.trim().length === 0
  ) {
    return Promise.reject(EvaluationErrEnum.evalMetricNameRequired);
  }

  if (metricConfig.metricName.trim().length > MAX_NAME_LENGTH) {
    return Promise.reject(EvaluationErrEnum.evalMetricNameTooLong);
  }

  if (!metricConfig.metricType) {
    return Promise.reject(EvaluationErrEnum.evalMetricTypeRequired);
  }

  if (!EvalMetricTypeValues.includes(metricConfig.metricType)) {
    return Promise.reject(EvaluationErrEnum.evalMetricTypeInvalid);
  }

  if (
    !metricConfig.prompt ||
    typeof metricConfig.prompt !== 'string' ||
    metricConfig.prompt.trim().length === 0
  ) {
    return Promise.reject(EvaluationErrEnum.evalMetricPromptRequired);
  }

  if (metricConfig.prompt.trim().length > MAX_PROMPT_LENGTH) {
    return Promise.reject(EvaluationErrEnum.evalMetricPromptTooLong);
  }

  if (!llmConfig) {
    return Promise.reject(EvaluationErrEnum.evalLLmConfigRequired);
  }

  if (!llmConfig.name || typeof llmConfig.name !== 'string' || llmConfig.name.trim().length === 0) {
    return Promise.reject(EvaluationErrEnum.evalLLmModelNameRequired);
  }

  await checkTeamAIPoints(teamId);

  const ditingEvaluator = new DitingEvaluator(
    {
      metricName: metricConfig.metricName,
      metricType: metricConfig.metricType,
      prompt: metricConfig.prompt
    },
    llmConfig
  );

  try {
    const result = await ditingEvaluator.evaluate(evalCase);

    // Always create usage record for token consumption (even for failed evaluations)
    if (result.totalPoints && result.totalPoints > 0) {
      await createEvaluationMetricDebugUsage({
        teamId,
        tmbId,
        metricName: metricConfig.metricName,
        totalPoints: result.totalPoints,
        model: llmConfig.name,
        inputTokens: result.usages?.reduce((sum, u) => sum + (u.promptTokens || 0), 0) || 0,
        outputTokens: result.usages?.reduce((sum, u) => sum + (u.completionTokens || 0), 0) || 0
      });
    }

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.DEBUG_EVALUATION_METRIC,
        params: {
          metricName: metricConfig.metricName
        }
      });
    })();

    // Check if diting evaluation was successful based on status
    if (result.status !== MetricResultStatusEnum.Success) {
      addLog.error('[Evaluation Debug] Diting evaluation failed', {
        metricName: metricConfig.metricName,
        status: result.status,
        error: result.error,
        totalPoints: result.totalPoints
      });
      return Promise.reject(result.error);
    }

    return {
      score: result.data?.score,
      reason: result.data?.reason,
      usages: result.usages,
      totalPoints: result.totalPoints
    };
  } catch (err: any) {
    const evaluatorErrorCodes = [
      EvaluationErrEnum.evaluatorConfigRequired,
      EvaluationErrEnum.evaluatorLLmConfigMissing,
      EvaluationErrEnum.evaluatorEmbeddingConfigMissing,
      EvaluationErrEnum.evaluatorLLmModelNotFound,
      EvaluationErrEnum.evaluatorEmbeddingModelNotFound,
      EvaluationErrEnum.evaluatorRequestTimeout,
      EvaluationErrEnum.evaluatorServiceUnavailable,
      EvaluationErrEnum.evaluatorInvalidResponse,
      EvaluationErrEnum.evaluatorNetworkError
    ];

    if (evaluatorErrorCodes.includes(err.message)) {
      return Promise.reject(err.message);
    }

    return Promise.reject(EvaluationErrEnum.debugEvaluationFailed);
  }
}

export default NextAPI(handler);

export { handler };

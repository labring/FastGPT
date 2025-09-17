import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type { EvalTarget } from '@fastgpt/global/core/evaluation/type';
import { ValidationResultUtils } from '@fastgpt/global/core/evaluation/validate';
import type {
  CreateEvaluationRequest,
  CreateEvaluationResponse
} from '@fastgpt/global/core/evaluation/api';
import { validateEvaluationParamsForCreate } from '@fastgpt/service/core/evaluation/utils';
import { authEvaluationTaskCreate } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import {
  checkTeamEvaluationTaskLimit,
  checkTeamAIPoints
} from '@fastgpt/service/support/permission/teamLimit';

async function handler(
  req: ApiRequestProps<CreateEvaluationRequest>
): Promise<CreateEvaluationResponse> {
  const { name, description, evalDatasetCollectionId, target, evaluators, autoStart } = req.body;

  // First perform auth to get teamId
  const { teamId, tmbId } = await authEvaluationTaskCreate(target as EvalTarget, {
    req,
    authApiKey: true,
    authToken: true
  });

  // Now validate all evaluation parameters with teamId (includes target and evalDatasetCollection validation)
  const paramValidation = await validateEvaluationParamsForCreate(
    {
      name,
      description,
      evalDatasetCollectionId,
      target,
      evaluators
    },
    teamId
  );
  if (!paramValidation.isValid) {
    throw ValidationResultUtils.toError(paramValidation);
  }

  // Check evaluation task limit
  await checkTeamEvaluationTaskLimit(teamId);

  // Check AI points availability
  await checkTeamAIPoints(teamId);

  const evaluation = await EvaluationTaskService.createEvaluation({
    name: name.trim(),
    description: description?.trim(),
    evalDatasetCollectionId,
    target: target as EvalTarget,
    evaluators,
    autoStart,
    teamId,
    tmbId
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_EVALUATION_TASK,
      params: {
        taskName: evaluation.name,
        evalDatasetCollectionId,
        targetType: evaluation.target.type,
        evaluatorCount: evaluation.evaluators.length
      }
    });
  })();

  return evaluation;
}

export default NextAPI(handler);
export { handler };

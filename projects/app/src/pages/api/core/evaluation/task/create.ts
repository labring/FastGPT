import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type { EvalTarget } from '@fastgpt/global/core/evaluation/type';
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
  try {
    const { name, description, datasetId, target, evaluators } = req.body;

    // Validate all evaluation parameters (includes target validation)
    const paramValidation = await validateEvaluationParamsForCreate({
      name,
      description,
      datasetId,
      target,
      evaluators
    });
    if (!paramValidation.success) {
      return Promise.reject(paramValidation.message);
    }

    const { teamId, tmbId } = await authEvaluationTaskCreate(target as EvalTarget, {
      req,
      authApiKey: true,
      authToken: true
    });

    // Check evaluation task limit
    await checkTeamEvaluationTaskLimit(teamId);

    // Check AI points availability
    await checkTeamAIPoints(teamId);

    const evaluation = await EvaluationTaskService.createEvaluation({
      name: name.trim(),
      description: description?.trim(),
      datasetId,
      target: target as EvalTarget,
      evaluators,
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
          datasetId,
          targetType: evaluation.target.type,
          evaluatorCount: evaluation.evaluators.length
        }
      });
    })();

    return evaluation;
  } catch (error) {
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };

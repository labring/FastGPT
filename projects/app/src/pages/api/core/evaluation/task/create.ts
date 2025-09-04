import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type { EvalTarget } from '@fastgpt/global/core/evaluation/type';
import type {
  CreateEvaluationRequest,
  CreateEvaluationResponse
} from '@fastgpt/global/core/evaluation/api';
import { validateTargetConfig } from '@fastgpt/service/core/evaluation/target';
import { validateEvaluationParams } from '@fastgpt/global/core/evaluation/utils';
import { authEvaluationTaskCreate } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(
  req: ApiRequestProps<CreateEvaluationRequest>
): Promise<CreateEvaluationResponse> {
  try {
    const { name, description, datasetId, target, evaluators } = req.body;

    // Validate name and description
    const paramValidation = validateEvaluationParams(
      { name, description },
      { namePrefix: 'Evaluation' }
    );
    if (!paramValidation.success) {
      return Promise.reject(paramValidation.message);
    }

    const targetValidation = await validateTargetConfig(target as EvalTarget);
    if (!targetValidation.success) {
      return Promise.reject(`Target validation failed: ${targetValidation.message}`);
    }

    if (!datasetId) {
      return Promise.reject('Dataset ID is required');
    }

    if (!evaluators || !Array.isArray(evaluators) || evaluators.length === 0) {
      return Promise.reject('At least one evaluator is required');
    }

    // Validate evaluators configuration
    for (const evaluator of evaluators) {
      if (!evaluator.metric || !evaluator.metric._id || !evaluator.metric.type) {
        return Promise.reject('Each evaluator must contain a valid metric configuration');
      }
    }

    const { teamId, tmbId } = await authEvaluationTaskCreate(target as EvalTarget, {
      req,
      authApiKey: true,
      authToken: true
    });

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
          targetType: target.type,
          evaluatorCount: evaluators.length
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

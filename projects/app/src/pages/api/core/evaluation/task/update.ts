import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  UpdateEvaluationResponse,
  UpdateEvaluationRequest
} from '@fastgpt/global/core/evaluation/api';
import { validateEvaluationParamsForUpdate } from '@fastgpt/service/core/evaluation/utils';
import { authEvaluationTaskWrite } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(
  req: ApiRequestProps<UpdateEvaluationRequest>
): Promise<UpdateEvaluationResponse> {
  const { evalId, name, description, datasetId, target, evaluators } = req.body;

  if (!evalId) {
    throw new Error(EvaluationErrEnum.evalIdRequired);
  }

  // Validate all evaluation parameters with common validation utility
  const paramValidation = await validateEvaluationParamsForUpdate({
    name,
    description,
    datasetId,
    target,
    evaluators
  });
  if (!paramValidation.success) {
    throw new Error(paramValidation.message);
  }

  const { teamId, tmbId, evaluation } = await authEvaluationTaskWrite(evalId, {
    req,
    authApiKey: true,
    authToken: true
  });

  const taskName = name?.trim() || evaluation.name;

  await EvaluationTaskService.updateEvaluation(
    evalId,
    {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() })
      // runing config not support modify
      // ...(datasetId !== undefined && { datasetId }),
      // ...(target !== undefined && { target }),
      // ...(evaluators !== undefined && { evaluators })
    },
    teamId
  );

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_EVALUATION_TASK,
      params: {
        taskName
      }
    });
  })();

  return { message: 'Evaluation updated successfully' };
}

export default NextAPI(handler);
export { handler };

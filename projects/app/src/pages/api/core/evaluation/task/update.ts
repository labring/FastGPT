import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  UpdateEvaluationResponse,
  UpdateEvaluationRequest
} from '@fastgpt/global/core/evaluation/api';
import { ValidationResultUtils } from '@fastgpt/global/core/evaluation/validate';
import { validateEvaluationParamsForUpdate } from '@fastgpt/service/core/evaluation/utils';
import { authEvaluationTaskWrite } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<UpdateEvaluationRequest>
): Promise<UpdateEvaluationResponse> {
  const { evalId, name, description, evalDatasetCollectionId, target, evaluators } = req.body;

  if (!evalId) {
    throw new Error(EvaluationErrEnum.evalIdRequired);
  }

  const { teamId, tmbId, evaluation } = await authEvaluationTaskWrite(evalId, {
    req,
    authApiKey: true,
    authToken: true
  });

  // Validate all evaluation parameters with common validation utility
  const paramValidation = await validateEvaluationParamsForUpdate(
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
    const error = ValidationResultUtils.toTranslatableError(paramValidation);
    // Log detailed validation errors for debugging
    if ((error as any).validationDebugInfo) {
      addLog.error('Evaluation update validation failed', (error as any).validationDebugInfo);
    }
    throw error;
  }

  const taskName = name?.trim() || evaluation.name;

  await EvaluationTaskService.updateEvaluation(
    evalId,
    {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() })
      // runing config not support modify
      // ...(evalDatasetCollectionId !== undefined && { evalDatasetCollectionId }),
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

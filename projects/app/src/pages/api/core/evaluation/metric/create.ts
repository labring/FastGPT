import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import type { CreateMetricBody } from '@fastgpt/global/core/evaluation/metric/api';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { authEvaluationMetricCreate } from '@fastgpt/service/core/evaluation/common';
import { checkTeamEvalMetricLimit } from '@fastgpt/service/support/permission/teamLimit';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import {
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_PROMPT_LENGTH
} from '@fastgpt/global/core/evaluation/constants';

async function handler(req: ApiRequestProps<CreateMetricBody, {}>, res: ApiResponseType<any>) {
  const { name, description, prompt } = req.body;

  const { teamId, tmbId } = await authEvaluationMetricCreate({
    req,
    authApiKey: true,
    authToken: true
  });

  // Check team evaluation metric limit
  await checkTeamEvalMetricLimit(teamId);

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return Promise.reject(EvaluationErrEnum.evalMetricNameRequired);
  }

  if (name.trim().length > MAX_NAME_LENGTH) {
    return Promise.reject(EvaluationErrEnum.evalMetricNameTooLong);
  }

  if (description && typeof description !== 'string') {
    return Promise.reject(EvaluationErrEnum.evalMetricDescriptionTooLong);
  }

  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return Promise.reject(EvaluationErrEnum.evalMetricDescriptionTooLong);
  }

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return Promise.reject(EvaluationErrEnum.evalMetricPromptRequired);
  }

  if (prompt.trim().length > MAX_PROMPT_LENGTH) {
    return Promise.reject(EvaluationErrEnum.evalMetricPromptTooLong);
  }

  const metric = await MongoEvalMetric.create({
    teamId: teamId,
    tmbId: tmbId,
    name: name,
    description: description ?? '',
    type: EvalMetricTypeEnum.Custom,
    prompt: prompt,
    llmRequired: true,
    userInputRequired: true,
    actualOutputRequired: true,
    expectedOutputRequired: true,
    createTime: new Date(),
    updateTime: new Date()
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_EVALUATION_METRIC,
      params: {
        metricName: name.trim()
      }
    });
  })();

  return {
    id: metric._id.toString(),
    name: metric.name,
    description: metric.description,
    createTime: metric.createTime,
    updateTime: metric.updateTime
  };
}

export default NextAPI(handler);

export { handler };

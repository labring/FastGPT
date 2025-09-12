import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import type { UpdateMetricBody } from '@fastgpt/global/core/evaluation/metric/api';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { authEvaluationMetricWrite } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import {
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_PROMPT_LENGTH
} from '@fastgpt/global/core/evaluation/constants';

async function handler(req: ApiRequestProps<UpdateMetricBody, {}>, res: ApiResponseType<any>) {
  const { metricId, name, description, prompt } = req.body;
  const { teamId, tmbId } = await authEvaluationMetricWrite(metricId, {
    req,
    authApiKey: true,
    authToken: true
  });
  if (!metricId) {
    return Promise.reject(EvaluationErrEnum.evalMetricIdRequired);
  }

  if (name && (typeof name !== 'string' || name.trim().length === 0)) {
    return Promise.reject(EvaluationErrEnum.evalMetricNameRequired);
  }

  if (name && name.trim().length > MAX_NAME_LENGTH) {
    return Promise.reject(EvaluationErrEnum.evalMetricNameTooLong);
  }

  if (description && (typeof description !== 'string' || description.trim().length === 0)) {
    return Promise.reject(EvaluationErrEnum.evalMetricDescriptionTooLong);
  }

  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return Promise.reject(EvaluationErrEnum.evalMetricDescriptionTooLong);
  }

  if (prompt && (typeof prompt !== 'string' || prompt.trim().length === 0)) {
    return Promise.reject(EvaluationErrEnum.evalMetricPromptRequired);
  }

  if (prompt && prompt.length > MAX_PROMPT_LENGTH) {
    return Promise.reject(EvaluationErrEnum.evalMetricPromptTooLong);
  }

  const metric = await MongoEvalMetric.findById(metricId);
  if (!metric) {
    return Promise.reject(EvaluationErrEnum.evalMetricNotFound);
  }

  if (metric.type === EvalMetricTypeEnum.Builtin) {
    return Promise.reject(EvaluationErrEnum.evalMetricBuiltinCannotModify);
  }

  if (name) metric.name = name;
  if (description) metric.description = description;
  if (prompt) metric.prompt = prompt;

  await metric.save();

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_EVALUATION_METRIC,
      params: {
        metricName: metric.name.trim()
      }
    });
  })();

  return {
    id: metric._id.toString(),
    name: metric.name,
    description: metric.description,
    type: metric.type,
    createTime: metric.createTime,
    updateTime: metric.updateTime
  };
}

export default NextAPI(handler);

export { handler };

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import type { UpdateMetricBody } from '@fastgpt/global/core/evaluation/metric/api';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { authEvaluationMetricWrite } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

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

  if (name && name.trim().length > 100) {
    return Promise.reject(EvaluationErrEnum.evalMetricNameTooLong);
  }

  if (description && (typeof description !== 'string' || description.trim().length === 0)) {
    return Promise.reject(EvaluationErrEnum.evalMetricDescriptionTooLong);
  }

  if (description && description.length > 100) {
    return Promise.reject(EvaluationErrEnum.evalMetricDescriptionTooLong);
  }

  if (prompt && (typeof prompt !== 'string' || prompt.trim().length === 0)) {
    return Promise.reject(EvaluationErrEnum.evalMetricPromptRequired);
  }

  if (prompt && prompt.length > 4000) {
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

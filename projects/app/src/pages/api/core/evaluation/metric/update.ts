import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import type { UpdateMetricBody } from '@fastgpt/global/core/evaluation/metric/api';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { authEvaluationMetricWrite } from '@fastgpt/service/core/evaluation/common';
async function handler(req: ApiRequestProps<UpdateMetricBody, {}>, res: ApiResponseType<any>) {
  const { id, name, description, prompt } = req.body;
  const { teamId } = await authEvaluationMetricWrite(id, {
    req,
    authApiKey: true,
    authToken: true
  });
  if (!id) {
    return Promise.reject('Missing required parameter: id');
  }

  if (name && (typeof name !== 'string' || name.trim().length === 0)) {
    return Promise.reject('Metric name must be a non-empty string');
  }

  if (name && name.trim().length > 100) {
    return Promise.reject('Metric name must be less than 100 characters');
  }

  if (description && (typeof description !== 'string' || description.trim().length === 0)) {
    return Promise.reject('Description must be a non-empty string');
  }

  if (description && description.length > 100) {
    return Promise.reject('Description must be less than 100 characters');
  }

  if (prompt && (typeof prompt !== 'string' || prompt.trim().length === 0)) {
    return Promise.reject('Prompt must be a non-empty string');
  }

  if (prompt && prompt.length > 4000) {
    return Promise.reject('Prompt must be less than 4000 characters');
  }

  const metric = await MongoEvalMetric.findById(id);
  if (!metric) {
    return Promise.reject('Metric not found');
  }

  if (metric.type === EvalMetricTypeEnum.Builtin) {
    return Promise.reject('Builtin metric cannot be modified');
  }

  if (name) metric.name = name;
  if (description) metric.description = description;
  if (prompt) metric.prompt = prompt;

  await metric.save();

  // addAuditLog({
  //   tmbId,
  //   teamId,
  //   event: AuditEventEnum.UPDATE_EVALUATION_METRIC,
  //   params: {
  //     name: metric.name
  //   }
  // });

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

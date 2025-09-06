import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import type { CreateMetricBody } from '@fastgpt/global/core/evaluation/metric/api';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { authEvaluationMetricCreate } from '@fastgpt/service/core/evaluation/common';
async function handler(req: ApiRequestProps<CreateMetricBody, {}>, res: ApiResponseType<any>) {
  const { name, description, prompt } = req.body;

  const { teamId, tmbId } = await authEvaluationMetricCreate({
    req,
    authApiKey: true,
    authToken: true
  });

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return Promise.reject('Metric name is required and must be a non-empty string');
  }

  if (name.trim().length > 100) {
    return Promise.reject('Metric name must be less than 100 characters');
  }

  if (description && typeof description !== 'string') {
    return Promise.reject('Description must be a string');
  }

  if (description && description.length > 100) {
    return Promise.reject('Description must be less than 100 characters');
  }

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return Promise.reject('Metric prompt is required and must be a non-empty string');
  }

  if (prompt.trim().length > 4000) {
    return Promise.reject('Prompt must be less than 4000 characters');
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

  // addAuditLog({
  //   tmbId,
  //   teamId,
  //   event: AuditEventEnum.CREATE_EVALUATION_METRIC,
  //   params: {
  //     name: name
  //   }
  // });

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

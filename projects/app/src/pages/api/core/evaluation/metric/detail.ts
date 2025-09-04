import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { authEvaluationMetricRead } from '@fastgpt/service/core/evaluation/common';
type Query = { id: string };

async function handler(req: ApiRequestProps<{}, Query>, res: ApiResponseType<any>) {
  const { id } = req.query;

  const { teamId } = await authEvaluationMetricRead(id, {
    req,
    authApiKey: true,
    authToken: true
  });
  if (!id) {
    return Promise.reject('Missing required parameter: id');
  }

  const metric = await MongoEvalMetric.findById(id).lean();
  if (!metric) {
    return Promise.reject('Metric not found');
  }

  return metric;
}

export default NextAPI(handler);

export { handler };

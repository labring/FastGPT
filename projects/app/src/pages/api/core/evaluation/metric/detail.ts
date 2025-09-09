import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { authEvaluationMetricRead } from '@fastgpt/service/core/evaluation/common';
import type { DetailMetricQuery } from '@fastgpt/global/core/evaluation/metric/api';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(req: ApiRequestProps<{}, DetailMetricQuery>, res: ApiResponseType<any>) {
  const { metricId } = req.query;

  const { teamId } = await authEvaluationMetricRead(metricId, {
    req,
    authApiKey: true,
    authToken: true
  });
  if (!metricId) {
    return Promise.reject(EvaluationErrEnum.evalMetricIdRequired);
  }

  const metric = await MongoEvalMetric.findById(metricId).lean();
  if (!metric) {
    return Promise.reject(EvaluationErrEnum.evalMetricNotFound);
  }

  return metric;
}

export default NextAPI(handler);

export { handler };

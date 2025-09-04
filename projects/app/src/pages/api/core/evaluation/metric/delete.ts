import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { authEvaluationMetricWrite } from '@fastgpt/service/core/evaluation/common';
type Query = { id: string };

async function handler(req: ApiRequestProps<{}, Query>, res: ApiResponseType<any>) {
  const { id } = req.query;
  if (!id) {
    return Promise.reject('Missing required parameter: id');
  }

  const { teamId } = await authEvaluationMetricWrite(id, {
    req,
    authApiKey: true,
    authToken: true
  });

  const metric = await MongoEvalMetric.findById(id);
  if (!metric) {
    return Promise.reject('Metric not found');
  }

  if (metric.type === EvalMetricTypeEnum.Builtin) {
    return Promise.reject('Builtin metrics cannot be deleted');
  }

  await MongoEvalMetric.findByIdAndDelete(id);

  // addAuditLog({
  //   tmbId,
  //   teamId,
  //   event: AuditEventEnum.DELETE_EVALUATION_METRIC,
  //   params: {
  //     name: metric.name
  //   }
  // });

  return {};
}

export default NextAPI(handler);

export { handler };

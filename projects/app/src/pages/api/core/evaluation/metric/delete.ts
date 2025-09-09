import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { authEvaluationMetricWrite } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import type { DeleteMetricQuery } from '@fastgpt/global/core/evaluation/metric/api';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(req: ApiRequestProps<{}, DeleteMetricQuery>, res: ApiResponseType<any>) {
  const { metricId } = req.query;
  if (!metricId) {
    return Promise.reject(EvaluationErrEnum.evalMetricIdRequired);
  }

  const { teamId, tmbId } = await authEvaluationMetricWrite(metricId, {
    req,
    authApiKey: true,
    authToken: true
  });

  const metric = await MongoEvalMetric.findById(metricId);
  if (!metric) {
    return Promise.reject(EvaluationErrEnum.evalMetricNotFound);
  }

  if (metric.type === EvalMetricTypeEnum.Builtin) {
    return Promise.reject(EvaluationErrEnum.evalMetricBuiltinCannotDelete);
  }

  await MongoEvalMetric.findByIdAndDelete(metricId);

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_EVALUATION_METRIC,
      params: {
        metricName: metric.name.trim()
      }
    });
  })();

  return {};
}

export default NextAPI(handler);

export { handler };

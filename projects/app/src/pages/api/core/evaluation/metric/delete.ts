import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

type Query = { id: string };

async function handler(req: ApiRequestProps<{}, Query>, res: ApiResponseType<any>) {
  const { id } = req.query;

  if (!id) {
    return Promise.reject('Missing required parameter: id');
  }

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
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

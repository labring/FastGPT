import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

type Query = { id: string };

async function handler(req: ApiRequestProps<{}, Query>, res: ApiResponseType<any>) {
  const { id } = req.query;

  if (!id) {
    return Promise.reject('Missing required parameter: id');
  }

  await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  const metric = await MongoEvalMetric.findById(id).lean();
  if (!metric) {
    return Promise.reject('Metric not found');
  }

  return metric;
}

export default NextAPI(handler);

export { handler };

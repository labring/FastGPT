import type { NextApiResponse } from 'next';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { jsonRes } from '@fastgpt/service/common/response';

type EnterpriseAuthMethod = 'GET' | 'POST';

/**
 * 企业认证 API 的 OpenAPI method 守卫。
 * 路由命中错误 HTTP 方法时直接返回 405，避免继续触发鉴权、外部接口或认证状态变更。
 */
export function rejectUnsupportedEnterpriseAuthMethod({
  req,
  res,
  method
}: {
  req: ApiRequestProps;
  res: NextApiResponse;
  method: EnterpriseAuthMethod;
}) {
  if (req.method?.toUpperCase() === method) {
    return false;
  }

  res.setHeader('Allow', method);
  jsonRes(res, { code: 405, error: 'Method not allowed' });
  return true;
}

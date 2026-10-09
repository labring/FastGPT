import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ProbeConnectionBodySchema,
  ProbeConnectionResponseSchema,
  type ProbeConnectionBody,
  type ProbeConnectionResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig/probe';
import { probeUrlConnection } from '@fastgpt/service/common/system/systemInstanceConfig/probe';

/**
 * Admin API - 探测指定服务 URL 的网络连通性
 * 仅超级管理员 root 可触发，由后端直接发起 HTTP 探测。
 */
async function handler(
  req: ApiRequestProps<ProbeConnectionBody>
): Promise<ProbeConnectionResponse> {
  await authSystemAdmin({ req });

  const body = parseApiInput({
    req,
    bodySchema: ProbeConnectionBodySchema
  }).body;

  const result = await probeUrlConnection(body);

  return ProbeConnectionResponseSchema.parse(result);
}

export default NextAPI(handler);

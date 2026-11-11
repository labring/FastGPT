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
import { SECRET_MASK } from '@fastgpt/global/common/system/config/permission';
import {
  findOverridesNotAllowedByEdition,
  getDomainConfig
} from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import { ApiHttpError } from '@fastgpt/service/common/http/apiError';

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

  // 按与配置保存相同的版本边界检查，避免未来字段变为商业版专用后通过探测绕过。
  if (body.service) {
    const submittedOverrides =
      body.service === 'codeSandbox'
        ? { codeSandbox: { url: body.url, token: body.token ?? '' } }
        : { mcp: { sseProxyUrl: body.url } };
    const notAllowed = findOverridesNotAllowedByEdition({
      domain: 'subservice',
      submittedOverrides
    });
    if (notAllowed.length > 0) {
      throw new ApiHttpError(403, 'Edition boundary violation for subservice probe');
    }
  }

  // 只在授权和版本检查后读取持久化凭据，表单空值则保持空值。
  const token =
    body.service === 'codeSandbox' && body.token === SECRET_MASK
      ? (await getDomainConfig('subservice')).effectiveConfig.codeSandbox.token
      : body.token;
  const result = await probeUrlConnection({ ...body, token });

  return ProbeConnectionResponseSchema.parse(result);
}

export default NextAPI(handler);

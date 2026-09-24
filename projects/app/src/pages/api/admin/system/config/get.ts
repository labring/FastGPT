import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetDomainConfigQuerySchema,
  GetDomainConfigResponseSchema,
  type GetDomainConfigResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig';
import { getDomainConfig } from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import { getDomainSecretKeys } from '@fastgpt/global/common/system/config';

/**
 * Admin API - 获取单个 Domain 的实例配置与生效快照
 * 仅超级管理员 root 可访问，敏感字段默认脱敏。
 */
async function handler(req: ApiRequestProps): Promise<GetDomainConfigResponse> {
  await authSystemAdmin({ req });

  const { domain } = parseApiInput({
    req,
    querySchema: GetDomainConfigQuerySchema
  }).query;

  const result = await getDomainConfig(domain, { maskSecrets: true });
  const secretKeys = Array.from(getDomainSecretKeys(domain));

  return GetDomainConfigResponseSchema.parse({
    domain: result.domain,
    revision: result.revision,
    effectiveConfig: result.effectiveConfig,
    overrides: result.overrides,
    secretKeys,
    updatedAt: result.updatedAt,
    updatedBy: result.updatedBy
  });
}

export default NextAPI(handler);

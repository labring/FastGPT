import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetDomainConfigQuerySchema,
  GetDomainConfigResponseSchema,
  type GetDomainConfigResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig';
import { getDomainConfigForAdmin } from '@fastgpt/service/common/system/systemInstanceConfig/controller';

/**
 * Admin API - 获取单个 Domain 的实例配置与生效快照
 * 仅超级管理员 root 可访问，敏感字段默认脱敏。
 * 读取结果按服务端权威部署版本过滤：开源版不能通过手工请求读取商业配置字段。
 */
async function handler(req: ApiRequestProps): Promise<GetDomainConfigResponse> {
  await authSystemAdmin({ req });

  const { domain } = parseApiInput({
    req,
    querySchema: GetDomainConfigQuerySchema
  }).query;

  const result = await getDomainConfigForAdmin(domain);

  return GetDomainConfigResponseSchema.parse({
    domain: result.domain,
    revision: result.revision,
    effectiveConfig: result.effectiveConfig,
    overrides: result.overrides,
    secretKeys: result.secretKeys,
    updatedAt: result.updatedAt,
    updatedBy: result.updatedBy
  });
}

export default NextAPI(handler);

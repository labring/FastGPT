import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateDomainConfigBodySchema,
  UpdateDomainConfigResponseSchema,
  type UpdateDomainConfigBody,
  type UpdateDomainConfigResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig';
import {
  updateDomainConfig,
  getDomainConfig
} from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import { getDomainSecretKeys } from '@fastgpt/global/common/system/config';

/**
 * Admin API - 保存并更新单个 Domain 的稀疏覆盖配置
 * 包含版本号乐观锁校验、两阶段类型校验与敏感字段防丢失恢复。
 */
async function handler(
  req: ApiRequestProps<UpdateDomainConfigBody>
): Promise<UpdateDomainConfigResponse> {
  const auth = await authSystemAdmin({ req });

  const { domain, expectedRevision, overrides } = parseApiInput({
    req,
    bodySchema: UpdateDomainConfigBodySchema
  }).body;

  await updateDomainConfig({
    domain,
    expectedRevision,
    submittedOverrides: overrides as any,
    actor: {
      actor: 'admin',
      userId: auth.userId
    }
  });

  // 更新完成后获取脱敏后的生效数据作为响应返回
  const result = await getDomainConfig(domain, { maskSecrets: true });
  const secretKeys = Array.from(getDomainSecretKeys(domain));

  return UpdateDomainConfigResponseSchema.parse({
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

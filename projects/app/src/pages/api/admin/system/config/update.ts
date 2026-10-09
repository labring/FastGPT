import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateDomainConfigBodySchema,
  UpdateDomainConfigResponseSchema,
  type UpdateDomainConfigBody,
  type UpdateDomainConfigResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig/api';
import {
  updateDomainConfig,
  getDomainConfig,
  getDomainConfigForAdmin,
  findOverridesNotAllowedByEdition,
  getServiceEdition
} from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import { initSystemConfig } from '@/service/common/system';
import { assertStorageDownloadConfig } from '@/service/common/system/assertStorageDownloadConfig';
import { syncSiteAvatarLifecycle } from '@/service/common/system/syncSiteAvatarLifecycle';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.SYSTEM);

/**
 * Admin API - 保存并更新单个 Domain 的稀疏覆盖配置
 * 包含版本号乐观锁校验、两阶段类型校验、服务端版本边界校验与敏感字段防丢失恢复。
 * 版本边界由后端强制：开源版通过手工请求写入商业字段时直接拒绝（设计文档 §6 规则 2）。
 */
async function handler(
  req: ApiRequestProps<UpdateDomainConfigBody>
): Promise<UpdateDomainConfigResponse> {
  const auth = await authSystemAdmin({ req });

  const { domain, expectedRevision, overrides } = parseApiInput({
    req,
    bodySchema: UpdateDomainConfigBodySchema
  }).body;

  // 服务端版本边界：当前部署版本不允许的字段直接拒绝，不做静默丢弃
  const edition = getServiceEdition();
  const notAllowedKeys = findOverridesNotAllowedByEdition(domain, overrides, edition);
  if (notAllowedKeys.length > 0) {
    throw new Error(
      `Edition boundary violation: fields not allowed in ${edition} edition: ${notAllowedKeys.join(
        ', '
      )}`
    );
  }

  if (domain === 'storage') {
    assertStorageDownloadConfig(overrides as Record<string, unknown>);
  }

  // site 域涉及头像资源：先取旧值用于保存后的 S3 生命周期对比
  const previousConfig =
    domain === 'site' ? (await getDomainConfig('site')).effectiveConfig : undefined;

  await updateDomainConfig({
    domain,
    expectedRevision,
    submittedOverrides: overrides as any,
    actor: {
      actor: 'admin',
      userId: auth.userId
    }
  });

  // 配置保存后，同步刷新全站运行时配置与前端缓存失效标志。
  // 刷新失败不影响本次保存结果（DB 已落库，Mongo change stream / 重启会补偿），
  // 但必须记录，否则运行时配置与 DB 不一致且无痕可查。
  await initSystemConfig().catch((error) => {
    logger.error('Failed to refresh runtime config after instance config update', {
      domain,
      error
    });
  });

  // 更新完成后获取按版本过滤、脱敏后的生效数据作为响应返回
  const result = await getDomainConfigForAdmin(domain, edition);

  // 头像生命周期同步是保存后的清理动作：配置已落库成功，
  // 清理失败（S3 删除/移除 TTL 抛错）不应让请求整体失败——否则客户端误判保存失败，
  // 重试还会因 revision 冲突失败。记录错误交由 TTL 回收兜底。
  if (domain === 'site' && previousConfig) {
    await syncSiteAvatarLifecycle({
      previous: previousConfig as any,
      next: result.effectiveConfig as any
    }).catch((error) => {
      logger.error('Failed to sync site avatar lifecycle after config update', { error });
    });
  }

  return UpdateDomainConfigResponseSchema.parse({
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

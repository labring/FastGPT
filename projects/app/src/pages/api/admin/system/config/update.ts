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
  getDomainConfig,
  getDomainConfigForAdmin,
  findOverridesNotAllowedByEdition,
  getServiceEdition
} from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { initSystemConfig } from '@/service/common/system';
import { assertStorageDownloadConfig } from '@/service/common/system/assertStorageDownloadConfig';

/**
 * 站点域保存前后同步 S3 头像资源生命周期。
 * navbarItems 与 favicon 的头像资源受 TTL 管控：
 * - 保留使用的头像需移除 TTL（避免被自动回收）
 * - 被替换或删除的头像需清理（避免存储泄漏）
 */
const syncSiteAvatarLifecycle = async ({
  previous,
  next
}: {
  previous: { favicon?: string; navbarItems?: { avatar?: string }[] };
  next: { favicon?: string; navbarItems?: { avatar?: string }[] };
}) => {
  const s3AvatarSource = getS3AvatarSource();

  await s3AvatarSource.refreshAvatar(next.favicon, previous.favicon);

  const previousAvatars = new Set(
    (previous.navbarItems ?? []).map((item) => item.avatar).filter(Boolean) as string[]
  );
  const nextAvatars = new Set(
    (next.navbarItems ?? []).map((item) => item.avatar).filter(Boolean) as string[]
  );

  for (const avatar of nextAvatars) {
    if (!previousAvatars.has(avatar)) {
      await s3AvatarSource.removeAvatarTTL(avatar);
    }
  }
  for (const avatar of previousAvatars) {
    if (!nextAvatars.has(avatar)) {
      await s3AvatarSource.deleteAvatar(avatar);
    }
  }
};

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

  // 配置保存后，同步刷新全站运行时配置与前端缓存失效标志
  await initSystemConfig().catch(() => {});

  // 更新完成后获取按版本过滤、脱敏后的生效数据作为响应返回
  const result = await getDomainConfigForAdmin(domain, edition);

  if (domain === 'site' && previousConfig) {
    await syncSiteAvatarLifecycle({
      previous: previousConfig as any,
      next: result.effectiveConfig as any
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

import type { ApiRequestProps } from '@fastgpt/next/type';
import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import { deepMergeConfig } from '@fastgpt/global/common/system/config/merge';
import { parseDomainOverrides } from '@fastgpt/global/common/system/config/schema';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { ZodError } from 'zod';
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
  batchUpdateDomainConfigs,
  getDomainConfig,
  formatDomainConfigForAdmin,
  findOverridesNotAllowedByEdition,
  getServiceEdition
} from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import { initSystemConfig } from '@/service/common/system';
import { syncSiteAvatarLifecycle } from '@/service/common/system/syncSiteAvatarLifecycle';
import {
  getS3AvatarSource,
  SiteAvatarReferenceUnavailableError
} from '@fastgpt/service/common/s3/sources/avatar';
import {
  getSiteAvatarRefs,
  type SiteAvatarFields
} from '@fastgpt/service/common/s3/siteAvatarReferences';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { logInstanceConfigWrite } from '@fastgpt/service/common/system/migrationCoverageLog';
import { ApiHttpError } from '@fastgpt/service/common/http/apiError';
import {
  getSsoConfigured,
  SsoConfigurationUnavailableError
} from '@fastgpt/service/common/system/sso';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AdminAuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

const logger = getLogger(LogCategories.SYSTEM);

const isSiteAvatarUrl = (avatar: string) => avatar.startsWith(`${imageBaseUrl}avatar/`);
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 将站点或登录 overrides 中本次新引用的头像替换为独立复制对象。 */
const rewriteSiteAvatarOverrides = ({
  overrides,
  replacements
}: {
  overrides: Record<string, unknown>;
  replacements: Map<string, string>;
}): Record<string, unknown> => {
  const rewrite = (value: unknown) =>
    typeof value === 'string' && replacements.has(value) ? replacements.get(value)! : value;
  const next = structuredClone(overrides);

  if (typeof next.favicon === 'string') {
    next.favicon = rewrite(next.favicon);
  }
  if (Array.isArray(next.navbarItems)) {
    next.navbarItems = next.navbarItems.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const navbarItem = item as Record<string, unknown>;
      return typeof navbarItem.avatar === 'string'
        ? { ...navbarItem, avatar: rewrite(navbarItem.avatar) }
        : navbarItem;
    });
  }
  if (isPlainObject(next.sso) && typeof next.sso.icon === 'string') {
    next.sso = {
      ...next.sso,
      icon: rewrite(next.sso.icon)
    };
  }

  return next;
};

/**
 * Admin API - 保存一个或多个 Domain 的稀疏覆盖配置。
 *
 * 一次请求只执行一个 Mongo 事务：鉴权、版本边界、掩码恢复、校验、revision 和持久化
 * 共用同一条链路；任意域冲突或校验失败时整体回滚。数据库提交成功即返回成功，
 * 运行时刷新在后台执行，刷新失败不回滚也不把已提交的保存误报为失败。
 */
async function handler(
  req: ApiRequestProps<UpdateDomainConfigBody>
): Promise<UpdateDomainConfigResponse> {
  const auth = await authSystemAdmin({ req });

  const { items, subPlans, subPlansExpectedRevision } = parseApiInput({
    req,
    bodySchema: UpdateDomainConfigBodySchema
  }).body;

  // 1. 服务端版本边界：当前部署版本不允许的字段直接拒绝
  const edition = getServiceEdition();
  // 套餐不属于实例配置的 11 个域，必须单独校验；包含空对象也代表替换套餐的写入意图。
  // 在读取旧站点配置或开启事务之前拒绝，保证同批普通配置也不会被部分保存。
  if (edition === 'community' && subPlans !== undefined) {
    throw new ApiHttpError(
      403,
      'Edition boundary violation: subPlans is only available in pro edition'
    );
  }
  for (const item of items) {
    const notAllowedKeys = findOverridesNotAllowedByEdition({
      domain: item.domain,
      submittedOverrides: item.overrides,
      edition
    });
    if (notAllowedKeys.length > 0) {
      throw new ApiHttpError(
        403,
        `Edition boundary violation in domain "${item.domain}": fields not allowed in ${edition} edition: ${notAllowedKeys.join(
          ', '
        )}`
      );
    }
  }

  // 1.1 sync 团队模式必须依赖 Pro 侧 EXTERNAL_USER_SYSTEM_BASE_URL；未配置时在事务与 S3 操作前拒绝保存。
  const authSyncRequested = items.some(
    (item) =>
      item.domain === 'auth' &&
      typeof item.overrides === 'object' &&
      item.overrides !== null &&
      (item.overrides as Record<string, unknown>).teamMode === 'sync'
  );
  if (authSyncRequested) {
    const ssoConfigured = await getSsoConfigured().catch((error: unknown) => {
      if (error instanceof SsoConfigurationUnavailableError) {
        throw new ApiHttpError(
          503,
          'SSO configuration is unavailable; cannot verify sync teamMode prerequisite'
        );
      }
      throw error;
    });
    if (!ssoConfigured) {
      throw new ApiHttpError(
        400,
        'Sync teamMode requires EXTERNAL_USER_SYSTEM_BASE_URL to be configured'
      );
    }
  }

  // 2. site 域（favicon/navbarItems）与 auth.sso.icon 涉及头像资源：
  // 先校验本次提交形状，再按实际触及的域读取旧值做生命周期对比，避免无关域额外读库。
  const siteItem = items.find((item) => item.domain === 'site');
  const authAvatarItem = items.find(
    (item) => item.domain === 'auth' && isPlainObject(item.overrides) && 'sso' in item.overrides
  );
  if (siteItem) {
    try {
      parseDomainOverrides({ domain: 'site', overrides: siteItem.overrides });
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ApiRequestInputParseError(error, { inputSource: 'body' });
      }
      throw error;
    }
  }
  if (authAvatarItem) {
    try {
      parseDomainOverrides({ domain: 'auth', overrides: authAvatarItem.overrides });
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ApiRequestInputParseError(error, { inputSource: 'body' });
      }
      throw error;
    }
  }
  const previousSiteConfig = siteItem ? (await getDomainConfig('site')).effectiveConfig : undefined;
  const previousAuthConfig = authAvatarItem
    ? (await getDomainConfig('auth')).effectiveConfig
    : undefined;

  // 3. 新引用的站点头像与 SSO 图标先复制为独立对象并改写本次 overrides。
  // 旧删除任务可能已经领取/正在删除原对象；新配置只引用复制件，避免与旧任务共享同一 key。
  // 复制件带 24h 临时 TTL，保存成功后由生命周期同步移除；保存失败则由 TTL 回收。
  let itemsToSave = items;
  if ((siteItem && previousSiteConfig) || (authAvatarItem && previousAuthConfig)) {
    const previousAvatarFields: SiteAvatarFields = {
      ...(previousSiteConfig ?? {}),
      ...(previousAuthConfig ? { sso: previousAuthConfig.sso } : {})
    };
    const nextSitePart =
      siteItem && previousSiteConfig
        ? (deepMergeConfig(previousSiteConfig, siteItem.overrides) as SiteAvatarFields)
        : {};
    const nextAuthPart =
      authAvatarItem && previousAuthConfig
        ? (deepMergeConfig(previousAuthConfig, authAvatarItem.overrides) as {
            sso?: { icon?: string };
          })
        : {};
    const nextAvatarFields: SiteAvatarFields = {
      ...nextSitePart,
      ...(nextAuthPart.sso ? { sso: nextAuthPart.sso } : {})
    };
    const previousRefs = getSiteAvatarRefs(previousAvatarFields);
    const newRefs = [...getSiteAvatarRefs(nextAvatarFields)].filter(
      (avatar) => !previousRefs.has(avatar) && isSiteAvatarUrl(avatar)
    );
    const replacements = new Map<string, string>();

    for (const avatar of newRefs) {
      try {
        replacements.set(avatar, await getS3AvatarSource().copyForSiteReference({ avatar }));
      } catch (error) {
        if (error instanceof SiteAvatarReferenceUnavailableError) {
          throw new ApiHttpError(400, `Avatar file not found: ${avatar}. Please upload it again.`);
        }
        throw error;
      }
    }

    if (replacements.size > 0) {
      itemsToSave = items.map((item) =>
        item.domain === 'site' || (item.domain === 'auth' && authAvatarItem !== undefined)
          ? {
              ...item,
              overrides: rewriteSiteAvatarOverrides({
                overrides: item.overrides,
                replacements
              })
            }
          : item
      );
    }
  }

  // 4. 单事务写入全部域和可选套餐
  const savedConfigs = await batchUpdateDomainConfigs({
    items: itemsToSave,
    subPlans,
    subPlansExpectedRevision,
    actor: { actor: 'admin', userId: auth.userId }
  });

  // 只在提交后记录操作者，不记录可能包含密钥的配置；审计失败不影响已提交的保存。
  void Promise.resolve()
    .then(() =>
      addAuditLog({
        tmbId: auth.tmbId,
        teamId: auth.teamId,
        event: AdminAuditEventEnum.ADMIN_UPDATE_SYSTEM_CONFIG,
        params: { name: 'root' }
      })
    )
    .catch((error) => logger.error('Failed to add system config audit log', { error }));

  // 5. 数据库提交后即保存成功；运行时刷新在后台触发，刷新失败不将已提交的操作报告为失败
  void initSystemConfig().catch((error) => {
    logger.error('Failed to apply instance config after save', { error });
  });

  // 6. 站点头像与 SSO 图标生命周期同步是保存后的清理动作，失败不影响保存结果
  if ((siteItem && previousSiteConfig) || (authAvatarItem && previousAuthConfig)) {
    const currentSite = savedConfigs.find((result) => result.domain === 'site');
    const currentAuth = savedConfigs.find((result) => result.domain === 'auth');
    const nextSiteFields = (currentSite?.effectiveConfig ??
      previousSiteConfig ??
      {}) as SiteAvatarFields;
    const nextAuthSso =
      (currentAuth?.effectiveConfig as { sso?: { icon?: string } } | undefined)?.sso ??
      previousAuthConfig?.sso;
    void syncSiteAvatarLifecycle({
      previous: {
        ...(previousSiteConfig ?? {}),
        ...(previousAuthConfig ? { sso: previousAuthConfig.sso } : {})
      },
      next: {
        ...nextSiteFields,
        ...(nextAuthSso ? { sso: nextAuthSso } : {})
      }
    }).catch((error) => {
      logger.error('Failed to sync site avatar lifecycle after config update', { error });
    });
  }

  // 7. 只投影本次提交结果，不再读库：后续刷新异常或并发保存不能改变这次保存的响应。
  const results = savedConfigs.map((result) => formatDomainConfigForAdmin(result, edition));
  logInstanceConfigWrite({
    callsite: 'runtime.app.admin.system.config.update',
    fields: results.map((result) => ({
      path: result.domain,
      value: result.effectiveConfig
    }))
  });

  return UpdateDomainConfigResponseSchema.parse({ results });
}

export default NextAPI(handler);

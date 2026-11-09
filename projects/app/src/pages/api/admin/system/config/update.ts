import { randomUUID } from 'node:crypto';
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
  batchUpdateDomainConfigs,
  getDomainConfig,
  formatDomainConfigForAdmin,
  findOverridesNotAllowedByEdition,
  getServiceEdition
} from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import { initSystemConfig } from '@/service/common/system';
import { assertStorageDownloadConfig } from '@fastgpt/service/common/s3/config/utils';
import { syncSiteAvatarLifecycle } from '@/service/common/system/syncSiteAvatarLifecycle';
import { resolveDomainEffectiveConfig } from '@fastgpt/global/common/system/config/schema';
import { deepMergeConfig } from '@fastgpt/global/common/system/config/merge';
import {
  AVATAR_KEY_PREFIX,
  getCurrentSiteAvatarKeys,
  getSiteAvatarRefs,
  releaseSiteAvatarReservations,
  reserveSiteAvatarReferences,
  SiteAvatarDeletionInProgressError,
  toSiteAvatarKey
} from '@fastgpt/service/common/s3/siteAvatarReferences';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { logInstanceConfigWrite } from '@fastgpt/service/common/system/migrationCoverageLog';
import { ApiHttpError } from '@fastgpt/service/common/http/apiError';

const logger = getLogger(LogCategories.SYSTEM);

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
    if (item.domain === 'storage') {
      assertStorageDownloadConfig(item.overrides);
    }
  }

  // 2. site 域涉及头像资源：先取旧值用于保存后的 S3 生命周期对比
  const siteItem = items.find((item) => item.domain === 'site');
  const previousSiteConfig = siteItem ? (await getDomainConfig('site')).effectiveConfig : undefined;

  // 2.1 新引用头像必须在提交前完成对象级登记：
  // - 删除任务已领取的对象返回 409，让用户重试而不是写入一个即将被删除的 URL；
  // - 对象已不存在时返回 400，提示重新上传；
  // - 登记成功后，删除任务无法再领取该对象，消除检查后窗口。
  const avatarReservation = {
    reservationId: randomUUID(),
    avatarKeys: [] as string[]
  };
  const newAvatarKeys = (() => {
    if (!siteItem || !previousSiteConfig) return [];
    const previousAvatarRefs = getSiteAvatarRefs(previousSiteConfig);
    const nextSiteConfig = resolveDomainEffectiveConfig({
      domain: 'site',
      overrides: deepMergeConfig(previousSiteConfig, siteItem.overrides)
    });
    return [...getSiteAvatarRefs(nextSiteConfig)]
      .filter((avatar) => !previousAvatarRefs.has(avatar))
      .map(toSiteAvatarKey)
      .filter((avatarKey) => avatarKey.startsWith(AVATAR_KEY_PREFIX));
  })();

  /**
   * 只释放本次预约且当前配置未引用的头像。
   * 若无法读取当前配置，保留 referenced 状态，宁可暂时不回收也不误删可能已提交的引用。
   */
  const releaseAvatarReservations = async () => {
    if (avatarReservation.avatarKeys.length === 0) return;
    const currentSiteRefs = await getCurrentSiteAvatarKeys();
    if (!currentSiteRefs) return;
    const unreferencedKeys = avatarReservation.avatarKeys.filter(
      (avatarKey) => !currentSiteRefs.avatarKeys.has(avatarKey)
    );
    if (unreferencedKeys.length === 0) return;
    await releaseSiteAvatarReservations({
      avatarKeys: unreferencedKeys,
      reservationId: avatarReservation.reservationId
    });
  };

  // 2.2 逐个登记引用锁并记录成功项；任何一步失败只释放本次已取得的预约。
  try {
    for (const avatarKey of newAvatarKeys) {
      await reserveSiteAvatarReferences({
        avatarKeys: [avatarKey],
        siteRevision: siteItem!.expectedRevision + 1,
        reservationId: avatarReservation.reservationId
      });
      avatarReservation.avatarKeys.push(avatarKey);
    }

    if (avatarReservation.avatarKeys.length > 0) {
      // 先登记引用锁，再确认对象存在。若删除任务在检查与登记之间完成并清掉状态，
      // 登记会失败（deleting）或成功但存在性检查发现对象已缺失，两种情况都不会写库。
      const missingAvatarKeys: string[] = await getS3AvatarSource().findMissingAvatars({
        avatarKeys: avatarReservation.avatarKeys
      });
      if (missingAvatarKeys.length > 0) {
        throw new ApiHttpError(
          400,
          `Avatar file not found: ${missingAvatarKeys.join(', ')}. Please upload it again.`
        );
      }
    }
  } catch (error) {
    await releaseAvatarReservations().catch((releaseError) => {
      logger.error('Failed to release avatar reservations after preflight failure', {
        error: releaseError
      });
    });
    if (error instanceof SiteAvatarDeletionInProgressError) {
      throw new ApiHttpError(
        409,
        'Avatar deletion is in progress. Please retry the save in a moment.'
      );
    }
    throw error;
  }

  // 3. 单事务写入全部域和可选套餐
  let savedConfigs;
  try {
    savedConfigs = await batchUpdateDomainConfigs({
      items,
      subPlans,
      subPlansExpectedRevision,
      actor: {
        actor: 'admin',
        userId: auth.userId
      }
    });
  } catch (error) {
    // revision 冲突、其他域校验失败等都会让事务整体回滚；撤销本次预登记，
    // 避免留下站点从未引用的 referenced 状态而永久失去自动回收入口。
    await releaseAvatarReservations().catch((releaseError) => {
      logger.error('Failed to release avatar reservations after config save failure', {
        error: releaseError
      });
    });
    throw error;
  }

  // 4. 数据库提交后即保存成功；运行时刷新在后台触发，刷新失败不将已提交的操作报告为失败
  void initSystemConfig().catch((error) => {
    logger.error('Failed to apply instance config after save', { error });
  });

  // 5. 站点头像生命周期同步是保存后的清理动作，失败不影响保存结果
  if (siteItem && previousSiteConfig) {
    const currentSite = savedConfigs.find((result) => result.domain === 'site');
    if (currentSite)
      void syncSiteAvatarLifecycle({
        previous: previousSiteConfig,
        next: currentSite.effectiveConfig as typeof previousSiteConfig,
        savedRevision: currentSite.revision
      }).catch((error) => {
        logger.error('Failed to sync site avatar lifecycle after config update', { error });
      });
  }

  // 6. 只投影本次提交结果，不再读库：后续刷新异常或并发保存不能改变这次保存的响应。
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

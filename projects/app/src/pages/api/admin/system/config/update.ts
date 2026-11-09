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
import { syncSiteAvatarLifecycle } from '@/service/common/system/syncSiteAvatarLifecycle';
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
  }

  // 2. site 域涉及头像资源：先取旧值用于保存后的 S3 生命周期对比
  const siteItem = items.find((item) => item.domain === 'site');
  const previousSiteConfig = siteItem ? (await getDomainConfig('site')).effectiveConfig : undefined;

  // 3. 单事务写入全部域和可选套餐
  const savedConfigs = await batchUpdateDomainConfigs({
    items,
    subPlans,
    subPlansExpectedRevision,
    actor: { actor: 'admin', userId: auth.userId }
  });

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
        next: currentSite.effectiveConfig as typeof previousSiteConfig
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

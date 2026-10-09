import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  BatchUpdateDomainConfigBodySchema,
  BatchUpdateDomainConfigResponseSchema,
  type BatchUpdateDomainConfigBody,
  type BatchUpdateDomainConfigResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig/api';
import {
  batchUpdateDomainConfigs,
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
 * Admin API - 跨域批量原子保存实例配置
 * - 支持在单个 Mongo 事务中提交多个 Domain 的配置更新；
 * - 任意一个域发生 revision 冲突或校验失败，整体回滚，杜绝半生效状态；
 * - 成功后统一刷新全站运行时配置并同步资源生命周期。
 */
async function handler(
  req: ApiRequestProps<BatchUpdateDomainConfigBody>
): Promise<BatchUpdateDomainConfigResponse> {
  const auth = await authSystemAdmin({ req });

  const { items } = parseApiInput({
    req,
    bodySchema: BatchUpdateDomainConfigBodySchema
  }).body;

  const edition = getServiceEdition();

  // 1. 服务端版本边界校验：任何包含当前版本未开放字段的域直接拒绝
  for (const item of items) {
    const notAllowedKeys = findOverridesNotAllowedByEdition(item.domain, item.overrides, edition);
    if (notAllowedKeys.length > 0) {
      throw new Error(
        `Edition boundary violation in domain "${item.domain}": fields not allowed in ${edition} edition: ${notAllowedKeys.join(
          ', '
        )}`
      );
    }
  }

  // 2. 存储域跨字段约束校验
  const storageItem = items.find((i) => i.domain === 'storage');
  if (storageItem) {
    assertStorageDownloadConfig(storageItem.overrides);
  }

  // 3. 站点域头像生命周期准备
  const siteItem = items.find((i) => i.domain === 'site');
  const previousSiteConfig = siteItem ? (await getDomainConfig('site')).effectiveConfig : undefined;

  // 4. 事务批量原子写入
  const updatedDomains = await batchUpdateDomainConfigs({
    items,
    actor: {
      actor: 'admin',
      userId: auth.userId
    }
  });

  // 5. 刷新全站运行时配置
  await initSystemConfig().catch((error) => {
    logger.error('Failed to refresh runtime config after batch instance config update', { error });
  });

  // 6. 站点域头像生命周期处理
  if (siteItem && previousSiteConfig) {
    const currentSite = await getDomainConfig('site');
    await syncSiteAvatarLifecycle({
      previous: previousSiteConfig,
      next: currentSite.effectiveConfig
    }).catch((error) => {
      logger.error('Failed to sync site avatar lifecycle after batch config update', { error });
    });
  }

  // 7. 读取并组装所有更新域的返回数据
  const results = await Promise.all(
    updatedDomains.map(async (domain) => {
      const res = await getDomainConfigForAdmin(domain, edition);
      return {
        domain: res.domain,
        revision: res.revision,
        effectiveConfig: res.effectiveConfig,
        overrides: res.overrides,
        secretKeys: res.secretKeys,
        updatedAt: res.updatedAt,
        updatedBy: res.updatedBy
      };
    })
  );

  return BatchUpdateDomainConfigResponseSchema.parse({
    results
  });
}

export default NextAPI(handler);

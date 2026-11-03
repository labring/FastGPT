import { useMemo, useCallback } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  getSystemEdition,
  isCommunityEdition,
  isProEdition,
  isConfigFieldAllowed,
  isConfigFieldVisible,
  getDomainAllowedKeys,
  getDomainVisibleKeys,
  filterDomainDataByEdition
} from '@fastgpt/global/common/system/config/permission';
import type { SystemInstanceConfigDomainKey } from '@fastgpt/global/common/system/config/schema';

/**
 * 前端 /admin 页面专用的版本与字段级权限 Hook。
 * 版本判断基于 PRO_URL（isProService）；SaaS 运营字段是否展示来自服务端下发的
 * feConfigs.enableSaasAdminConfig，缺省 false。该开关只影响显示，不参与 API 权限校验。
 */
export const useAdminPermission = () => {
  const { feConfigs } = useSystemStore();

  const isProService = !!feConfigs?.isProService;
  const enableSaasAdminConfig = feConfigs?.enableSaasAdminConfig ?? false;

  const isPro = useMemo(() => isProEdition(isProService), [isProService]);
  const isCommunity = useMemo(() => isCommunityEdition(isProService), [isProService]);
  const edition = useMemo(() => getSystemEdition(isProService), [isProService]);

  /**
   * 判断某个全局配置 Key（如 "commercial.showCoupon" 或 "site.name"）在当前版本和显示开关下是否允许展示。
   */
  const isFieldVisible = useCallback(
    (key: string): boolean => {
      return isConfigFieldVisible(key, { edition, enableSaasAdminConfig });
    },
    [edition, enableSaasAdminConfig]
  );

  /**
   * 获取指定 Domain 下当前版本和显示开关所有可见的字段相对路径集合。
   */
  const getAllowedKeysForDomain = useCallback(
    (domain: SystemInstanceConfigDomainKey): Set<string> => {
      return getDomainVisibleKeys(domain, { edition, enableSaasAdminConfig });
    },
    [edition, enableSaasAdminConfig]
  );

  /**
   * 过滤指定 Domain 的配置数据对象，自动剔除当前版本下不允许访问的字段。
   */
  const filterConfigData = useCallback(
    <T>(domain: SystemInstanceConfigDomainKey, data: T): Partial<T> => {
      return filterDomainDataByEdition(domain, data, edition);
    },
    [edition]
  );

  return {
    isPro,
    isCommunity,
    edition,
    enableSaasAdminConfig,
    isFieldVisible,
    getAllowedKeysForDomain,
    filterConfigData
  };
};

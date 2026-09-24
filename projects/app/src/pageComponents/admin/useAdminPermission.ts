import { useMemo, useCallback } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  getSystemEdition,
  isCommunityEdition,
  isProEdition,
  isConfigFieldAllowed,
  getDomainAllowedKeys,
  filterDomainDataByEdition,
  type SystemInstanceConfigDomainKey
} from '@fastgpt/global/common/system/config';

/**
 * 前端 /admin 页面专用的版本与字段级权限 Hook。
 * 权威规则：商业版判断严格基于是否存在 PRO_URL（即 feConfigs.isProService）。
 */
export const useAdminPermission = () => {
  const { feConfigs } = useSystemStore();

  const isProService = !!feConfigs?.isProService;

  const isPro = useMemo(() => isProEdition(isProService), [isProService]);
  const isCommunity = useMemo(() => isCommunityEdition(isProService), [isProService]);
  const edition = useMemo(() => getSystemEdition(isProService), [isProService]);

  /**
   * 判断某个全局配置 Key（如 "commercial.showCoupon" 或 "site.name"）在当前版本中是否允许展示和编辑。
   */
  const isFieldVisible = useCallback(
    (key: string): boolean => {
      return isConfigFieldAllowed(key, edition);
    },
    [edition]
  );

  /**
   * 获取指定 Domain 下当前版本所有可见的字段相对路径集合。
   */
  const getAllowedKeysForDomain = useCallback(
    (domain: SystemInstanceConfigDomainKey): Set<string> => {
      return getDomainAllowedKeys(domain, edition);
    },
    [edition]
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
    isFieldVisible,
    getAllowedKeysForDomain,
    filterConfigData
  };
};

import { type SystemInstanceConfigEdition, systemInstanceConfigRegistry } from './registry';
import type { SystemInstanceConfigDomainKey } from './schema';

/**
 * 判断当前系统部署版本。
 * 权威规则：只要存在 PRO_URL（即 isProService 为 true），即为商业版，否则为开源社区版。
 */
export const getSystemEdition = (isProService?: boolean): 'community' | 'pro' =>
  isProService ? 'pro' : 'community';

/**
 * 是否为开源社区版部署。
 */
export const isCommunityEdition = (isProService?: boolean): boolean => !isProService;

/**
 * 是否为商业版部署。
 */
export const isProEdition = (isProService?: boolean): boolean => !!isProService;

// 预构建各版本允许访问的配置 Key 集合，实现 O(1) 快速检索
const allowedKeysByEdition: Record<SystemInstanceConfigEdition, Set<string>> = {
  community: new Set(
    systemInstanceConfigRegistry
      .filter((item) => item.edition === 'all' || item.edition === 'community')
      .map((item) => item.key)
  ),
  pro: new Set(systemInstanceConfigRegistry.map((item) => item.key)),
  all: new Set(systemInstanceConfigRegistry.map((item) => item.key))
};

/**
 * 判断指定完整配置 Key（如 "commercial.showCoupon"）在给定版本下是否允许可见和配置。
 */
export const isConfigFieldAllowed = (
  key: string,
  edition: SystemInstanceConfigEdition
): boolean => {
  const allowedSet = allowedKeysByEdition[edition] ?? allowedKeysByEdition.community;
  return allowedSet.has(key);
};

/**
 * 获取指定 Domain 下当前版本所有被允许的相对字段路径集合。
 * 例如 domain="commercial", edition="community" -> 空集合；
 * domain="site", edition="community" -> Set { "name", "description", ... }
 */
export const getDomainAllowedKeys = (
  domain: SystemInstanceConfigDomainKey,
  edition: SystemInstanceConfigEdition
): Set<string> => {
  const allowedSet = allowedKeysByEdition[edition] ?? allowedKeysByEdition.community;
  const prefix = `${domain}.`;
  const result = new Set<string>();

  for (const key of allowedSet) {
    if (key.startsWith(prefix)) {
      result.add(key.slice(prefix.length));
    }
  }

  return result;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(value instanceof RegExp);

/**
 * 递归清洗某个 Domain 的配置数据或 overrides 对象，
 * 剔除当前版本下不允许访问的字段，防止商业版配置被开源版读取或越权写入。
 */
export const filterDomainDataByEdition = <T>(
  domain: SystemInstanceConfigDomainKey,
  data: T,
  edition: SystemInstanceConfigEdition
): Partial<T> => {
  if (!isPlainObject(data)) {
    return data;
  }

  const allowedRelativeKeys = getDomainAllowedKeys(domain, edition);

  const cleanObject = (obj: Record<string, unknown>, currentPath = ''): Record<string, unknown> => {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;

      const path = currentPath ? `${currentPath}.${key}` : key;

      if (isPlainObject(value)) {
        const cleanedNested = cleanObject(value, path);
        if (Object.keys(cleanedNested).length > 0) {
          result[key] = cleanedNested;
        }
      } else {
        // 叶子节点：检查是否在当前版本允许列表中
        if (allowedRelativeKeys.has(path)) {
          result[key] = value;
        }
      }
    }

    return result;
  };

  return cleanObject(data) as Partial<T>;
};

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

export const SECRET_MASK = '******';

const secretKeysByDomain: Record<SystemInstanceConfigDomainKey, Set<string>> = (() => {
  const result: Record<string, Set<string>> = {};
  for (const item of systemInstanceConfigRegistry) {
    if (!item.secret) continue;
    const [domain, ...rest] = item.key.split('.');
    const relativeKey = rest.join('.');
    if (!result[domain]) {
      result[domain] = new Set();
    }
    result[domain].add(relativeKey);
  }
  return result as Record<SystemInstanceConfigDomainKey, Set<string>>;
})();

/**
 * 获取指定 Domain 下所有标记为 secret: true 的相对字段路径。
 */
export const getDomainSecretKeys = (domain: SystemInstanceConfigDomainKey): Set<string> => {
  return secretKeysByDomain[domain] ?? new Set();
};

/**
 * 对配置数据中的敏感字段进行脱敏，非空敏感字符串替换为 '******'。
 */
export const maskDomainSecrets = <T>(domain: SystemInstanceConfigDomainKey, data: T): T => {
  if (!isPlainObject(data)) {
    return data;
  }

  const secretKeys = getDomainSecretKeys(domain);
  if (secretKeys.size === 0) {
    return structuredClone(data);
  }

  const maskObject = (obj: Record<string, unknown>, currentPath = ''): Record<string, unknown> => {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;

      const path = currentPath ? `${currentPath}.${key}` : key;

      if (isPlainObject(value)) {
        result[key] = maskObject(value, path);
      } else if (secretKeys.has(path) && typeof value === 'string' && value.trim().length > 0) {
        result[key] = SECRET_MASK;
      } else {
        result[key] = value;
      }
    }

    return result;
  };

  return maskObject(data) as T;
};

/**
 * 当客户端提交保存时，若敏感字段提交了掩码 '******'，则自动从上一版本恢复已有密钥，避免误覆写。
 */
export const restorePreservedSecrets = <T>(
  domain: SystemInstanceConfigDomainKey,
  submitted: T,
  previous?: unknown
): T => {
  if (!isPlainObject(submitted) || !isPlainObject(previous)) {
    return submitted;
  }

  const secretKeys = getDomainSecretKeys(domain);
  if (secretKeys.size === 0) {
    return submitted;
  }

  const restoreObject = (
    subObj: Record<string, unknown>,
    prevObj: Record<string, unknown>,
    currentPath = ''
  ): Record<string, unknown> => {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(subObj)) {
      if (value === undefined) continue;

      const path = currentPath ? `${currentPath}.${key}` : key;
      const prevValue = prevObj[key];

      if (isPlainObject(value)) {
        result[key] = isPlainObject(prevValue) ? restoreObject(value, prevValue, path) : value;
      } else if (secretKeys.has(path) && value === SECRET_MASK && typeof prevValue === 'string') {
        result[key] = prevValue;
      } else {
        result[key] = value;
      }
    }

    return result;
  };

  return restoreObject(submitted, previous) as T;
};

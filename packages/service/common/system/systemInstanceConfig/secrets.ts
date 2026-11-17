import type { SystemInstanceConfigScopeKey } from '@fastgpt/global/common/system/config/schema';
import { getDomainSecretKeys } from '@fastgpt/global/common/system/config/permission';
import { decryptSecret, encryptSecret } from '../../secret/aes256gcm';

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/** 只遍历注册表声明的密钥叶子，不将普通对象中同名的 secret 字段视为密文。 */
const transformDomainSecrets = <T>({
  domain,
  data,
  transform
}: {
  domain: SystemInstanceConfigScopeKey;
  data: T;
  transform: (value: unknown, path: string) => unknown;
}): T => {
  const keys = getDomainSecretKeys(domain);
  const walk = (value: unknown, path = ''): unknown => {
    if (keys.has(path)) return transform(value, path);
    if (!isObject(value)) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, walk(child, path ? `${path}.${key}` : key)])
    );
  };
  return walk(data) as T;
};

/** 解密一个持久化密钥，仅暴露字段路径作为错误上下文。 */
const decryptStoredSecret = (value: Record<string, unknown>, field: string): string => {
  if (
    Object.keys(value).length !== 1 ||
    typeof value.secret !== 'string' ||
    !/^[0-9a-f]{32}:[0-9a-f]+:[0-9a-f]{32}$/.test(value.secret)
  ) {
    throw new Error(`Invalid stored configuration secret: ${field}`);
  }
  try {
    return decryptSecret(value.secret);
  } catch {
    throw new Error(`Unable to decrypt configuration secret: ${field}`);
  }
};

/** 读取边界解密，兼容旧字符串；损坏字段保留原值并告警，允许管理员读取和修复。 */
export const decryptDomainSecrets = <T>(domain: SystemInstanceConfigScopeKey, data: T): T =>
  transformDomainSecrets({
    domain,
    data,
    transform: (value, path) => {
      if (!isObject(value)) return value;
      try {
        return decryptStoredSecret(value, `${domain}.${path}`);
      } catch {
        console.warn('Invalid stored configuration secret retained', { path: `${domain}.${path}` });
        return value;
      }
    }
  });

/** 持久化边界加密；未改变的密钥复用旧密文，确保补迁重跑不制造 revision 变更。 */
export const encryptDomainSecrets = <T>({
  domain,
  data,
  previousStored
}: {
  domain: SystemInstanceConfigScopeKey;
  data: T;
  previousStored?: unknown;
}): T => {
  const previousAt = (path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>((value, key) => (isObject(value) ? value[key] : undefined), previousStored);

  return transformDomainSecrets({
    domain,
    data,
    transform: (value, path) => {
      if (value === undefined || value === '') return value;
      if (isObject(value)) {
        // 已有 wrapper 不重复加密；损坏值仅告警，保存边界仍拒绝客户端提交密文。
        try {
          decryptStoredSecret(value, `${domain}.${path}`);
        } catch {
          console.warn('Invalid migrated configuration secret retained', {
            path: `${domain}.${path}`
          });
        }
        return { ...value };
      }
      if (typeof value !== 'string') {
        console.warn('Invalid migrated configuration secret retained', {
          path: `${domain}.${path}`
        });
        return value;
      }
      const previous = previousAt(path);
      if (isObject(previous)) {
        try {
          if (decryptStoredSecret(previous, `${domain}.${path}`) === value)
            return { secret: previous.secret };
        } catch {
          // 管理员替换损坏的旧凭据时允许使用新值修复，不保留错误密文。
        }
      }
      return { secret: encryptSecret(value) };
    }
  });
};

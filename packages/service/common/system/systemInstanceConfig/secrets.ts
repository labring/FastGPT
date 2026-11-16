import type { SystemInstanceConfigScopeKey } from '@fastgpt/global/common/system/config/schema';
import { getDomainSecretKeys } from '@fastgpt/global/common/system/config/permission';
import { decryptSecret, encryptSecret } from '../../secret/aes256gcm';

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/** 只遍历注册表声明的密钥叶子，不将普通对象中同名的 secret 字段视为密文。 */
const transformDomainSecrets = <T>(
  domain: SystemInstanceConfigScopeKey,
  data: T,
  transform: (value: unknown, path: string) => unknown
): T => {
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

/** 读取边界解密，兼容迁移前的字符串；错误密文必须失败，避免静默发布缺少凭据的快照。 */
export const decryptDomainSecrets = <T>(domain: SystemInstanceConfigScopeKey, data: T): T =>
  transformDomainSecrets(domain, data, (value, path) =>
    isObject(value) ? decryptStoredSecret(value, `${domain}.${path}`) : value
  );

/** 持久化边界加密；未改变的密钥复用旧密文，确保补迁重跑不制造 revision 变更。 */
export const encryptDomainSecrets = <T>(
  domain: SystemInstanceConfigScopeKey,
  data: T,
  previousStored?: unknown
): T => {
  const previousAt = (path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>((value, key) => (isObject(value) ? value[key] : undefined), previousStored);

  return transformDomainSecrets(domain, data, (value, path) => {
    if (value === undefined || value === '') return value;
    if (isObject(value)) {
      // 只接受真实可解密的 wrapper，保留密文，避免重复加密。
      decryptStoredSecret(value, `${domain}.${path}`);
      return { ...value };
    }
    if (typeof value !== 'string')
      throw new Error(`Invalid configuration secret: ${domain}.${path}`);
    const previous = previousAt(path);
    if (isObject(previous) && decryptStoredSecret(previous, `${domain}.${path}`) === value) {
      return { secret: previous.secret };
    }
    return { secret: encryptSecret(value) };
  });
};

export const FASTGPT_REDIS_PREFIX = 'fastgpt:';

declare const redisLogicalKeyBrand: unique symbol;
declare const redisPhysicalKeyBrand: unique symbol;

export type RedisLogicalKey = string & { readonly [redisLogicalKeyBrand]: true };
export type RedisPhysicalKey = string & { readonly [redisPhysicalKeyBrand]: true };

type RedisKeySegment = string | number;

const namespacePattern = /^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*$/;

const encodeRedisKeySegment = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );

const escapeRedisGlob = (value: string) => value.replace(/[*?[\]\\]/g, '\\$&');

const ensureLogicalKey = (key: string) => {
  if (!key) {
    throw new Error('Redis logical key must not be empty');
  }
  if (key.startsWith(FASTGPT_REDIS_PREFIX)) {
    throw new Error('Redis logical key must not include the physical prefix');
  }
  return key as RedisLogicalKey;
};

/** 构造新业务使用的逻辑 key；segment 使用 RFC3986 编码，禁止 Redis glob 字符泄漏。 */
export const createRedisLogicalKey = ({
  namespace,
  version,
  segments = []
}: {
  namespace: string;
  version?: number;
  segments?: readonly RedisKeySegment[];
}): RedisLogicalKey => {
  if (!namespacePattern.test(namespace)) {
    throw new Error('Redis key namespace contains unsupported characters');
  }
  if (version !== undefined && (!Number.isSafeInteger(version) || version < 1)) {
    throw new Error('Redis key version must be a positive integer');
  }

  const encodedSegments = segments.map((segment) => {
    const value = String(segment);
    if (!value) {
      throw new Error('Redis key segment must not be empty');
    }
    return encodeRedisKeySegment(value);
  });
  const keyParts = [
    namespace,
    ...(version === undefined ? [] : [`v${version}`]),
    ...encodedSegments
  ];

  return ensureLogicalKey(keyParts.join(':'));
};

/** 将历史调用方传入的逻辑 key 收窄为 RedisLogicalKey，不改变现有 key 格式。 */
export const asRedisLogicalKey = (key: string): RedisLogicalKey => ensureLogicalKey(key);

/** 显式添加 FastGPT 物理前缀，替代业务代码依赖 ioredis keyPrefix。 */
export const toPhysicalRedisKey = (key: string): RedisPhysicalKey =>
  `${FASTGPT_REDIS_PREFIX}${ensureLogicalKey(key)}` as RedisPhysicalKey;

/** 只移除 key 开头的 FastGPT 前缀，拒绝读取其他应用的物理 key。 */
export const toLogicalRedisKey = (key: string): RedisLogicalKey => {
  if (!key.startsWith(FASTGPT_REDIS_PREFIX)) {
    throw new Error('Redis physical key does not belong to the FastGPT keyspace');
  }
  return ensureLogicalKey(key.slice(FASTGPT_REDIS_PREFIX.length));
};

/** 为历史“删除某前缀下全部子 key”语义生成物理 SCAN pattern。 */
export const createChildRedisScanPattern = (logicalPrefix: string): string =>
  `${escapeRedisGlob(toPhysicalRedisKey(logicalPrefix))}:*`;

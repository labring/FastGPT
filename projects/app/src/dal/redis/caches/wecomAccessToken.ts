import {
  asRedisLogicalKey,
  RedisInvalidArgumentError,
  redisCacheAdapter,
  type RedisCacheAdapter
} from '@fastgpt/dal/redis/adapter';

const ACCESS_TOKEN_TTL_SAFETY_SECONDS = 10;

const accessTokenKeys = {
  provider: asRedisLogicalKey('wecom:provider_access_token'),
  suite: asRedisLogicalKey('wecom:suite_access_token')
} as const;

export type WecomAccessTokenCacheOptions = {
  redis?: RedisCacheAdapter;
};

type AccessTokenKind = keyof typeof accessTokenKeys;

type SetAccessTokenParams = {
  token: string;
  expiresInSeconds: number;
};

/**
 * 企业微信 access token Cache。
 *
 * provider 与 suite token 使用独立历史 key，但共享 `expires_in - 10` 秒的 TTL 合同。
 * Cache 不负责上游请求、刷新合并或提前失效后的重试，Redis 错误全部向调用方传播。
 */
export class WecomAccessTokenCache {
  private readonly redis: RedisCacheAdapter;

  constructor({ redis = redisCacheAdapter }: WecomAccessTokenCacheOptions = {}) {
    this.redis = redis;
  }

  private get = async (kind: AccessTokenKind) => {
    const token = await this.redis.get(accessTokenKeys[kind]);
    return token ?? undefined;
  };

  private set = ({
    kind,
    token,
    expiresInSeconds
  }: SetAccessTokenParams & { kind: AccessTokenKind }) => {
    if (
      !Number.isSafeInteger(expiresInSeconds) ||
      expiresInSeconds <= ACCESS_TOKEN_TTL_SAFETY_SECONDS
    ) {
      throw new RedisInvalidArgumentError({
        operation: 'wecomAccessToken.set',
        message: 'expiresInSeconds must be an integer greater than 10'
      });
    }

    return this.redis.set({
      key: accessTokenKeys[kind],
      value: token,
      ttlMs: (expiresInSeconds - ACCESS_TOKEN_TTL_SAFETY_SECONDS) * 1000
    });
  };

  /** 读取 provider access token；key 不存在时返回 undefined。 */
  getProvider = () => this.get('provider');

  /** 保存 provider access token，并预留 10 秒安全窗口。 */
  setProvider = (params: SetAccessTokenParams) => this.set({ kind: 'provider', ...params });

  /** 读取 suite access token；key 不存在时返回 undefined。 */
  getSuite = () => this.get('suite');

  /** 保存 suite access token，并预留 10 秒安全窗口。 */
  setSuite = (params: SetAccessTokenParams) => this.set({ kind: 'suite', ...params });
}

export const wecomAccessTokenCache = new WecomAccessTokenCache();

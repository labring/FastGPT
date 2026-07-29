import { createHash } from 'node:crypto';
import { asRedisLogicalKey, redisCacheAdapter, type RedisCacheAdapter } from '../adapter';
import type { RedisCacheLogger } from '../types';

const TOKEN_SAFE_WINDOW_SECONDS = 5 * 60;

type AccessTokenResponse = {
  accessToken: string;
  expireIn: number;
};

type DingtalkAccessTokenServer = {
  appKey: string;
  appSecret?: string;
};

export type DingtalkAccessTokenCacheOptions = {
  redis?: RedisCacheAdapter;
  logger: RedisCacheLogger<'warn'>;
};

/**
 * Dingtalk access token Cache。
 *
 * Cache 保持历史物理 key、动态 TTL 和进程内 single-flight。Redis 读写失败按缓存
 * miss 降级，不阻断上游 token 获取；上游错误仍原样抛给调用方。
 */
export class DingtalkAccessTokenCache {
  private readonly redis: RedisCacheAdapter;
  private readonly logger: RedisCacheLogger<'warn'>;
  private readonly refreshingTokenMap = new Map<string, Promise<string>>();

  constructor({ redis = redisCacheAdapter, logger }: DingtalkAccessTokenCacheOptions) {
    this.redis = redis;
    this.logger = logger;
  }

  private getCacheKey = ({ appKey, appSecret }: DingtalkAccessTokenServer) => {
    const secretHash = createHash('sha256')
      .update(appSecret ?? '')
      .digest('hex')
      .slice(0, 12);
    return asRedisLogicalKey(`cache:dataset:dingtalk:accessToken:${appKey}:${secretHash}`);
  };

  /** 读取缓存或合并并发刷新；Redis 只承担加速，不作为 token 事实来源。 */
  async getOrRefresh({
    server,
    fetchToken
  }: {
    server: DingtalkAccessTokenServer;
    fetchToken: () => Promise<AccessTokenResponse>;
  }) {
    const cacheKey = this.getCacheKey(server);

    try {
      const cachedToken = await this.redis.get(cacheKey);
      if (cachedToken) return cachedToken;
    } catch (error) {
      this.logger.warn('DingTalk accessToken cache read failed', {
        provider: 'dingtalk',
        appKey: server.appKey,
        error
      });
    }

    const refreshingToken = this.refreshingTokenMap.get(cacheKey);
    if (refreshingToken) return refreshingToken;

    const refreshPromise = (async () => {
      try {
        const { accessToken, expireIn } = await fetchToken();
        const ttlSeconds = Math.max(expireIn - TOKEN_SAFE_WINDOW_SECONDS, 60);

        try {
          await this.redis.set({
            key: cacheKey,
            value: accessToken,
            ttlMs: ttlSeconds * 1000
          });
        } catch (error) {
          this.logger.warn('DingTalk accessToken cache write failed', {
            provider: 'dingtalk',
            appKey: server.appKey,
            ttl: ttlSeconds,
            error
          });
        }

        return accessToken;
      } catch (error) {
        await this.redis.delete(cacheKey).catch(() => undefined);
        throw error;
      } finally {
        this.refreshingTokenMap.delete(cacheKey);
      }
    })();

    this.refreshingTokenMap.set(cacheKey, refreshPromise);
    return refreshPromise;
  }
}

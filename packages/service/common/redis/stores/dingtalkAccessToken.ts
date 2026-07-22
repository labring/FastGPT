import { createHash } from 'node:crypto';
import { redisCapabilities, type RedisStringCapability } from '../capability';
import { asRedisLogicalKey } from '../runtime/keyspace';
import { getLogger, LogCategories } from '../../logger';

const TOKEN_SAFE_WINDOW_SECONDS = 5 * 60;

type AccessTokenResponse = {
  accessToken: string;
  expireIn: number;
};

type DingtalkAccessTokenServer = {
  appKey: string;
  appSecret?: string;
};

type AccessTokenStoreLogger = {
  warn: (message: string, metadata: Record<string, unknown>) => void;
};

type DingtalkAccessTokenStoreDependencies = {
  stringStore?: Pick<RedisStringCapability, 'delete' | 'get' | 'set'>;
  logger?: AccessTokenStoreLogger;
};

/**
 * 创建 Dingtalk access token Store。
 *
 * Store 保持历史物理 key、动态 TTL 和进程内 single-flight。Redis 读写失败按缓存 miss
 * 降级，不阻断上游 token 获取；上游错误仍原样抛给调用方。
 */
export const createDingtalkAccessTokenStore = ({
  stringStore = redisCapabilities.string,
  logger = getLogger(LogCategories.MODULE.DATASET.API_DATASET)
}: DingtalkAccessTokenStoreDependencies = {}) => {
  const refreshingTokenMap = new Map<string, Promise<string>>();

  const getCacheKey = ({ appKey, appSecret }: DingtalkAccessTokenServer) => {
    const secretHash = createHash('sha256')
      .update(appSecret ?? '')
      .digest('hex')
      .slice(0, 12);
    return asRedisLogicalKey(`cache:dataset:dingtalk:accessToken:${appKey}:${secretHash}`);
  };

  return {
    /** 读取缓存或合并并发刷新；Redis 只承担加速，不作为 token 事实来源。 */
    getOrRefresh: async ({
      server,
      fetchToken
    }: {
      server: DingtalkAccessTokenServer;
      fetchToken: () => Promise<AccessTokenResponse>;
    }) => {
      const cacheKey = getCacheKey(server);

      try {
        const cachedToken = await stringStore.get(cacheKey);
        if (cachedToken) return cachedToken;
      } catch (error) {
        logger.warn('DingTalk accessToken cache read failed', {
          provider: 'dingtalk',
          appKey: server.appKey,
          error
        });
      }

      const refreshingToken = refreshingTokenMap.get(cacheKey);
      if (refreshingToken) return refreshingToken;

      const refreshPromise = (async () => {
        try {
          const { accessToken, expireIn } = await fetchToken();
          const ttlSeconds = Math.max(expireIn - TOKEN_SAFE_WINDOW_SECONDS, 60);

          try {
            await stringStore.set({
              key: cacheKey,
              value: accessToken,
              ttlMs: ttlSeconds * 1000
            });
          } catch (error) {
            logger.warn('DingTalk accessToken cache write failed', {
              provider: 'dingtalk',
              appKey: server.appKey,
              ttl: ttlSeconds,
              error
            });
          }

          return accessToken;
        } catch (error) {
          await stringStore.delete(cacheKey).catch(() => undefined);
          throw error;
        } finally {
          refreshingTokenMap.delete(cacheKey);
        }
      })();

      refreshingTokenMap.set(cacheKey, refreshPromise);
      return refreshPromise;
    }
  };
};

export const dingtalkAccessTokenStore = createDingtalkAccessTokenStore();

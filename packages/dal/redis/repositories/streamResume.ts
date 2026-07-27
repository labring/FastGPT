import {
  asRedisLogicalKey,
  redisRepositoryAdapter,
  type RedisLogicalKey,
  type RedisStoreAdapter,
  type RedisStreamEntry
} from '../adapter';
import { PositiveSafeIntegerSchema } from '../runtime/schema';
import { z } from 'zod';

const STREAM_RESUME_NAMESPACE = 'stream:resume';

export const StreamResumeParamsSchema = z.object({
  teamId: z.string().min(1),
  sourceType: z.string().min(1),
  sourceId: z.string().min(1),
  chatId: z.string().min(1)
});
export type StreamResumeParams = z.infer<typeof StreamResumeParamsSchema>;

export const StreamResumeUnavailableStateSchema = z.object({
  reason: z.string().min(1)
});
export type StreamResumeUnavailableState = z.infer<typeof StreamResumeUnavailableStateSchema>;

export const StreamResumeActiveStateSchema = z.object({
  updatedAt: PositiveSafeIntegerSchema
});
export type StreamResumeActiveState = z.infer<typeof StreamResumeActiveStateSchema>;

export type StreamResumeKeys = {
  keyOfStream: RedisLogicalKey;
  keyOfUnavailable: RedisLogicalKey;
  keyOfActive: RedisLogicalKey;
};

export type StreamResumeRepositoryLogger = {
  error: (message: string, metadata: Record<string, unknown>) => void;
};

export type StreamResumeRepositoryDependencies = {
  redis?: Pick<
    RedisStoreAdapter,
    | 'appendStreamEntry'
    | 'createBlockingStreamReader'
    | 'delete'
    | 'expireStream'
    | 'get'
    | 'rangeStream'
    | 'set'
  >;
  logger: StreamResumeRepositoryLogger;
  streamTtlSeconds: number;
  postCompleteTtlSeconds: number;
  ttlTouchIntervalMs: number;
};

type StreamResumeBlockingReader = ReturnType<RedisStoreAdapter['createBlockingStreamReader']>;

const parsePositiveConfig = ({
  operation,
  field,
  value
}: {
  operation: string;
  field: string;
  value: number;
}) => {
  const parsed = PositiveSafeIntegerSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${operation}.${field} must be a positive safe integer`);
  }
  return parsed.data;
};

/**
 * 创建 Stream Resume Repository。
 *
 * Repository 固定历史 stream/state key 和 TTL，负责镜像写入的顺序、Stream 返回解析以及
 * blocking reader 生命周期；HTTP/SSE response 和终止事件由 service 层继续编排。
 */
export const createStreamResumeRepository = ({
  redis = redisRepositoryAdapter,
  logger,
  streamTtlSeconds,
  postCompleteTtlSeconds,
  ttlTouchIntervalMs
}: StreamResumeRepositoryDependencies) => {
  const parsedStreamTtlSeconds = parsePositiveConfig({
    operation: 'streamResume',
    field: 'streamTtlSeconds',
    value: streamTtlSeconds
  });
  const parsedPostCompleteTtlSeconds = parsePositiveConfig({
    operation: 'streamResume',
    field: 'postCompleteTtlSeconds',
    value: postCompleteTtlSeconds
  });
  const parsedTtlTouchIntervalMs = parsePositiveConfig({
    operation: 'streamResume',
    field: 'ttlTouchIntervalMs',
    value: ttlTouchIntervalMs
  });

  const parseParams = (params: StreamResumeParams): StreamResumeParams =>
    StreamResumeParamsSchema.parse(params);

  const getKeys = (params: StreamResumeParams): StreamResumeKeys => {
    const parsed = parseParams(params);
    const { teamId, sourceType, sourceId, chatId } = parsed;
    return {
      keyOfStream: asRedisLogicalKey(
        `${STREAM_RESUME_NAMESPACE}:data:${teamId}:${sourceType}:${sourceId}:${chatId}`
      ),
      keyOfUnavailable: asRedisLogicalKey(
        `${STREAM_RESUME_NAMESPACE}:unavailable:${teamId}:${sourceType}:${sourceId}:${chatId}`
      ),
      keyOfActive: asRedisLogicalKey(
        `${STREAM_RESUME_NAMESPACE}:active:${teamId}:${sourceType}:${sourceId}:${chatId}`
      )
    };
  };

  const touchState = async (keys: StreamResumeKeys) => {
    await Promise.all([
      redis.expireStream({ key: keys.keyOfStream, ttlSeconds: parsedStreamTtlSeconds }),
      redis.set({
        key: keys.keyOfActive,
        value: JSON.stringify({ updatedAt: Date.now() } satisfies StreamResumeActiveState),
        ttlMs: parsedStreamTtlSeconds * 1000
      })
    ]);
  };

  const clearMirror = async (keys: StreamResumeKeys) => {
    await Promise.all([
      redis.delete(keys.keyOfUnavailable),
      redis.delete(keys.keyOfStream),
      redis.delete(keys.keyOfActive)
    ]);
  };

  const setUnavailable = async (
    params: StreamResumeParams,
    state: StreamResumeUnavailableState
  ) => {
    const parsedState = StreamResumeUnavailableStateSchema.parse(state);
    await redis.set({
      key: getKeys(params).keyOfUnavailable,
      value: JSON.stringify(parsedState),
      ttlMs: parsedStreamTtlSeconds * 1000
    });
  };

  return {
    getKeys,

    /** 读取 unavailable 状态；miss 由调用方解释为可继续读取 Stream。 */
    getUnavailable: async (params: StreamResumeParams) => {
      const value = await redis.get(getKeys(params).keyOfUnavailable);
      if (!value) return;

      try {
        const parsed = StreamResumeUnavailableStateSchema.safeParse(JSON.parse(value));
        return parsed.success ? parsed.data : undefined;
      } catch {
        return;
      }
    },

    /** 读取 active 状态；损坏 JSON 按 miss 处理。 */
    getActive: async (params: StreamResumeParams) => {
      const value = await redis.get(getKeys(params).keyOfActive);
      if (!value) return;

      try {
        const parsed = StreamResumeActiveStateSchema.safeParse(JSON.parse(value));
        return parsed.success ? parsed.data : undefined;
      } catch {
        return;
      }
    },

    setUnavailable,

    /** 创建一个顺序写入镜像；Redis 写入失败只记录日志并保持后续 flush 可完成。 */
    createMirror: (params: StreamResumeParams) => {
      const parsedParams = parseParams(params);
      const keys = getKeys(parsedParams);
      let queue: Promise<void> = clearMirror(keys).catch((error) => {
        logger.error('Failed to clear stream resume redis keys before mirror', {
          params: parsedParams,
          error
        });
      });
      let lastTouchedAt = 0;

      const enqueueRaw = (raw: string) => {
        queue = queue
          .then(async () => {
            await redis.appendStreamEntry({
              key: keys.keyOfStream,
              fields: { raw }
            });
            const now = Date.now();
            if (lastTouchedAt === 0 || now - lastTouchedAt >= parsedTtlTouchIntervalMs) {
              await touchState(keys);
              lastTouchedAt = now;
            }
          })
          .catch((error) => {
            logger.error('Failed to mirror stream response to redis', {
              params: parsedParams,
              error
            });
          });

        return queue;
      };

      return {
        ...keys,
        enqueueRaw,
        flush: async () => {
          await queue;
        },
        shrinkTTLAfterComplete: async () => {
          try {
            await Promise.all([
              redis.expireStream({
                key: keys.keyOfStream,
                ttlSeconds: parsedPostCompleteTtlSeconds
              }),
              redis.expireStream({
                key: keys.keyOfActive,
                ttlSeconds: parsedPostCompleteTtlSeconds
              })
            ]);
          } catch (error) {
            logger.error('Failed to shrink stream resume redis ttl', {
              params: parsedParams,
              error
            });
          }
        }
      };
    },

    /** 读取 history；返回值已脱离 Redis 的交替数组协议。 */
    range: async ({
      params,
      start,
      end,
      count
    }: {
      params: StreamResumeParams;
      start: string;
      end: string;
      count: number;
    }): Promise<RedisStreamEntry[]> =>
      redis.rangeStream({ key: getKeys(params).keyOfStream, start, end, count }),

    /**
     * 在 DAL 内运行请求级 blocking reader，并保证无论读取循环如何结束都会释放连接。
     * callback 只接收 typed reader，不会获得 raw ioredis client。
     */
    withBlockingReader: async <T>({
      params,
      blockMs,
      count,
      callback
    }: {
      params: StreamResumeParams;
      blockMs: number;
      count?: number;
      callback: (reader: StreamResumeBlockingReader) => Promise<T> | T;
    }): Promise<T> => {
      const reader = redis.createBlockingStreamReader({
        key: getKeys(params).keyOfStream,
        blockMs,
        count
      });
      try {
        return await callback(reader);
      } finally {
        await reader.close();
      }
    }
  };
};

export type StreamResumeRepository = ReturnType<typeof createStreamResumeRepository>;

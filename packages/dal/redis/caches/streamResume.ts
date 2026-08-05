import {
  asRedisLogicalKey,
  redisCacheAdapter,
  type RedisLogicalKey,
  type RedisCacheAdapter
} from '../adapter';
import { PositiveSafeIntegerSchema } from '../runtime/schema';
import type { RedisCacheLogger, RedisStreamEntry } from '../types';
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

export type StreamResumeCacheOptions = {
  redis?: RedisCacheAdapter;
  logger: RedisCacheLogger<'error'>;
  streamTtlSeconds: number;
  postCompleteTtlSeconds: number;
  ttlTouchIntervalMs: number;
};

type StreamResumeBlockingReader = ReturnType<RedisCacheAdapter['createBlockingStreamReader']>;

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
 * Stream Resume Cache。
 *
 * Cache 固定历史 stream/state key 和 TTL，负责镜像写入的顺序、Stream 返回解析以及
 * blocking reader 生命周期；HTTP/SSE response 和终止事件由 service 层继续编排。
 */
export class StreamResumeCache {
  private readonly redis: RedisCacheAdapter;
  private readonly logger: RedisCacheLogger<'error'>;
  private readonly parsedStreamTtlSeconds: number;
  private readonly parsedPostCompleteTtlSeconds: number;
  private readonly parsedTtlTouchIntervalMs: number;

  constructor({
    redis = redisCacheAdapter,
    logger,
    streamTtlSeconds,
    postCompleteTtlSeconds,
    ttlTouchIntervalMs
  }: StreamResumeCacheOptions) {
    this.redis = redis;
    this.logger = logger;
    this.parsedStreamTtlSeconds = parsePositiveConfig({
      operation: 'streamResume',
      field: 'streamTtlSeconds',
      value: streamTtlSeconds
    });
    this.parsedPostCompleteTtlSeconds = parsePositiveConfig({
      operation: 'streamResume',
      field: 'postCompleteTtlSeconds',
      value: postCompleteTtlSeconds
    });
    this.parsedTtlTouchIntervalMs = parsePositiveConfig({
      operation: 'streamResume',
      field: 'ttlTouchIntervalMs',
      value: ttlTouchIntervalMs
    });
  }

  private parseParams = (params: StreamResumeParams): StreamResumeParams =>
    StreamResumeParamsSchema.parse(params);

  getKeys = (params: StreamResumeParams): StreamResumeKeys => {
    const parsed = this.parseParams(params);
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

  private touchState = async (keys: StreamResumeKeys) => {
    await Promise.all([
      this.redis.expireStream({ key: keys.keyOfStream, ttlSeconds: this.parsedStreamTtlSeconds }),
      this.redis.set({
        key: keys.keyOfActive,
        value: JSON.stringify({ updatedAt: Date.now() } satisfies StreamResumeActiveState),
        ttlMs: this.parsedStreamTtlSeconds * 1000
      })
    ]);
  };

  private clearMirror = async (keys: StreamResumeKeys) => {
    await Promise.all([
      this.redis.delete(keys.keyOfUnavailable),
      this.redis.delete(keys.keyOfStream),
      this.redis.delete(keys.keyOfActive)
    ]);
  };

  /** 持久化当前请求无法创建镜像的原因。 */
  async setUnavailable(params: StreamResumeParams, state: StreamResumeUnavailableState) {
    const parsedState = StreamResumeUnavailableStateSchema.parse(state);
    await this.redis.set({
      key: this.getKeys(params).keyOfUnavailable,
      value: JSON.stringify(parsedState),
      ttlMs: this.parsedStreamTtlSeconds * 1000
    });
  }

  /** 读取 unavailable 状态；miss 由调用方解释为可继续读取 Stream。 */
  async getUnavailable(params: StreamResumeParams) {
    const value = await this.redis.get(this.getKeys(params).keyOfUnavailable);
    if (!value) return;

    try {
      const parsed = StreamResumeUnavailableStateSchema.safeParse(JSON.parse(value));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return;
    }
  }

  /** 读取 active 状态；损坏 JSON 按 miss 处理。 */
  async getActive(params: StreamResumeParams) {
    const value = await this.redis.get(this.getKeys(params).keyOfActive);
    if (!value) return;

    try {
      const parsed = StreamResumeActiveStateSchema.safeParse(JSON.parse(value));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return;
    }
  }

  /** 读取 Redis 内存水位；是否阻止创建镜像由 service 的运行策略决定。 */
  getMemoryInfo = () => this.redis.getMemoryInfo();

  /** 创建一个顺序写入镜像；Redis 写入失败只记录日志并保持后续 flush 可完成。 */
  createMirror(params: StreamResumeParams) {
    const parsedParams = this.parseParams(params);
    const keys = this.getKeys(parsedParams);
    let queue: Promise<void> = this.clearMirror(keys).catch((error) => {
      this.logger.error('Failed to clear stream resume redis keys before mirror', {
        params: parsedParams,
        error
      });
    });
    let lastTouchedAt = 0;

    const enqueueRaw = (raw: string) => {
      queue = queue
        .then(async () => {
          await this.redis.appendStreamEntry({
            key: keys.keyOfStream,
            fields: { raw }
          });
          const now = Date.now();
          if (lastTouchedAt === 0 || now - lastTouchedAt >= this.parsedTtlTouchIntervalMs) {
            await this.touchState(keys);
            lastTouchedAt = now;
          }
        })
        .catch((error) => {
          this.logger.error('Failed to mirror stream response to redis', {
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
            this.redis.expireStream({
              key: keys.keyOfStream,
              ttlSeconds: this.parsedPostCompleteTtlSeconds
            }),
            this.redis.expireStream({
              key: keys.keyOfActive,
              ttlSeconds: this.parsedPostCompleteTtlSeconds
            })
          ]);
        } catch (error) {
          this.logger.error('Failed to shrink stream resume redis ttl', {
            params: parsedParams,
            error
          });
        }
      }
    };
  }

  /** 读取 history；返回值已脱离 Redis 的交替数组协议。 */
  async range({
    params,
    start,
    end,
    count
  }: {
    params: StreamResumeParams;
    start: string;
    end: string;
    count: number;
  }): Promise<RedisStreamEntry[]> {
    return this.redis.rangeStream({ key: this.getKeys(params).keyOfStream, start, end, count });
  }

  /**
   * 在 DAL 内运行请求级 blocking reader，并保证无论读取循环如何结束都会释放连接。
   * callback 只接收 typed reader，不会获得 raw ioredis client。
   */
  async withBlockingReader<T>({
    params,
    blockMs,
    count,
    callback
  }: {
    params: StreamResumeParams;
    blockMs: number;
    count?: number;
    callback: (reader: StreamResumeBlockingReader) => Promise<T> | T;
  }): Promise<T> {
    const reader = this.redis.createBlockingStreamReader({
      key: this.getKeys(params).keyOfStream,
      blockMs,
      count
    });
    try {
      return await callback(reader);
    } finally {
      await reader.close();
    }
  }
}

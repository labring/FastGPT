import { z } from 'zod';
import {
  redisCacheAdapter,
  type RedisCacheAdapter,
  type RedisChannelSubscription
} from '../adapter';
import { createRedisLogicalKey, type RedisLogicalKey } from '../runtime/keyspace';
import type { RedisCacheLogger } from '../types';

export type SignalPubSubChannelOptions<TSchema extends z.ZodTypeAny> = {
  namespace: string;
  payloadSchema: TSchema;
  redis?: RedisCacheAdapter;
};

/**
 * 轻量 Redis Pub/Sub 信号通道（用于无状态唤醒通知，投递失败由外层 Cron 兜底）。
 */
export class SignalPubSubChannel<TSchema extends z.ZodTypeAny> {
  readonly channel: RedisLogicalKey;
  private readonly payloadSchema: TSchema;
  private readonly redis: RedisCacheAdapter;

  constructor({
    namespace,
    payloadSchema,
    redis = redisCacheAdapter
  }: SignalPubSubChannelOptions<TSchema>) {
    this.channel = createRedisLogicalKey({ namespace, segments: ['ch'] });
    this.payloadSchema = payloadSchema;
    this.redis = redis;
  }

  async publish(payload: z.input<TSchema>): Promise<number> {
    const validated = this.payloadSchema.parse(payload);
    return this.redis.publish({
      channel: this.channel,
      message: JSON.stringify(validated)
    });
  }

  subscribe({
    onMessage,
    onReconnect,
    logger
  }: {
    onMessage: (payload: z.output<TSchema>) => Promise<void> | void;
    onReconnect?: () => Promise<void> | void;
    logger?: RedisCacheLogger<'warn' | 'error'>;
  }): RedisChannelSubscription {
    return this.redis.createChannelSubscriber({
      channels: [this.channel],
      logger,
      onReconnect,
      onMessage: ({ message }) => {
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(message);
        } catch (error) {
          logger?.warn('Ignored malformed Redis signal payload', { channel: this.channel, error });
          return;
        }

        const result = this.payloadSchema.safeParse(parsedJson);
        if (!result.success) {
          logger?.warn('Ignored schema-mismatched Redis signal payload', {
            channel: this.channel,
            issues: result.error.issues
          });
          return;
        }

        return onMessage(result.data);
      }
    });
  }
}

export type RevisionSyncChannelOptions<TTopic extends string> = {
  namespace: string;
  topics: readonly TTopic[];
  redis?: RedisCacheAdapter;
};

/**
 * 基于 Redis `INCR` 修订号 + `PUBLISH` 广播的多实例状态同步通道。
 *
 * 写端先递增对应 topic 的单调 revision 再广播；订阅端断线重连或定期巡检时只需执行单次
 * `MGET` 比对修订号，即可在零数据库查询下捕获断线期间漏掉的变更。
 */
export class RevisionSyncChannel<TTopic extends string> {
  readonly channel: RedisLogicalKey;
  readonly topics: readonly TTopic[];
  private readonly topicSet: ReadonlySet<string>;
  private readonly topicRevKeys: Record<TTopic, RedisLogicalKey>;
  private readonly redis: RedisCacheAdapter;

  constructor({
    namespace,
    topics,
    redis = redisCacheAdapter
  }: RevisionSyncChannelOptions<TTopic>) {
    if (topics.length === 0) {
      throw new Error('RevisionSyncChannel requires at least one topic');
    }

    this.channel = createRedisLogicalKey({ namespace, segments: ['ch'] });
    this.topics = [...topics];
    this.topicSet = new Set(topics);
    this.redis = redis;

    const entries = topics.map((topic) => [
      topic,
      createRedisLogicalKey({ namespace, segments: ['rev', topic] })
    ]);
    this.topicRevKeys = Object.fromEntries(entries) as Record<TTopic, RedisLogicalKey>;
  }

  /** 递增指定 topic 的修订号并广播给所有在线订阅实例。 */
  async publish(topic: TTopic): Promise<number> {
    const revKey = this.topicRevKeys[topic];
    const revision = await this.redis.incr(revKey);
    await this.redis.publish({
      channel: this.channel,
      message: JSON.stringify({ topic, revision })
    });
    return revision;
  }

  /** 单次 `MGET` 读取全部 topic 当前修订号（未初始化返回 0）。 */
  async readRevisions(): Promise<Record<TTopic, number>> {
    const keys = this.topics.map((topic) => this.topicRevKeys[topic]);
    const rawValues = await this.redis.getMany(keys);
    const result = {} as Record<TTopic, number>;

    for (let i = 0; i < this.topics.length; i += 1) {
      const parsed = rawValues[i] === null ? 0 : Number(rawValues[i]);
      result[this.topics[i]] = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
    }
    return result;
  }

  async readRevision(topic: TTopic): Promise<number> {
    const rawValue = await this.redis.get(this.topicRevKeys[topic]);
    if (rawValue === null) {
      return 0;
    }
    const parsed = Number(rawValue);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  }

  subscribe({
    onTopicChanged,
    onReconnect,
    logger
  }: {
    onTopicChanged: (event: { topic: TTopic; revision: number }) => Promise<void> | void;
    onReconnect?: () => Promise<void> | void;
    logger?: RedisCacheLogger<'warn' | 'error'>;
  }): RedisChannelSubscription {
    const eventSchema = z.object({
      topic: z.string(),
      revision: z.number().int().positive()
    });

    return this.redis.createChannelSubscriber({
      channels: [this.channel],
      logger,
      onReconnect,
      onMessage: ({ message }) => {
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(message);
        } catch (error) {
          logger?.warn('Ignored malformed Redis revision payload', {
            channel: this.channel,
            error
          });
          return;
        }

        const result = eventSchema.safeParse(parsedJson);
        if (!result.success || !this.topicSet.has(result.data.topic)) {
          logger?.warn('Ignored invalid Redis revision payload', {
            channel: this.channel,
            issues: result.success ? undefined : result.error.issues
          });
          return;
        }

        return onTopicChanged({
          topic: result.data.topic as TTopic,
          revision: result.data.revision
        });
      }
    });
  }
}

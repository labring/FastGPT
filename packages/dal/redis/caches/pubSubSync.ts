import type { z } from 'zod';
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

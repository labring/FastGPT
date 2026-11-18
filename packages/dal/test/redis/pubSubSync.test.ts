import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  asRedisLogicalKey,
  redisCacheAdapter,
  RedisCacheAdapter
} from '@fastgpt/dal/redis/adapter';
import { RevisionSyncChannel, SignalPubSubChannel } from '@fastgpt/dal/redis/caches/pubSubSync';
import { closeRedisRuntime, configureRedisRuntime } from '@fastgpt/dal/redis/runtime';

class FakeSubscriberEmitter extends EventEmitter {
  status = 'ready';
  subscribe = vi.fn().mockResolvedValue(1);
  unsubscribe = vi.fn().mockResolvedValue(0);
  quit = vi.fn().mockResolvedValue('OK');
  disconnect = vi.fn();
}

describe('Redis Pub/Sub & RevisionSyncChannel', () => {
  afterEach(async () => {
    await closeRedisRuntime();
  });

  it('allocates dedicated subscriber connection on Runtime and closes it during shutdown', async () => {
    const commandClient = {
      status: 'ready',
      incr: vi.fn().mockResolvedValue(1),
      publish: vi.fn().mockResolvedValue(1),
      on: vi.fn(),
      quit: vi.fn().mockResolvedValue('OK'),
      disconnect: vi.fn()
    };
    const subscriberClient = new FakeSubscriberEmitter();
    const clientFactory = vi.fn((options: { maxRetriesPerRequest?: number | null }) =>
      options.maxRetriesPerRequest === null ? subscriberClient : commandClient
    );

    configureRedisRuntime({ redisUrl: 'redis://localhost', clientFactory: clientFactory as any });

    const channel = asRedisLogicalKey('system:sync:ch');
    const onMessage = vi.fn();
    const subscription = redisCacheAdapter.createChannelSubscriber({
      channels: [channel],
      onMessage
    });
    await subscription.ready;

    await expect(
      redisCacheAdapter.incr(asRedisLogicalKey('system:sync:rev:license'))
    ).resolves.toBe(1);
    await expect(redisCacheAdapter.publish({ channel, message: 'ping' })).resolves.toBe(1);

    expect(commandClient.incr).toHaveBeenCalledWith('fastgpt:system:sync:rev:license');
    expect(commandClient.publish).toHaveBeenCalledWith('fastgpt:system:sync:ch', 'ping');
    expect(subscriberClient.subscribe).toHaveBeenCalledWith('fastgpt:system:sync:ch');

    subscriberClient.emit('message', 'fastgpt:system:sync:ch', 'hello');
    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledWith({ channel, message: 'hello' }));

    await subscription.close();
    await subscription.close();
    expect(subscriberClient.unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscriberClient.quit).toHaveBeenCalledTimes(1);
  });

  it('triggers onReconnect only after disconnect followed by ready', async () => {
    const subscriberClient = new FakeSubscriberEmitter();
    const onMessage = vi.fn();
    const onReconnect = vi.fn();
    const adapter = new RedisCacheAdapter({
      getCommandClient: () => ({}) as any,
      createSubscriberConnection: () => subscriberClient as any,
      releaseConnection: vi.fn()
    });

    const sub = adapter.createChannelSubscriber({
      channels: [asRedisLogicalKey('sync:ch')],
      onMessage,
      onReconnect
    });
    await sub.ready;

    // 首次启动期间若未经历断线，ready 不触发补偿。
    subscriberClient.emit('ready');
    await Promise.resolve();
    expect(onReconnect).not.toHaveBeenCalled();

    // 断线后重连 ready 触发一次补偿。
    subscriberClient.emit('close');
    subscriberClient.emit('ready');
    await vi.waitFor(() => expect(onReconnect).toHaveBeenCalledTimes(1));

    subscriberClient.emit('reconnecting');
    subscriberClient.emit('ready');
    await vi.waitFor(() => expect(onReconnect).toHaveBeenCalledTimes(2));

    await sub.close();
    subscriberClient.emit('close');
    subscriberClient.emit('ready');
    subscriberClient.emit('message', 'fastgpt:sync:ch', 'ignored');
    await Promise.resolve();
    expect(onReconnect).toHaveBeenCalledTimes(2);
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('RevisionSyncChannel bumps revision, reads revisions via MGET, and validates messages', async () => {
    const subscriberClient = new FakeSubscriberEmitter();
    const commandClient = {
      incr: vi.fn().mockResolvedValue(3),
      publish: vi.fn().mockResolvedValue(2),
      mget: vi.fn().mockResolvedValue(['3', null])
    };
    const logger = { warn: vi.fn(), error: vi.fn() };
    const adapter = new RedisCacheAdapter({
      getCommandClient: () => commandClient as any,
      createSubscriberConnection: () => subscriberClient as any,
      releaseConnection: vi.fn()
    });

    const sync = new RevisionSyncChannel({
      namespace: 'system:sync',
      topics: ['systemConfig', 'appTemplates'] as const,
      redis: adapter
    });

    await expect(sync.publish('systemConfig')).resolves.toBe(3);
    expect(commandClient.incr).toHaveBeenCalledWith('fastgpt:system:sync:rev:systemConfig');
    expect(commandClient.publish).toHaveBeenCalledWith(
      'fastgpt:system:sync:ch',
      JSON.stringify({ topic: 'systemConfig', revision: 3 })
    );

    await expect(sync.readRevisions()).resolves.toEqual({
      systemConfig: 3,
      appTemplates: 0
    });

    const events: Array<{ topic: string; revision: number }> = [];
    const sub = sync.subscribe({
      logger,
      onTopicChanged: (event) => {
        events.push(event);
      }
    });
    await sub.ready;

    subscriberClient.emit('message', 'fastgpt:system:sync:ch', 'not-json');
    subscriberClient.emit(
      'message',
      'fastgpt:system:sync:ch',
      JSON.stringify({ topic: 'unknown', revision: 1 })
    );
    subscriberClient.emit(
      'message',
      'fastgpt:system:sync:ch',
      JSON.stringify({ topic: 'appTemplates', revision: 5 })
    );

    await vi.waitFor(() => expect(events).toEqual([{ topic: 'appTemplates', revision: 5 }]));
    expect(logger.warn).toHaveBeenCalledTimes(2);

    await sub.close();
  });

  it('SignalPubSubChannel validates schema on publish and ignores invalid subscriber JSON', async () => {
    const subscriberClient = new FakeSubscriberEmitter();
    const commandClient = {
      publish: vi.fn().mockResolvedValue(1)
    };
    const logger = { warn: vi.fn(), error: vi.fn() };
    const adapter = new RedisCacheAdapter({
      getCommandClient: () => commandClient as any,
      createSubscriberConnection: () => subscriberClient as any,
      releaseConnection: vi.fn()
    });

    const channel = new SignalPubSubChannel({
      namespace: 'dataset:training:wakeup',
      payloadSchema: z.object({ modes: z.array(z.string()).min(1) }),
      redis: adapter
    });

    await expect(channel.publish({ modes: ['qa', 'index'] })).resolves.toBe(1);
    expect(commandClient.publish).toHaveBeenCalledWith(
      'fastgpt:dataset:training:wakeup:ch',
      JSON.stringify({ modes: ['qa', 'index'] })
    );

    const received: Array<{ modes: string[] }> = [];
    const sub = channel.subscribe({
      logger,
      onMessage: (payload) => {
        received.push(payload);
      }
    });
    await sub.ready;

    subscriberClient.emit(
      'message',
      'fastgpt:dataset:training:wakeup:ch',
      JSON.stringify({ modes: [] })
    );
    subscriberClient.emit(
      'message',
      'fastgpt:dataset:training:wakeup:ch',
      JSON.stringify({ modes: ['parse'] })
    );

    await vi.waitFor(() => expect(received).toEqual([{ modes: ['parse'] }]));
    expect(logger.warn).toHaveBeenCalledOnce();
    await sub.close();
  });

  it('releases subscriber connection and detaches listeners when initial subscribe fails', async () => {
    const subscriberClient = new FakeSubscriberEmitter();
    subscriberClient.subscribe = vi.fn().mockRejectedValueOnce(new Error('subscribe boom'));
    const releaseConnection = vi.fn();
    const adapter = new RedisCacheAdapter({
      getCommandClient: () => ({}) as any,
      createSubscriberConnection: () => subscriberClient as any,
      releaseConnection
    });

    const sub = adapter.createChannelSubscriber({
      channels: [asRedisLogicalKey('sync:ch')],
      onMessage: vi.fn()
    });

    await expect(sub.ready).rejects.toThrow('subscribe boom');
    expect(releaseConnection).toHaveBeenCalledTimes(1);
    expect(subscriberClient.listenerCount('message')).toBe(0);
    expect(subscriberClient.listenerCount('ready')).toBe(0);
  });
});

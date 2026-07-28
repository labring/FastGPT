import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeRedisRuntime,
  configureRedisRuntime,
  createRedisRuntime,
  getConfiguredRedisRuntime,
  getRedisRuntime,
  type RedisClient,
  type RedisClientFactory
} from '@fastgpt/dal/redis/runtime';

class FakeRedisClient extends EventEmitter {
  status = 'connecting';
  readonly options: Record<string, unknown>;
  readonly ping = vi.fn(async () => 'PONG');
  readonly quit = vi.fn(async () => 'OK');
  readonly disconnect = vi.fn(() => undefined);

  constructor(options: Record<string, unknown>) {
    super();
    this.options = options;
  }
}

const createClientFactory = () => {
  const clients: FakeRedisClient[] = [];
  const factory: RedisClientFactory = ((options) => {
    const client = new FakeRedisClient(options as Record<string, unknown>);
    clients.push(client);
    return client as unknown as RedisClient;
  }) as RedisClientFactory;

  return { clients, factory };
};

afterEach(async () => {
  await closeRedisRuntime();
});

describe('createRedisRuntime', () => {
  it('creates role-specific clients with explicit command policies', () => {
    const { clients, factory } = createClientFactory();
    const runtime = createRedisRuntime({
      redisUrl: 'redis://user:password@localhost:6379/3',
      clientFactory: factory
    });

    const command = runtime.getCommandConnection();
    expect(runtime.getCommandConnection()).toBe(command);
    const blocking = runtime.createBlockingConnection();
    const queue = runtime.createQueueConnection();
    const worker = runtime.createWorkerConnection();

    expect(clients).toHaveLength(4);
    expect((command as unknown as FakeRedisClient).options).toMatchObject({
      autoResendUnfulfilledCommands: false,
      commandTimeout: 5_000,
      enableOfflineQueue: true,
      maxRetriesPerRequest: 1
    });
    expect((command as unknown as FakeRedisClient).options.keyPrefix).toBeUndefined();
    expect((blocking as unknown as FakeRedisClient).options).toMatchObject({
      autoResendUnfulfilledCommands: false,
      maxRetriesPerRequest: null
    });
    expect((blocking as unknown as FakeRedisClient).options.commandTimeout).toBeUndefined();
    expect((queue as unknown as FakeRedisClient).options).toMatchObject({
      maxRetriesPerRequest: 3
    });
    expect((worker as unknown as FakeRedisClient).options).toMatchObject({
      maxRetriesPerRequest: null
    });
    expect((queue as unknown as FakeRedisClient).options.keyPrefix).toBeUndefined();
    expect(runtime.getConnectionSnapshot().map(({ role }) => role)).toEqual([
      'command',
      'blocking',
      'queue',
      'worker'
    ]);
  });

  it('tracks connection lifecycle and removes ended clients', () => {
    const { clients, factory } = createClientFactory();
    const runtime = createRedisRuntime({ redisUrl: 'localhost:6379', clientFactory: factory });
    const client = runtime.getCommandConnection() as unknown as FakeRedisClient;

    client.emit('connect');
    expect(runtime.getConnectionSnapshot()[0]?.state).toBe('connected');
    client.emit('ready');
    expect(runtime.getConnectionSnapshot()[0]?.state).toBe('ready');
    client.emit('reconnecting');
    expect(runtime.getConnectionSnapshot()[0]?.state).toBe('reconnecting');
    client.emit('error', new Error('transient'));
    expect(runtime.getConnectionSnapshot()[0]?.lastErrorAt).toEqual(expect.any(Number));
    client.emit('close');
    expect(runtime.getConnectionSnapshot()[0]?.state).toBe('closed');
    client.emit('end');
    client.emit('error', new Error('late error after end'));

    expect(runtime.getConnectionSnapshot()).toEqual([]);
    expect(clients).toHaveLength(1);
    expect(runtime.getCommandConnection()).not.toBe(client);
  });

  it('supports health checks and rejects unexpected responses', async () => {
    const { clients, factory } = createClientFactory();
    const runtime = createRedisRuntime({ redisUrl: 'redis://localhost', clientFactory: factory });

    await expect(runtime.checkHealth()).resolves.toMatchObject({
      endpoint: { host: 'localhost', port: 6379 },
      latencyMs: expect.any(Number)
    });
    clients[0].ping.mockResolvedValueOnce('READY');
    await expect(runtime.checkHealth()).rejects.toThrow(
      'Redis health check returned an unexpected response'
    );
  });

  it('releases tracked connections once under concurrent cleanup and ignores unknown clients', async () => {
    const { factory } = createClientFactory();
    const runtime = createRedisRuntime({ redisUrl: 'redis://localhost', clientFactory: factory });
    const tracked = runtime.createBlockingConnection() as unknown as FakeRedisClient;
    const unknown = new FakeRedisClient({}) as unknown as RedisClient;
    let resolveQuit: ((value: string) => void) | undefined;
    tracked.quit.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveQuit = resolve;
        })
    );

    const firstClose = runtime.releaseConnection(tracked as unknown as RedisClient);
    const concurrentClose = runtime.releaseConnection(tracked as unknown as RedisClient);
    expect(concurrentClose).toBe(firstClose);
    resolveQuit?.('OK');
    await firstClose;
    await runtime.releaseConnection(unknown);
    tracked.emit('end');

    expect(tracked.quit).toHaveBeenCalledTimes(1);
    expect(runtime.getConnectionSnapshot()).toEqual([]);
  });

  it('falls back to disconnect when graceful close fails and is idempotent', async () => {
    const { factory } = createClientFactory();
    const runtime = createRedisRuntime({ redisUrl: 'redis://localhost', clientFactory: factory });
    const client = runtime.getCommandConnection() as unknown as FakeRedisClient;
    client.quit.mockRejectedValueOnce(new Error('close failed'));

    await runtime.close();
    await runtime.close();

    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(runtime.getConnectionSnapshot()).toEqual([]);
    expect(() => runtime.getCommandConnection()).toThrow('Redis runtime is closed');
  });

  it('runs before-close hooks and closes connections in role order', async () => {
    const { clients, factory } = createClientFactory();
    const runtime = createRedisRuntime({ redisUrl: 'redis://localhost', clientFactory: factory });
    const order: string[] = [];
    const command = runtime.getCommandConnection() as unknown as FakeRedisClient;
    const blocking = runtime.createBlockingConnection() as unknown as FakeRedisClient;
    const queue = runtime.createQueueConnection() as unknown as FakeRedisClient;
    const worker = runtime.createWorkerConnection() as unknown as FakeRedisClient;
    command.quit.mockImplementation(async () => {
      order.push('command');
      return 'OK';
    });
    blocking.quit.mockImplementation(async () => {
      order.push('blocking');
      return 'OK';
    });
    queue.quit.mockImplementation(async () => {
      order.push('queue');
      return 'OK';
    });
    worker.quit.mockImplementation(async () => {
      order.push('worker');
      return 'OK';
    });
    runtime.registerBeforeCloseHook({
      name: 'bullmq',
      close: () => {
        order.push('hook');
      }
    });

    await runtime.close();

    expect(order[0]).toBe('hook');
    expect(order.indexOf('blocking')).toBeLessThan(order.indexOf('worker'));
    expect(order.indexOf('blocking')).toBeLessThan(order.indexOf('queue'));
    expect(order.indexOf('worker')).toBeLessThan(order.indexOf('command'));
    expect(clients.every((client) => client.quit.mock.calls.length === 1)).toBe(true);
    expect(clients.every((client) => client.disconnect.mock.calls.length === 0)).toBe(true);
  });

  it('bounds health checks, close hooks, and graceful connection close', async () => {
    vi.useFakeTimers();
    try {
      const { clients, factory } = createClientFactory();
      const runtime = createRedisRuntime({
        redisUrl: 'redis://localhost',
        clientFactory: factory,
        healthCheckTimeoutMs: 10,
        closeTimeoutMs: 10,
        beforeCloseTimeoutMs: 10
      });
      const command = runtime.getCommandConnection() as unknown as FakeRedisClient;
      command.ping.mockImplementationOnce(() => new Promise(() => undefined));

      const healthAssertion = expect(runtime.checkHealth()).rejects.toThrow(
        'Redis health check timed out'
      );
      await vi.advanceTimersByTimeAsync(10);
      await healthAssertion;

      command.quit.mockImplementationOnce(() => new Promise(() => undefined));
      runtime.registerBeforeCloseHook({
        name: 'hanging-resource',
        close: () => new Promise(() => undefined)
      });
      const closePromise = runtime.close();
      expect(runtime.close()).toBe(closePromise);
      expect(() => runtime.createQueueConnection()).toThrow('Redis runtime is closing');

      await vi.advanceTimersByTimeAsync(20);
      await closePromise;

      expect(command.disconnect).toHaveBeenCalledTimes(1);
      expect(clients).toHaveLength(1);
      expect(runtime.getConnectionSnapshot()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows a registered before-close hook to be replaced or removed', async () => {
    const { factory } = createClientFactory();
    const runtime = createRedisRuntime({ redisUrl: 'redis://localhost', clientFactory: factory });
    const first = vi.fn();
    const replacement = vi.fn();
    const unregisterFirst = runtime.registerBeforeCloseHook({ name: 'resource', close: first });
    runtime.registerBeforeCloseHook({ name: 'resource', close: replacement });
    unregisterFirst();

    const removed = vi.fn();
    const unregisterRemoved = runtime.registerBeforeCloseHook({ name: 'removed', close: removed });
    unregisterRemoved();
    await runtime.close();

    expect(first).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
  });

  it('exposes reconnect policy without resending unknown command writes', () => {
    const { factory } = createClientFactory();
    const runtime = createRedisRuntime({ redisUrl: 'redis://localhost', clientFactory: factory });
    const client = runtime.getCommandConnection() as unknown as FakeRedisClient;
    const options = client.options as {
      retryStrategy: (attempt: number) => number;
      reconnectOnError: (error: Error) => boolean;
    };

    expect(options.retryStrategy(1)).toBe(50);
    expect(options.retryStrategy(30)).toBe(1500);
    expect(options.retryStrategy(100)).toBe(2000);
    expect(options.reconnectOnError(new Error('READONLY replica'))).toBe(true);
    expect(options.reconnectOnError(new Error('WRONGTYPE'))).toBe(false);
    expect(options.reconnectOnError('ECONNRESET' as unknown as Error)).toBe(true);
    expect(options.reconnectOnError(null as unknown as Error)).toBe(false);
  });

  it('requires explicit configuration before the shared Runtime can be read', () => {
    expect(getConfiguredRedisRuntime()).toBeUndefined();
    expect(() => getRedisRuntime()).toThrow('Redis runtime has not been configured');
  });

  it('reuses an identical process configuration without creating a connection', () => {
    const { factory } = createClientFactory();
    const runtime = configureRedisRuntime({
      redisUrl: ' redis://localhost ',
      clientFactory: factory
    });

    expect(configureRedisRuntime({ redisUrl: 'redis://localhost', clientFactory: factory })).toBe(
      runtime
    );
    expect(getRedisRuntime()).toBe(runtime);
    expect(runtime.getConnectionSnapshot()).toEqual([]);
  });

  it('rejects a runtime target change until the current instance is closed', async () => {
    const runtime = configureRedisRuntime({ redisUrl: 'redis://localhost' });

    expect(() => configureRedisRuntime({ redisUrl: 'redis://other-redis' })).toThrow(
      'Redis runtime is already configured with a different connection target'
    );

    await closeRedisRuntime();
    const replacement = configureRedisRuntime({ redisUrl: 'redis://other-redis' });
    expect(replacement).not.toBe(runtime);
  });

  it('replaces a registered Runtime that was closed directly', async () => {
    const runtime = configureRedisRuntime({ redisUrl: 'redis://localhost' });
    await runtime.close();

    const replacement = configureRedisRuntime({ redisUrl: 'redis://other-redis' });

    expect(replacement).not.toBe(runtime);
    expect(getConfiguredRedisRuntime()).toBe(replacement);
  });
});

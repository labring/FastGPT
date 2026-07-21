import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  checkRedisHealth,
  closeRedisConnections,
  createBlockingRedisConnection,
  createQueueRedisConnection,
  createRedisRuntime,
  createWorkerRedisConnection,
  getGlobalRedisConnection,
  getPhysicalRedisConnection,
  getRedisConnectionSnapshot,
  getRedisRuntime,
  type RedisClient,
  type RedisClientFactory
} from '@fastgpt/service/common/redis/runtime/connection';

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

const createCompatibleExistingClient = () => {
  const client = new FakeRedisClient({
    host: 'localhost',
    port: 6379,
    db: 0,
    username: null,
    password: null,
    keyPrefix: 'fastgpt:'
  });
  client.status = 'ready';
  return client;
};

describe('createRedisRuntime', () => {
  it('separates legacy logical-key and physical command clients with explicit policies', () => {
    const { clients, factory } = createClientFactory();
    const runtime = createRedisRuntime({
      redisUrl: 'redis://user:password@localhost:6379/3',
      clientFactory: factory
    });

    const legacyCommand = runtime.getLegacyCommandConnection();
    expect(runtime.getLegacyCommandConnection()).toBe(legacyCommand);
    const command = runtime.getCommandConnection();
    expect(runtime.getCommandConnection()).toBe(command);
    const blocking = runtime.createBlockingConnection();
    const queue = runtime.createQueueConnection();
    const worker = runtime.createWorkerConnection();

    expect(clients).toHaveLength(5);
    expect((legacyCommand as unknown as FakeRedisClient).options).toMatchObject({
      keyPrefix: 'fastgpt:',
      maxRetriesPerRequest: 3
    });
    expect((command as unknown as FakeRedisClient).options).toMatchObject({
      maxRetriesPerRequest: 3
    });
    expect((command as unknown as FakeRedisClient).options.keyPrefix).toBeUndefined();
    expect((blocking as unknown as FakeRedisClient).options).toMatchObject({
      maxRetriesPerRequest: null
    });
    expect((queue as unknown as FakeRedisClient).options).toMatchObject({
      maxRetriesPerRequest: 3
    });
    expect((worker as unknown as FakeRedisClient).options).toMatchObject({
      maxRetriesPerRequest: null
    });
    expect((queue as unknown as FakeRedisClient).options.keyPrefix).toBeUndefined();
    expect(runtime.getConnectionSnapshot().map(({ role }) => role)).toEqual([
      'legacy-command',
      'command',
      'blocking',
      'queue',
      'worker'
    ]);
  });

  it('tracks connection lifecycle and removes ended clients', () => {
    const { clients, factory } = createClientFactory();
    const runtime = createRedisRuntime({ redisUrl: 'localhost:6379', clientFactory: factory });
    const client = runtime.getLegacyCommandConnection() as unknown as FakeRedisClient;

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
    expect(runtime.getLegacyCommandConnection()).not.toBe(client);
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

  it('uses an existing command client for hot reload compatibility', () => {
    const { factory } = createClientFactory();
    const existingClient = createCompatibleExistingClient();
    const existing = existingClient as unknown as RedisClient;
    const runtime = createRedisRuntime({
      redisUrl: 'redis://localhost',
      clientFactory: factory,
      existingCommandClient: existing
    });

    expect(runtime.getLegacyCommandConnection()).toBe(existing);
    expect(runtime.getConnectionSnapshot()[0]?.role).toBe('legacy-command');
    expect(runtime.getConnectionSnapshot()[0]?.state).toBe('ready');

    existingClient.status = 'end';
    existingClient.emit('end');
    expect(runtime.getLegacyCommandConnection()).not.toBe(existing);
  });

  it('disconnects an incompatible hot-reload client instead of taking it over', () => {
    const { clients, factory } = createClientFactory();
    const existingClient = new FakeRedisClient({
      host: 'other-redis',
      port: 6379,
      keyPrefix: 'wrong:'
    });
    existingClient.status = 'ready';
    const runtime = createRedisRuntime({
      redisUrl: 'redis://localhost',
      clientFactory: factory,
      existingCommandClient: existingClient as unknown as RedisClient
    });

    const command = runtime.getLegacyCommandConnection();

    expect(command).not.toBe(existingClient);
    expect(existingClient.disconnect).toHaveBeenCalledTimes(1);
    expect(clients).toHaveLength(1);
  });

  it.each([
    ['connect', 'connected'],
    ['reconnecting', 'reconnecting'],
    ['close', 'closed']
  ] as const)('maps existing ioredis status %s to %s', (status, expected) => {
    const existingClient = createCompatibleExistingClient();
    existingClient.status = status;
    const runtime = createRedisRuntime({
      redisUrl: 'redis://localhost',
      existingCommandClient: existingClient as unknown as RedisClient
    });

    runtime.getLegacyCommandConnection();

    expect(runtime.getConnectionSnapshot()[0]?.state).toBe(expected);
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

  it('closes an existing hot-reload client even when it was never claimed', async () => {
    const existingClient = createCompatibleExistingClient();
    const runtime = createRedisRuntime({
      redisUrl: 'redis://localhost',
      existingCommandClient: existingClient as unknown as RedisClient
    });

    await runtime.close();

    expect(existingClient.quit).toHaveBeenCalledTimes(1);
    expect(runtime.getConnectionSnapshot()).toEqual([]);
  });

  it('runs before-close hooks and closes connections in role order', async () => {
    const { clients, factory } = createClientFactory();
    const runtime = createRedisRuntime({ redisUrl: 'redis://localhost', clientFactory: factory });
    const order: string[] = [];
    const legacy = runtime.getLegacyCommandConnection() as unknown as FakeRedisClient;
    const command = runtime.getCommandConnection() as unknown as FakeRedisClient;
    const blocking = runtime.createBlockingConnection() as unknown as FakeRedisClient;
    const queue = runtime.createQueueConnection() as unknown as FakeRedisClient;
    const worker = runtime.createWorkerConnection() as unknown as FakeRedisClient;
    legacy.quit.mockImplementation(async () => {
      order.push('legacy-command');
      return 'OK';
    });
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
    expect(order.indexOf('queue')).toBeLessThan(order.indexOf('legacy-command'));
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
    const client = runtime.getLegacyCommandConnection() as unknown as FakeRedisClient;
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

  it('delegates process-level helper functions to the shared runtime', async () => {
    const legacyCommand = new FakeRedisClient({}) as unknown as RedisClient;
    const command = new FakeRedisClient({}) as unknown as RedisClient;
    const blocking = new FakeRedisClient({}) as unknown as RedisClient;
    const queue = new FakeRedisClient({}) as unknown as RedisClient;
    const worker = new FakeRedisClient({}) as unknown as RedisClient;
    const runtime = {
      getLegacyCommandConnection: vi.fn(() => legacyCommand),
      getCommandConnection: vi.fn(() => command),
      createBlockingConnection: vi.fn(() => blocking),
      createQueueConnection: vi.fn(() => queue),
      createWorkerConnection: vi.fn(() => worker),
      getConnectionSnapshot: vi.fn(() => []),
      checkHealth: vi.fn(async () => ({ latencyMs: 1 })),
      close: vi.fn(async () => undefined)
    };
    global.redisRuntime = runtime as unknown as NonNullable<typeof global.redisRuntime>;

    expect(getRedisRuntime()).toBe(runtime);
    expect(getGlobalRedisConnection()).toBe(legacyCommand);
    expect(getPhysicalRedisConnection()).toBe(command);
    expect(createBlockingRedisConnection()).toBe(blocking);
    expect(createQueueRedisConnection()).toBe(queue);
    expect(createWorkerRedisConnection()).toBe(worker);
    expect(getRedisConnectionSnapshot()).toEqual([]);
    await expect(checkRedisHealth()).resolves.toEqual({ latencyMs: 1 });
  });

  it('lazily creates the process runtime without creating a connection', () => {
    global.redisRuntime = undefined;
    global.redisClient = null;

    const runtime = getRedisRuntime();

    expect(runtime.getConnectionSnapshot()).toEqual([]);
    global.redisRuntime = undefined;
  });

  it('clears the process globals after closing the shared runtime', async () => {
    const close = vi.fn(async () => undefined);
    global.redisRuntime = { close } as unknown as NonNullable<typeof global.redisRuntime>;
    global.redisClient = new FakeRedisClient({}) as unknown as RedisClient;

    await closeRedisConnections();

    expect(close).toHaveBeenCalledTimes(1);
    expect(global.redisRuntime).toBeUndefined();
    expect(global.redisClient).toBeNull();
  });

  it('does not create a runtime just to close and preserves a concurrently replaced runtime', async () => {
    global.redisRuntime = undefined;
    const orphanedClient = new FakeRedisClient({});
    global.redisClient = orphanedClient as unknown as RedisClient;
    await expect(closeRedisConnections()).resolves.toBeUndefined();
    expect(orphanedClient.disconnect).toHaveBeenCalledTimes(1);
    expect(global.redisClient).toBeNull();

    const replacement = { close: vi.fn(async () => undefined) };
    const original = {
      close: vi.fn(async () => {
        global.redisRuntime = replacement as unknown as NonNullable<typeof global.redisRuntime>;
      })
    };
    global.redisRuntime = original as unknown as NonNullable<typeof global.redisRuntime>;

    await closeRedisConnections();

    expect(global.redisRuntime).toBe(replacement);
  });
});

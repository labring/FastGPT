import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asRedisLogicalKey,
  createRedisStoreAdapter,
  redisRepositoryAdapter
} from '@fastgpt/dal/redis/adapter';
import { closeRedisRuntime, configureRedisRuntime } from '@fastgpt/dal/redis/runtime';

const createClient = () => ({
  del: vi.fn(),
  get: vi.fn(),
  hgetall: vi.fn(),
  info: vi.fn(),
  multi: vi.fn(),
  scan: vi.fn(),
  set: vi.fn()
});

describe('createRedisStoreAdapter', () => {
  const key = asRedisLogicalKey('cache:string');
  const prefix = asRedisLogicalKey('session:user');
  let client: ReturnType<typeof createClient>;

  beforeEach(() => {
    client = createClient();
  });

  afterEach(async () => {
    await closeRedisRuntime();
  });

  it('binds the default repository adapter to command and blocking Runtime connections', async () => {
    const commandClient = {
      status: 'ready',
      get: vi.fn().mockResolvedValue('value'),
      on: vi.fn(),
      quit: vi.fn().mockResolvedValue('OK'),
      disconnect: vi.fn()
    };
    const blockingClient = {
      status: 'ready',
      call: vi.fn().mockResolvedValue(null),
      on: vi.fn(),
      quit: vi.fn().mockResolvedValue('OK'),
      disconnect: vi.fn()
    };
    const clientFactory = vi
      .fn()
      .mockReturnValueOnce(commandClient)
      .mockReturnValueOnce(blockingClient);
    configureRedisRuntime({ redisUrl: 'redis://localhost', clientFactory: clientFactory as any });

    await expect(redisRepositoryAdapter.get(key)).resolves.toBe('value');
    const reader = redisRepositoryAdapter.createBlockingStreamReader({ key, blockMs: 10 });
    await expect(reader.read('$')).resolves.toEqual([]);
    await reader.close();

    expect(clientFactory).toHaveBeenCalledTimes(2);
    expect(commandClient.get).toHaveBeenCalledWith('fastgpt:cache:string');
    expect(blockingClient.call).toHaveBeenCalledWith(
      'XREAD',
      'BLOCK',
      10,
      'COUNT',
      1,
      'STREAMS',
      'fastgpt:cache:string',
      '$'
    );

    const fallbackAdapter = createRedisStoreAdapter({
      getCommandClient: () => commandClient as any,
      createBlockingConnection: () => blockingClient
    });
    const fallbackReader = fallbackAdapter.createBlockingStreamReader({ key, blockMs: 10 });
    await fallbackReader.close();
  });

  it('does not resolve the command connection until an operation starts', async () => {
    client.get.mockResolvedValue('value');
    const getCommandClient = vi.fn(() => client as any);
    const adapter = createRedisStoreAdapter({ getCommandClient });

    expect(getCommandClient).not.toHaveBeenCalled();
    await expect(adapter.get(key)).resolves.toBe('value');
    expect(getCommandClient).toHaveBeenCalledTimes(1);
  });

  it('reads and parses Redis memory info through a typed operation', async () => {
    client.info.mockResolvedValue('used_memory:42\r\nmaxmemory:100\r\n');
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.getMemoryInfo()).resolves.toEqual({
      usedMemory: 42,
      maxMemory: 100
    });
    expect(client.info).toHaveBeenCalledWith('memory');
  });

  it.each([null, 42])('rejects malformed Redis memory info response %#', async (info) => {
    client.info.mockResolvedValue(info);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.getMemoryInfo()).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'server.memoryInfo'
    });
  });

  it('atomically consumes a fixed window and returns a validated count and TTL', async () => {
    const exec = vi.fn().mockResolvedValue([
      [null, 2],
      [null, 1],
      [null, 58]
    ]);
    const multi = {
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      ttl: vi.fn().mockReturnThis(),
      exec
    };
    client.multi.mockReturnValue(multi);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.consumeFixedWindow({ key, windowSeconds: 60 })).resolves.toEqual({
      currentCount: 2,
      ttlSeconds: 58
    });
    expect(client.multi).toHaveBeenCalledTimes(1);
    expect(multi.incr).toHaveBeenCalledWith('fastgpt:cache:string');
    expect(multi.expire).toHaveBeenCalledWith('fastgpt:cache:string', 60, 'NX');
    expect(multi.ttl).toHaveBeenCalledWith('fastgpt:cache:string');
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    [],
    [[null, 1]],
    [
      [new Error('command failed'), null],
      [null, 1],
      [null, 60]
    ],
    [
      [null, -1],
      [null, 1],
      [null, 60]
    ],
    [
      [null, 1],
      [null, 2],
      [null, 60]
    ],
    [
      [null, 1],
      [null, 1],
      [null, -1]
    ],
    [
      [null, '1'],
      [null, 1],
      [null, 60]
    ]
  ])('rejects malformed fixed window transaction response %#', async (result) => {
    const exec = vi.fn().mockResolvedValue(result);
    const multi = {
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      ttl: vi.fn().mockReturnThis(),
      exec
    };
    client.multi.mockReturnValue(multi);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.consumeFixedWindow({ key, windowSeconds: 60 })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'fixedWindow.consume'
    });
  });

  it.each([0, -1, 1.5, '60'])('rejects invalid fixed window TTL %s', (windowSeconds) => {
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    expect(() => adapter.consumeFixedWindow({ key, windowSeconds: windowSeconds as any })).toThrow(
      'windowSeconds must be a positive safe integer'
    );
    expect(client.multi).not.toHaveBeenCalled();
  });

  it('reads a pair of strings in one transaction', async () => {
    const exec = vi.fn().mockResolvedValue([
      [null, 'surplus'],
      [null, 'total']
    ]);
    const multi = {
      get: vi.fn().mockReturnThis(),
      exec
    };
    client.multi.mockReturnValue(multi);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(
      adapter.getPair({ first: key, second: asRedisLogicalKey('cache:total') })
    ).resolves.toEqual(['surplus', 'total']);
    expect(multi.get).toHaveBeenNthCalledWith(1, 'fastgpt:cache:string');
    expect(multi.get).toHaveBeenNthCalledWith(2, 'fastgpt:cache:total');
  });

  it('atomically appends a string and refreshes its TTL', async () => {
    const multi = {
      append: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 12],
        [null, 1]
      ])
    };
    client.multi.mockReturnValue(multi);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(
      adapter.appendStringWithTtl({ key, value: 'chunk', ttlSeconds: 60 })
    ).resolves.toBe(12);
    expect(multi.append).toHaveBeenCalledWith('fastgpt:cache:string', 'chunk');
    expect(multi.expire).toHaveBeenCalledWith('fastgpt:cache:string', 60);
  });

  it.each([
    null,
    [],
    [[null, 12]],
    [
      [new Error('append failed'), null],
      [null, 1]
    ],
    [
      [null, -1],
      [null, 1]
    ],
    [
      [null, 12],
      [null, 0]
    ]
  ])('rejects malformed append transaction response %#', async (result) => {
    const multi = {
      append: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(result)
    };
    client.multi.mockReturnValue(multi);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(
      adapter.appendStringWithTtl({ key, value: 'chunk', ttlSeconds: 60 })
    ).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'string.appendWithTtl'
    });
  });

  it.each([0, -1, 1.5, '60'])('rejects invalid append TTL %s', (ttlSeconds) => {
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    expect(() =>
      adapter.appendStringWithTtl({ key, value: 'chunk', ttlSeconds: ttlSeconds as any })
    ).toThrow('ttlSeconds must be a positive safe integer');
    expect(client.multi).not.toHaveBeenCalled();
  });

  it('rejects a non-string append value before opening a transaction', () => {
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    expect(() => adapter.appendStringWithTtl({ key, value: 1 as any, ttlSeconds: 60 })).toThrow(
      'value must be a string'
    );
    expect(client.multi).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    [[null, 'only-one']],
    [
      [new Error('failed'), null],
      [null, 'total']
    ]
  ])('rejects malformed GET pair response %#', async (result) => {
    const multi = {
      get: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(result)
    };
    client.multi.mockReturnValue(multi);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(
      adapter.getPair({ first: key, second: asRedisLogicalKey('cache:total') })
    ).rejects.toMatchObject({ code: 'REDIS_INVALID_RESPONSE', operation: 'string.getPair' });
  });

  it('sets a pair atomically with the same PX TTL', async () => {
    const multi = {
      set: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 'OK'],
        [null, 'OK']
      ])
    };
    client.multi.mockReturnValue(multi);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });
    const total = asRedisLogicalKey('cache:total');

    await expect(
      adapter.setPair({
        first: { key, value: '1' },
        second: { key: total, value: '2' },
        ttlMs: 60_000
      })
    ).resolves.toBeUndefined();
    expect(multi.set).toHaveBeenNthCalledWith(1, 'fastgpt:cache:string', '1', 'PX', 60_000);
    expect(multi.set).toHaveBeenNthCalledWith(2, 'fastgpt:cache:total', '2', 'PX', 60_000);
  });

  it('rejects non-string pair values before opening a transaction', () => {
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    expect(() =>
      adapter.setPair({
        first: { key, value: 1 as any },
        second: { key: asRedisLogicalKey('cache:total'), value: '2' },
        ttlMs: 60_000
      })
    ).toThrow('pair values must be strings');
    expect(client.multi).not.toHaveBeenCalled();
  });

  it('rejects a malformed pair transaction response', async () => {
    const multi = {
      set: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 'OK'],
        [null, 'QUEUED']
      ])
    };
    client.multi.mockReturnValue(multi);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(
      adapter.setPair({
        first: { key, value: '1' },
        second: { key: asRedisLogicalKey('cache:total'), value: '2' },
        ttlMs: 60_000
      })
    ).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'string.setPair'
    });
  });

  it('atomically increments a float and establishes TTL only when missing', async () => {
    const multi = {
      incrbyfloat: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, '12.5'],
        [null, 1]
      ])
    };
    client.multi.mockReturnValue(multi);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.incrementWithTtl({ key, increment: 2.5, ttlSeconds: 60 })).resolves.toBe(
      12.5
    );
    expect(multi.incrbyfloat).toHaveBeenCalledWith('fastgpt:cache:string', 2.5);
    expect(multi.expire).toHaveBeenCalledWith('fastgpt:cache:string', 60, 'NX');
  });

  it.each([
    [
      [null, 'not-a-number'],
      [null, 1]
    ],
    [
      [null, ''],
      [null, 1]
    ],
    [
      [null, '12.5'],
      [null, 2]
    ]
  ])('rejects invalid numeric increment transaction values %#', async (result) => {
    const multi = {
      incrbyfloat: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(result)
    };
    client.multi.mockReturnValue(multi);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(
      adapter.incrementWithTtl({ key, increment: 2.5, ttlSeconds: 60 })
    ).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'number.incrementWithTtl'
    });
  });

  it('rejects an empty raw increment result and an invalid expiry result', async () => {
    const multi = {
      incrbyfloat: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi
        .fn()
        .mockResolvedValueOnce([
          [null, ''],
          [null, 1]
        ])
        .mockResolvedValueOnce([
          [null, '12.5'],
          [null, 2]
        ])
    };
    client.multi.mockReturnValue(multi);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.incrementWithTtl({ key, increment: 2.5, ttlSeconds: 60 })).rejects.toThrow(
      'Redis increment transaction returned invalid numeric values'
    );
    await expect(adapter.incrementWithTtl({ key, increment: 2.5, ttlSeconds: 60 })).rejects.toThrow(
      'Redis increment transaction returned invalid numeric values'
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, '1'])(
    'rejects invalid increment input %s before Redis access',
    (increment) => {
      const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

      expect(() =>
        adapter.incrementWithTtl({ key, increment: increment as any, ttlSeconds: 60 })
      ).toThrow('increment must be a finite number');
      expect(client.multi).not.toHaveBeenCalled();
    }
  );

  it('atomically increments an integer and establishes TTL only when missing', async () => {
    const multi = {
      incrby: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 5],
        [null, 0]
      ])
    };
    client.multi.mockReturnValue(multi);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(
      adapter.incrementIntegerWithTtl({ key, increment: 1, ttlSeconds: 300 })
    ).resolves.toBe(5);
    expect(multi.incrby).toHaveBeenCalledWith('fastgpt:cache:string', 1);
    expect(multi.expire).toHaveBeenCalledWith('fastgpt:cache:string', 300, 'NX');
  });

  it.each([
    null,
    [],
    [[null, 5]],
    [
      [new Error('increment failed'), null],
      [null, 1]
    ],
    [
      [null, -1],
      [null, 1]
    ],
    [
      [null, 5],
      [null, 2]
    ]
  ])('rejects malformed integer increment transaction response %#', async (result) => {
    const multi = {
      incrby: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(result)
    };
    client.multi.mockReturnValue(multi);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(
      adapter.incrementIntegerWithTtl({ key, increment: 1, ttlSeconds: 300 })
    ).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'number.incrementIntegerWithTtl'
    });
  });

  it.each([0, -1, 1.5, '1'])('rejects invalid integer increment %s', (increment) => {
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    expect(() =>
      adapter.incrementIntegerWithTtl({ key, increment: increment as any, ttlSeconds: 300 })
    ).toThrow('increment must be a positive safe integer');
    expect(client.multi).not.toHaveBeenCalled();
  });

  it('reads values through physical keys and accepts a missing key', async () => {
    client.get.mockResolvedValueOnce('value').mockResolvedValueOnce(null);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.get(key)).resolves.toBe('value');
    await expect(adapter.get(key)).resolves.toBeNull();
    expect(client.get).toHaveBeenNthCalledWith(1, 'fastgpt:cache:string');
  });

  it('rejects an unsupported GET response', async () => {
    client.get.mockResolvedValue(1);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.get(key)).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'string.get'
    });
  });

  it('reads a hash through the physical key and validates string fields', async () => {
    client.hgetall.mockResolvedValue({ userId: 'user-1', createdAt: '123' });
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.getHashAll(asRedisLogicalKey('session:user-1'))).resolves.toEqual({
      userId: 'user-1',
      createdAt: '123'
    });
    expect(client.hgetall).toHaveBeenCalledWith('fastgpt:session:user-1');
  });

  it.each([null, [], { userId: 1 }])('rejects malformed HGETALL responses %#', async (value) => {
    client.hgetall.mockResolvedValue(value);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.getHashAll(asRedisLogicalKey('session:user-1'))).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'hash.getAll'
    });
  });

  it('atomically writes a hash and TTL through physical key', async () => {
    const multi = {
      hmset: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 'OK'],
        [null, 1]
      ])
    };
    client.multi.mockReturnValue(multi);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(
      adapter.setHashWithTtl({
        key: asRedisLogicalKey('session:user-1'),
        fields: { userId: 'user-1', isRoot: '0' },
        ttlSeconds: 604_800
      })
    ).resolves.toBeUndefined();
    expect(multi.hmset).toHaveBeenCalledWith('fastgpt:session:user-1', {
      userId: 'user-1',
      isRoot: '0'
    });
    expect(multi.expire).toHaveBeenCalledWith('fastgpt:session:user-1', 604_800);
  });

  it.each([
    [{ fields: {}, ttlSeconds: 60 }, 'hash fields must contain at least one string value'],
    [
      { fields: { userId: 1 as any }, ttlSeconds: 60 },
      'hash fields must contain at least one string value'
    ],
    [{ fields: { userId: 'user-1' }, ttlSeconds: 0 }, 'ttlSeconds must be a positive safe integer']
  ])('rejects invalid hash SET input %#', (input, message) => {
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    expect(() =>
      adapter.setHashWithTtl({
        key: asRedisLogicalKey('session:user-1'),
        ...input
      } as any)
    ).toThrow(message);
    expect(client.multi).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    [[null, 'OK']],
    [
      [null, 'QUEUED'],
      [null, 1]
    ],
    [
      [null, 'OK'],
      [null, 0]
    ],
    [
      [new Error('failed'), null],
      [null, 1]
    ]
  ])('rejects malformed hash SET transaction response %#', async (result) => {
    const multi = {
      hmset: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(result)
    };
    client.multi.mockReturnValue(multi);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(
      adapter.setHashWithTtl({
        key: asRedisLogicalKey('session:user-1'),
        fields: { userId: 'user-1' },
        ttlSeconds: 60
      })
    ).rejects.toMatchObject({ code: 'REDIS_INVALID_RESPONSE', operation: 'hash.setWithTtl' });
  });

  it('atomically returns either the initialized value or the existing value', async () => {
    client.set.mockResolvedValueOnce(null).mockResolvedValueOnce('existing-value');
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.getOrSet({ key, value: 'candidate-1' })).resolves.toBe('candidate-1');
    await expect(adapter.getOrSet({ key, value: 'candidate-2' })).resolves.toBe('existing-value');
    expect(client.set.mock.calls).toEqual([
      ['fastgpt:cache:string', 'candidate-1', 'NX', 'GET'],
      ['fastgpt:cache:string', 'candidate-2', 'NX', 'GET']
    ]);
  });

  it('rejects invalid input and unsupported SET NX GET responses', async () => {
    client.set.mockResolvedValue(1);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    expect(() => adapter.getOrSet({ key, value: 1 as any })).toThrow('value must be a string');
    await expect(adapter.getOrSet({ key, value: 'candidate' })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'string.getOrSet'
    });
    expect(client.set).toHaveBeenCalledTimes(1);
  });

  it('sets persistent and expiring values with strict OK responses', async () => {
    client.set.mockResolvedValue('OK');
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.set({ key, value: '' })).resolves.toBeUndefined();
    await expect(adapter.set({ key, value: 'value', ttlMs: 500 })).resolves.toBeUndefined();
    expect(client.set.mock.calls).toEqual([
      ['fastgpt:cache:string', ''],
      ['fastgpt:cache:string', 'value', 'PX', 500]
    ]);
  });

  it.each([
    [{ key, value: 1 as any }, 'value must be a string'],
    [{ key, value: 'value', ttlMs: 0 }, 'ttlMs must be a positive safe integer']
  ])('rejects invalid SET input %#', (input, message) => {
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    expect(() => adapter.set(input)).toThrow(message);
    expect(client.set).not.toHaveBeenCalled();
  });

  it('rejects an unsupported SET response without retrying', async () => {
    client.set.mockResolvedValue(null);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.set({ key, value: 'value' })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'string.set'
    });
    expect(client.set).toHaveBeenCalledTimes(1);
  });

  it('atomically sets an expiring key only when it does not exist', async () => {
    client.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.setIfAbsent({ key, value: '1', ttlSeconds: 86_400 })).resolves.toBe(true);
    await expect(adapter.setIfAbsent({ key, value: '1', ttlSeconds: 86_400 })).resolves.toBe(false);
    expect(client.set.mock.calls).toEqual([
      ['fastgpt:cache:string', '1', 'EX', 86_400, 'NX'],
      ['fastgpt:cache:string', '1', 'EX', 86_400, 'NX']
    ]);
  });

  it.each([
    [{ key, value: 1 as any, ttlSeconds: 60 }, 'value must be a string'],
    [{ key, value: '1', ttlSeconds: 0 }, 'ttlSeconds must be a positive safe integer']
  ])('rejects invalid SET NX input %#', (input, message) => {
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    expect(() => adapter.setIfAbsent(input)).toThrow(message);
    expect(client.set).not.toHaveBeenCalled();
  });

  it('rejects an unsupported SET NX response', async () => {
    client.set.mockResolvedValue('QUEUED');
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.setIfAbsent({ key, value: '1', ttlSeconds: 60 })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'string.setIfAbsent'
    });
    expect(client.set).toHaveBeenCalledTimes(1);
  });

  it.each([
    [1, true],
    [0, false]
  ])('maps DEL count %s to %s', async (deleted, expected) => {
    client.del.mockResolvedValue(deleted);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.delete(key)).resolves.toBe(expected);
    expect(client.del).toHaveBeenCalledWith('fastgpt:cache:string');
  });

  it('rejects an unsupported DEL response', async () => {
    client.del.mockResolvedValue(2);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.delete(key)).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'string.delete'
    });
  });

  it('deletes a logical key batch with one physical DEL command', async () => {
    client.del.mockResolvedValue(1);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(
      adapter.deleteMany([
        asRedisLogicalKey('VERSION_KEY:model:a'),
        asRedisLogicalKey('VERSION_KEY:model:b')
      ])
    ).resolves.toBeUndefined();
    expect(client.del).toHaveBeenCalledWith(
      'fastgpt:VERSION_KEY:model:a',
      'fastgpt:VERSION_KEY:model:b'
    );
  });

  it('skips empty delete batches without resolving a connection', async () => {
    const getCommandClient = vi.fn(() => client as any);
    const adapter = createRedisStoreAdapter({ getCommandClient });

    await expect(adapter.deleteMany([])).resolves.toBeUndefined();
    expect(getCommandClient).not.toHaveBeenCalled();
  });

  it.each([-1, 3, 1.5])('rejects unsupported multi-key DEL count %s', async (deleted) => {
    client.del.mockResolvedValue(deleted);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(
      adapter.deleteMany([
        asRedisLogicalKey('VERSION_KEY:model:a'),
        asRedisLogicalKey('VERSION_KEY:model:b')
      ])
    ).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'string.deleteMany'
    });
  });

  it('iterates non-empty logical key batches until cursor zero', async () => {
    client.scan
      .mockResolvedValueOnce(['7', ['fastgpt:session:user:a', 'fastgpt:session:user:b']])
      .mockResolvedValueOnce(['0', []]);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });
    const batches: string[][] = [];

    for await (const batch of adapter.iterateByPrefix({ prefix, batchSize: 25 })) {
      batches.push(batch);
    }

    expect(batches).toEqual([['session:user:a', 'session:user:b']]);
    expect(client.scan.mock.calls).toEqual([
      ['0', 'MATCH', 'fastgpt:session:user:*', 'COUNT', 25],
      ['7', 'MATCH', 'fastgpt:session:user:*', 'COUNT', 25]
    ]);
  });

  it.each([0, 10_001, 1.5])('rejects invalid scan batch size %s', async (batchSize) => {
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    const consume = async () => {
      for await (const _batch of adapter.iterateByPrefix({ prefix, batchSize })) {
        // no-op
      }
    };

    await expect(consume()).rejects.toMatchObject({ code: 'REDIS_INVALID_ARGUMENT' });
    expect(client.scan).not.toHaveBeenCalled();
  });

  it.each([[null], [['0']], [[0, []]], [['0', [1]]]])(
    'rejects malformed SCAN response %#',
    async (result) => {
      client.scan.mockResolvedValue(result);
      const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

      const consume = async () => {
        for await (const _batch of adapter.iterateByPrefix({ prefix })) {
          // no-op
        }
      };

      await expect(consume()).rejects.toMatchObject({
        code: 'REDIS_INVALID_RESPONSE',
        operation: 'scan.iterate'
      });
    }
  );

  it('rejects scanned keys outside the FastGPT keyspace', async () => {
    client.scan.mockResolvedValue(['0', ['other:session:user:a']]);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    const consume = async () => {
      for await (const _batch of adapter.iterateByPrefix({ prefix })) {
        // no-op
      }
    };

    await expect(consume()).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'scan.iterate'
    });
  });
});

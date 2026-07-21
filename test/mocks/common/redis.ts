import { vi } from 'vitest';

// In-memory storage for mock Redis
const createRedisStorage = () => {
  const storage = new Map<string, any>();
  const expiryMap = new Map<string, number>();

  // Check and remove expired keys
  const isExpired = (key: string): boolean => {
    const expiry = expiryMap.get(key);
    if (expiry && expiry < Date.now()) {
      storage.delete(key);
      expiryMap.delete(key);
      return true;
    }
    return false;
  };

  return {
    get: (key: string) => {
      if (isExpired(key)) return null;
      return storage.get(key) ?? null;
    },
    set: (key: string, value: any, ...args: any[]) => {
      let exMode: string | undefined;
      let exValue: number | undefined;
      let nx = false;

      for (let i = 0; i < args.length; i++) {
        const arg = String(args[i]).toUpperCase();
        if (arg === 'NX') {
          nx = true;
          continue;
        }
        if ((arg === 'EX' || arg === 'PX') && args[i + 1] !== undefined) {
          exMode = arg;
          exValue = Number(args[i + 1]);
          i++;
        }
      }

      if (nx && !isExpired(key) && storage.has(key)) {
        return null;
      }

      storage.set(key, value);
      // Handle EX (seconds) and PX (milliseconds) options
      if (exMode === 'EX' && typeof exValue === 'number') {
        expiryMap.set(key, Date.now() + exValue * 1000);
      } else if (exMode === 'PX' && typeof exValue === 'number') {
        expiryMap.set(key, Date.now() + exValue);
      }
      return 'OK';
    },
    del: (...keys: string[]) => {
      let deletedCount = 0;
      keys.forEach((key) => {
        if (storage.has(key)) {
          storage.delete(key);
          expiryMap.delete(key);
          deletedCount++;
        }
      });
      return deletedCount;
    },
    exists: (...keys: string[]) => {
      let count = 0;
      keys.forEach((key) => {
        if (!isExpired(key) && storage.has(key)) count++;
      });
      return count;
    },
    expire: (key: string, seconds: number, mode?: string) => {
      if (isExpired(key) || !storage.has(key)) return 0;
      if (String(mode ?? '').toUpperCase() === 'NX' && expiryMap.has(key)) return 0;
      expiryMap.set(key, Date.now() + seconds * 1000);
      return 1;
    },
    ttl: (key: string) => {
      if (isExpired(key) || !storage.has(key)) return -2;
      const expiry = expiryMap.get(key);
      if (!expiry) return -1;
      return Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
    },
    incr: (key: string) => {
      if (isExpired(key)) storage.delete(key);
      const current = Number(storage.get(key) ?? 0);
      const next = current + 1;
      storage.set(key, next);
      return next;
    },
    pexpire: (key: string, milliseconds: number) => {
      if (isExpired(key) || !storage.has(key)) return 0;
      expiryMap.set(key, Date.now() + milliseconds);
      return 1;
    },
    clear: () => {
      storage.clear();
      expiryMap.clear();
    },
    eval: (_script: string, numberOfKeys: number, ...args: any[]) => {
      const keys = args.slice(0, numberOfKeys);
      const argv = args.slice(numberOfKeys);
      const key = keys[0];
      const expectedValue = argv[0];

      if (isExpired(key) || storage.get(key) !== expectedValue) {
        return 0;
      }

      const ttl = argv[1];
      const ttlMilliseconds = Number(ttl);
      if (ttl !== undefined && Number.isFinite(ttlMilliseconds)) {
        expiryMap.set(key, Date.now() + ttlMilliseconds);
        return 1;
      }

      storage.delete(key);
      expiryMap.delete(key);
      return 1;
    }
  };
};

// Shared global Redis storage for all mock clients
const globalRedisStorage = createRedisStorage();

// Create mock client with shared storage
const createSharedMockRedisClient = () => {
  return {
    // Connection methods
    on: vi.fn().mockReturnThis(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
    duplicate: vi.fn(function (this: any) {
      return createSharedMockRedisClient();
    }),

    // Key-value operations with shared storage
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(globalRedisStorage.get(key))),
    set: vi
      .fn()
      .mockImplementation((key: string, value: any, ...args: any[]) =>
        Promise.resolve(globalRedisStorage.set(key, value, ...args))
      ),
    del: vi
      .fn()
      .mockImplementation((...keys: string[]) => Promise.resolve(globalRedisStorage.del(...keys))),
    exists: vi
      .fn()
      .mockImplementation((...keys: string[]) =>
        Promise.resolve(globalRedisStorage.exists(...keys))
      ),
    pexpire: vi
      .fn()
      .mockImplementation((key: string, milliseconds: number) =>
        Promise.resolve(globalRedisStorage.pexpire(key, milliseconds))
      ),
    keys: vi.fn().mockResolvedValue([]),
    scan: vi.fn().mockResolvedValue(['0', []]),

    // Hash operations
    hget: vi.fn().mockResolvedValue(null),
    hset: vi.fn().mockResolvedValue(1),
    hdel: vi.fn().mockResolvedValue(1),
    hgetall: vi.fn().mockResolvedValue({}),
    hmset: vi.fn().mockResolvedValue('OK'),

    // Expiry operations
    expire: vi
      .fn()
      .mockImplementation((key: string, seconds: number, mode?: string) =>
        Promise.resolve(globalRedisStorage.expire(key, seconds, mode))
      ),
    ttl: vi.fn().mockImplementation((key: string) => Promise.resolve(globalRedisStorage.ttl(key))),
    expireat: vi.fn().mockResolvedValue(1),

    // Increment operations
    incr: vi
      .fn()
      .mockImplementation((key: string) => Promise.resolve(globalRedisStorage.incr(key))),
    decr: vi.fn().mockResolvedValue(1),
    incrby: vi.fn().mockResolvedValue(1),
    decrby: vi.fn().mockResolvedValue(1),
    incrbyfloat: vi.fn().mockResolvedValue(1),

    // Server commands
    info: vi.fn().mockResolvedValue(''),
    ping: vi.fn().mockResolvedValue('PONG'),
    flushdb: vi.fn().mockImplementation(() => {
      globalRedisStorage.clear();
      return Promise.resolve('OK');
    }),
    eval: vi
      .fn()
      .mockImplementation((script: string, numberOfKeys: number, ...args: any[]) =>
        Promise.resolve(globalRedisStorage.eval(script, numberOfKeys, ...args))
      ),

    // List operations
    lpush: vi.fn().mockResolvedValue(1),
    rpush: vi.fn().mockResolvedValue(1),
    lpop: vi.fn().mockResolvedValue(null),
    rpop: vi.fn().mockResolvedValue(null),
    llen: vi.fn().mockResolvedValue(0),

    // Set operations
    sadd: vi.fn().mockResolvedValue(1),
    srem: vi.fn().mockResolvedValue(1),
    smembers: vi.fn().mockResolvedValue([]),
    sismember: vi.fn().mockResolvedValue(0),

    // pipeline
    pipeline: vi.fn(() => ({
      del: vi.fn().mockReturnThis(),
      unlink: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([])
    })),
    multi: vi.fn(() => {
      const commands: Array<() => [null, unknown]> = [];
      const pipeline = {
        incr: vi.fn((key: string) => {
          commands.push(() => [null, globalRedisStorage.incr(key)]);
          return pipeline;
        }),
        expire: vi.fn((key: string, seconds: number, mode?: string) => {
          commands.push(() => [null, globalRedisStorage.expire(key, seconds, mode)]);
          return pipeline;
        }),
        exec: vi
          .fn()
          .mockImplementation(() => Promise.resolve(commands.map((command) => command())))
      };
      return pipeline;
    }),

    // Internal storage for testing purposes
    _storage: globalRedisStorage
  };
};

// Mock Redis connections to prevent connection errors in tests
vi.mock('@fastgpt/service/common/redis', async (importOriginal) => {
  const actual = (await importOriginal()) as any;

  return {
    ...actual,
    createQueueRedisConnection: vi.fn(createSharedMockRedisClient),
    createWorkerRedisConnection: vi.fn(createSharedMockRedisClient),
    getGlobalRedisConnection: vi.fn(() => {
      if (!global.redisClient) {
        global.redisClient = createSharedMockRedisClient() as any;
      }
      return global.redisClient;
    }),
    initRedisClient: vi.fn().mockResolvedValue(createSharedMockRedisClient())
  };
});

// Initialize global.redisClient with mock before any module imports it
// This prevents getGlobalRedisConnection() from creating a real Redis client
if (!global.redisClient) {
  global.redisClient = createSharedMockRedisClient() as any;
}

// SCAN 等 Runtime 内部能力会绕过公共 legacy mock，提供同一存储上的 physical client。
if (!global.redisRuntime) {
  global.redisRuntime = {
    endpoint: { transport: 'tcp', host: 'localhost', port: 6379, tls: false },
    getLegacyCommandConnection: vi.fn(() => global.redisClient),
    getCommandConnection: vi.fn(() => global.redisClient),
    createBlockingConnection: () => (global.redisClient as any).duplicate(),
    createQueueConnection: () => createSharedMockRedisClient(),
    createWorkerConnection: () => createSharedMockRedisClient(),
    registerBeforeCloseHook: vi.fn(() => () => undefined),
    getConnectionSnapshot: () => [],
    checkHealth: async () => ({
      latencyMs: 0,
      endpoint: { transport: 'tcp' as const, host: 'localhost', port: 6379, tls: false }
    }),
    releaseConnection: async (client: any) => {
      await client.quit().catch(() => client.disconnect());
    },
    close: async () => undefined
  } as any;
}

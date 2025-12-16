import { vi } from 'vitest';

// Create a comprehensive mock Redis client factory
const createMockRedisClient = () => ({
  // Connection methods
  on: vi.fn().mockReturnThis(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue('OK'),
  duplicate: vi.fn(function (this: any) {
    return createMockRedisClient();
  }),

  // Key-value operations
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  exists: vi.fn().mockResolvedValue(0),
  keys: vi.fn().mockResolvedValue([]),
  scan: vi.fn().mockResolvedValue(['0', []]),

  // Hash operations
  hget: vi.fn().mockResolvedValue(null),
  hset: vi.fn().mockResolvedValue(1),
  hdel: vi.fn().mockResolvedValue(1),
  hgetall: vi.fn().mockResolvedValue({}),
  hmset: vi.fn().mockResolvedValue('OK'),

  // Expiry operations
  expire: vi.fn().mockResolvedValue(1),
  ttl: vi.fn().mockResolvedValue(-1),
  expireat: vi.fn().mockResolvedValue(1),

  // Increment operations
  incr: vi.fn().mockResolvedValue(1),
  decr: vi.fn().mockResolvedValue(1),
  incrby: vi.fn().mockResolvedValue(1),
  decrby: vi.fn().mockResolvedValue(1),
  incrbyfloat: vi.fn().mockResolvedValue(1),

  // Server commands
  info: vi.fn().mockResolvedValue(''),
  ping: vi.fn().mockResolvedValue('PONG'),
  flushdb: vi.fn().mockResolvedValue('OK'),

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
  sismember: vi.fn().mockResolvedValue(0)

  // pipline
  pipeline: vi.fn(() => ({
    del: vi.fn().mockReturnThis(),
    unlink: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([])
  })),
});

// Mock Redis connections to prevent connection errors in tests
vi.mock('@fastgpt/service/common/redis', async (importOriginal) => {
  const actual = (await importOriginal()) as any;

  return {
    ...actual,
    newQueueRedisConnection: vi.fn(createMockRedisClient),
    newWorkerRedisConnection: vi.fn(createMockRedisClient),
    getGlobalRedisConnection: vi.fn(() => {
      if (!global.mockRedisClient) {
        global.mockRedisClient = createMockRedisClient();
      }
      return global.mockRedisClient;
    }),
    initRedisClient: vi.fn().mockResolvedValue(createMockRedisClient())
  };
});

// Initialize global.redisClient with mock before any module imports it
// This prevents getGlobalRedisConnection() from creating a real Redis client
if (!global.redisClient) {
  global.redisClient = createMockRedisClient() as any;
}

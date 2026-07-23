import { getRedisRuntime, type RedisClient } from '../runtime/connection';
import { createRedisScriptRegistry } from '../script';
import { createRedisCounterCapability } from './counter';
import { createRedisHashCapability } from './hash';
import { createRedisScanCapability } from './scan';
import { createRedisStreamCapability } from './stream';
import { createRedisStringCapability } from './string';

type RedisCapabilityDependencies = {
  getCommandClient: () => RedisClient;
  createBlockingClient: () => {
    client: RedisClient;
    release: () => Promise<void>;
  };
};

const defaultDependencies: RedisCapabilityDependencies = {
  getCommandClient: () => getRedisRuntime().getCommandConnection(),
  createBlockingClient: () => {
    const runtime = getRedisRuntime();
    const client = runtime.createBlockingConnection();
    return {
      client,
      release: () => runtime.releaseConnection(client)
    };
  }
};

/** 创建可注入的 Redis capability 集合；构造过程不会创建 Redis 连接。 */
export const createRedisCapabilities = (
  dependencies: RedisCapabilityDependencies = defaultDependencies
) => {
  const scripts = createRedisScriptRegistry({ getClient: dependencies.getCommandClient });

  return {
    string: createRedisStringCapability({
      getClient: dependencies.getCommandClient,
      scripts
    }),
    hash: createRedisHashCapability({
      getClient: dependencies.getCommandClient,
      scripts
    }),
    counter: createRedisCounterCapability({ getClient: dependencies.getCommandClient }),
    scan: createRedisScanCapability({ getClient: dependencies.getCommandClient }),
    stream: createRedisStreamCapability({
      getClient: dependencies.getCommandClient,
      createBlockingClient: dependencies.createBlockingClient
    }),
    atomic: {
      initializeVersion: scripts.initializeVersion,
      renewLease: scripts.renewLease,
      releaseLease: scripts.releaseLease
    }
  };
};

export const redisCapabilities = createRedisCapabilities();

export type RedisCapabilities = ReturnType<typeof createRedisCapabilities>;
export type { RedisCounterCapability } from './counter';
export type { RedisHashCapability } from './hash';
export type { RedisScanCapability } from './scan';
export type { RedisStreamCapability, RedisStreamEntry } from './stream';
export type { RedisStringCapability, RedisTtlState } from './string';

import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { getLogger, LogCategories } from '../../logger';
import { serviceEnv } from '../../../env';
import { parseRedisConnectionConfig, type RedisEndpoint } from './config';
import { FASTGPT_REDIS_PREFIX } from './keyspace';

const logger = getLogger(LogCategories.INFRA.REDIS);

export type RedisClient = Redis;
export type RedisConnectionRole = 'legacy-command' | 'command' | 'blocking' | 'queue' | 'worker';
export type RedisConnectionState =
  | 'connecting'
  | 'connected'
  | 'ready'
  | 'reconnecting'
  | 'closed'
  | 'ended';

export type RedisConnectionSnapshot = {
  id: number;
  role: RedisConnectionRole;
  state: RedisConnectionState;
  createdAt: number;
  lastErrorAt?: number;
};

export type RedisClientFactory = (options: RedisOptions) => RedisClient;

export type RedisBeforeCloseHook = {
  name: string;
  close: () => Promise<void> | void;
};

const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 3_000;
const DEFAULT_CLOSE_TIMEOUT_MS = 5_000;
const DEFAULT_BEFORE_CLOSE_TIMEOUT_MS = 15_000;

const roleOptions: Record<
  RedisConnectionRole,
  Pick<RedisOptions, 'enableOfflineQueue' | 'maxRetriesPerRequest'>
> = {
  'legacy-command': {
    enableOfflineQueue: true,
    maxRetriesPerRequest: 3
  },
  command: {
    enableOfflineQueue: true,
    maxRetriesPerRequest: 3
  },
  blocking: {
    enableOfflineQueue: true,
    maxRetriesPerRequest: null
  },
  queue: {
    enableOfflineQueue: true,
    maxRetriesPerRequest: 3
  },
  worker: {
    enableOfflineQueue: true,
    maxRetriesPerRequest: null
  }
};

const reconnectErrorMessages = ['READONLY', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'];

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : String(error ?? 'Unknown Redis error');
};

const getInitialConnectionState = (client: RedisClient): RedisConnectionState => {
  if (client.status === 'ready') return 'ready';
  if (client.status === 'connect') return 'connected';
  if (client.status === 'reconnecting') return 'reconnecting';
  if (client.status === 'close') return 'closed';
  return 'connecting';
};

const getConnectionOptions = ({
  endpointOptions,
  role
}: {
  endpointOptions: RedisOptions;
  role: RedisConnectionRole;
}): RedisOptions => ({
  ...endpointOptions,
  retryStrategy: (times: number) => {
    const delayMs = Math.min(times * 50, 2000);
    if (times === 1 || times % 30 === 0) {
      logger.warn('Redis reconnect scheduled', { role, attempt: times, delayMs });
    }
    return delayMs;
  },
  reconnectOnError: (error: Error) => {
    const message = getErrorMessage(error);
    const shouldReconnect = reconnectErrorMessages.some((errorType) => message.includes(errorType));
    if (shouldReconnect) {
      logger.warn('Redis reconnect requested by command error', { role, message });
    }
    return shouldReconnect;
  },
  connectTimeout: 10_000,
  ...roleOptions[role],
  ...(role === 'legacy-command' ? { keyPrefix: FASTGPT_REDIS_PREFIX } : {})
});

type RedisRuntimeOptions = {
  redisUrl: string;
  clientFactory?: RedisClientFactory;
  existingCommandClient?: RedisClient;
  healthCheckTimeoutMs?: number;
  closeTimeoutMs?: number;
  beforeCloseTimeoutMs?: number;
};

const runWithTimeout = <T>({
  operation,
  timeoutMs,
  timeoutMessage
}: {
  operation: Promise<T>;
  timeoutMs: number;
  timeoutMessage: string;
}) => {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);

    operation.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
};

/**
 * 判断热重载遗留 client 是否与当前 Runtime 的连接目标及 legacy keyPrefix 完全一致。
 * 不兼容 client 不能被接管，否则配置变更后可能继续访问旧实例或无前缀 keyspace。
 */
const isCompatibleExistingCommandClient = ({
  client,
  endpointOptions
}: {
  client: RedisClient;
  endpointOptions: RedisOptions;
}) => {
  const actualOptions = client.options;
  const isSameEndpoint = endpointOptions.path
    ? actualOptions.path === endpointOptions.path
    : actualOptions.host === endpointOptions.host &&
      actualOptions.port === endpointOptions.port &&
      Boolean(actualOptions.tls) === Boolean(endpointOptions.tls);

  return (
    isSameEndpoint &&
    (actualOptions.db ?? 0) === (endpointOptions.db ?? 0) &&
    (actualOptions.username ?? undefined) === (endpointOptions.username ?? undefined) &&
    (actualOptions.password ?? undefined) === (endpointOptions.password ?? undefined) &&
    actualOptions.keyPrefix === FASTGPT_REDIS_PREFIX
  );
};

/**
 * 创建进程级 Redis Runtime。
 *
 * Runtime 统一管理不同角色的连接、状态、健康检查和关闭。业务 command 连接在 Phase 1
 * 继续保留 keyPrefix 兼容；后续业务 Store 迁移完成后再移除隐式前缀。
 */
export const useRedisRuntime = ({
  redisUrl,
  clientFactory = (options) => new Redis(options),
  existingCommandClient,
  healthCheckTimeoutMs = DEFAULT_HEALTH_CHECK_TIMEOUT_MS,
  closeTimeoutMs = DEFAULT_CLOSE_TIMEOUT_MS,
  beforeCloseTimeoutMs = DEFAULT_BEFORE_CLOSE_TIMEOUT_MS
}: RedisRuntimeOptions) => {
  const { options: endpointOptions, endpoint } = parseRedisConnectionConfig(redisUrl);
  const connections = new Map<RedisClient, RedisConnectionSnapshot>();
  const connectionClosePromises = new Map<RedisClient, Promise<void>>();
  const beforeCloseHooks = new Map<string, RedisBeforeCloseHook['close']>();
  let nextConnectionId = 1;
  let legacyCommandClient: RedisClient | undefined;
  let commandClient: RedisClient | undefined;
  let reusableCommandClient = existingCommandClient;
  let state: 'open' | 'closing' | 'closed' = 'open';
  let closePromise: Promise<void> | undefined;

  const updateConnection = (
    client: RedisClient,
    state: RedisConnectionState,
    extra?: Pick<RedisConnectionSnapshot, 'lastErrorAt'>
  ) => {
    const connection = connections.get(client);
    if (!connection) return;

    connections.set(client, {
      ...connection,
      ...extra,
      state
    });
  };

  const defineConnection = (client: RedisClient, role: RedisConnectionRole) => {
    connections.set(client, {
      id: nextConnectionId++,
      role,
      state: getInitialConnectionState(client),
      createdAt: Date.now()
    });

    client.on('connect', () => {
      updateConnection(client, 'connected');
      logger.info('Redis connection established', { role });
    });
    client.on('ready', () => {
      updateConnection(client, 'ready');
      logger.info('Redis connection ready', { role });
    });
    client.on('reconnecting', () => {
      updateConnection(client, 'reconnecting');
    });
    client.on('error', (error) => {
      updateConnection(client, connections.get(client)?.state ?? 'connecting', {
        lastErrorAt: Date.now()
      });
      logger.error('Redis connection error', { role, error });
    });
    client.on('close', () => {
      updateConnection(client, 'closed');
      logger.warn('Redis connection closed', { role });
    });
    client.on('end', () => {
      updateConnection(client, 'ended');
      connections.delete(client);
      if (legacyCommandClient === client) {
        legacyCommandClient = undefined;
      }
      if (commandClient === client) {
        commandClient = undefined;
      }
    });

    return client;
  };

  const assertOpen = () => {
    if (state !== 'open') {
      throw new Error(`Redis runtime is ${state}`);
    }
  };

  const createConnection = (role: RedisConnectionRole) => {
    assertOpen();
    const client = clientFactory(getConnectionOptions({ endpointOptions, role }));
    return defineConnection(client, role);
  };

  const getLegacyCommandConnection = () => {
    assertOpen();
    if (!legacyCommandClient) {
      const existingClient = reusableCommandClient;
      reusableCommandClient = undefined;
      const reusableClient = (() => {
        if (!existingClient || existingClient.status === 'end') return;
        if (isCompatibleExistingCommandClient({ client: existingClient, endpointOptions })) {
          return existingClient;
        }

        logger.warn('Existing Redis command connection is incompatible, replacing it');
        existingClient.disconnect();
      })();

      legacyCommandClient = reusableClient
        ? defineConnection(reusableClient, 'legacy-command')
        : createConnection('legacy-command');
    }
    return legacyCommandClient;
  };

  const getCommandConnection = () => {
    assertOpen();
    commandClient ??= createConnection('command');
    return commandClient;
  };

  const releaseConnection = (client: RedisClient) => {
    const activeClose = connectionClosePromises.get(client);
    if (activeClose) return activeClose;
    if (!connections.has(client)) return Promise.resolve();

    const role = connections.get(client)?.role;
    const connectionClosePromise = (async () => {
      try {
        await runWithTimeout({
          operation: client.quit(),
          timeoutMs: closeTimeoutMs,
          timeoutMessage: `Redis ${role ?? 'unknown'} connection close timed out`
        });
      } catch (error) {
        logger.warn('Redis graceful close failed, disconnecting socket', {
          role,
          error
        });
        try {
          client.disconnect();
        } catch (disconnectError) {
          logger.warn('Redis forced disconnect failed', { role, error: disconnectError });
        }
      } finally {
        connections.delete(client);
        connectionClosePromises.delete(client);
        if (legacyCommandClient === client) {
          legacyCommandClient = undefined;
        }
        if (commandClient === client) {
          commandClient = undefined;
        }
      }
    })();
    connectionClosePromises.set(client, connectionClosePromise);

    return connectionClosePromise;
  };

  const registerBeforeCloseHook = ({ name, close }: RedisBeforeCloseHook) => {
    assertOpen();
    beforeCloseHooks.set(name, close);

    return () => {
      if (beforeCloseHooks.get(name) === close) {
        beforeCloseHooks.delete(name);
      }
    };
  };

  const close = () => {
    if (closePromise) return closePromise;

    const unclaimedExistingClient = reusableCommandClient;
    reusableCommandClient = undefined;
    if (unclaimedExistingClient && unclaimedExistingClient.status !== 'end') {
      defineConnection(unclaimedExistingClient, 'legacy-command');
    }
    state = 'closing';
    closePromise = (async () => {
      const hooks = Array.from(beforeCloseHooks.entries());
      beforeCloseHooks.clear();

      for (const [name, closeHook] of hooks) {
        await runWithTimeout({
          operation: Promise.resolve().then(closeHook),
          timeoutMs: beforeCloseTimeoutMs,
          timeoutMessage: `Redis before-close hook ${name} timed out`
        }).catch((error) => {
          logger.warn('Redis before-close hook failed', { name, error });
        });
      }

      // 阻塞连接先退出，随后关闭队列连接，最后才关闭普通命令连接。
      const closeRoleGroups: readonly RedisConnectionRole[][] = [
        ['blocking'],
        ['worker', 'queue'],
        ['command', 'legacy-command']
      ];
      for (const roles of closeRoleGroups) {
        const clients = Array.from(connections.entries())
          .filter(([, connection]) => roles.includes(connection.role))
          .map(([client]) => client);
        await Promise.all(clients.map(releaseConnection));
      }
      state = 'closed';
    })();

    return closePromise;
  };

  return {
    endpoint,
    getLegacyCommandConnection,
    getCommandConnection,
    createBlockingConnection: () => createConnection('blocking'),
    createQueueConnection: () => createConnection('queue'),
    createWorkerConnection: () => createConnection('worker'),
    registerBeforeCloseHook,
    getConnectionSnapshot: () => Array.from(connections.values()).map((item) => ({ ...item })),
    checkHealth: async () => {
      const startedAt = Date.now();
      const response = await runWithTimeout({
        operation: getCommandConnection().ping(),
        timeoutMs: healthCheckTimeoutMs,
        timeoutMessage: 'Redis health check timed out'
      });
      if (response !== 'PONG') {
        throw new Error('Redis health check returned an unexpected response');
      }
      return {
        latencyMs: Date.now() - startedAt,
        endpoint
      };
    },
    releaseConnection,
    close
  };
};

export type RedisRuntime = ReturnType<typeof useRedisRuntime>;

/** 获取当前进程唯一的 Redis Runtime；兼容 Next.js 开发态模块热重载。 */
export const getRedisRuntime = (): RedisRuntime => {
  if (!global.redisRuntime) {
    global.redisRuntime = useRedisRuntime({
      redisUrl: serviceEnv.REDIS_URL,
      existingCommandClient: global.redisClient ?? undefined
    });
  }
  return global.redisRuntime;
};

/** @deprecated 业务模块应迁移到对应 Redis Store，不再直接获取 client。 */
export const getGlobalRedisConnection = () => {
  const client = getRedisRuntime().getLegacyCommandConnection();
  global.redisClient = client;
  return client;
};

/** @internal 仅供显式物理 key capability 使用，禁止业务模块直接依赖。 */
export const getPhysicalRedisConnection = () => getRedisRuntime().getCommandConnection();
export const createBlockingRedisConnection = () => getRedisRuntime().createBlockingConnection();
export const createQueueRedisConnection = () => getRedisRuntime().createQueueConnection();
export const createWorkerRedisConnection = () => getRedisRuntime().createWorkerConnection();
export const getRedisConnectionSnapshot = () => getRedisRuntime().getConnectionSnapshot();
export const checkRedisHealth = () => getRedisRuntime().checkHealth();
export const closeRedisConnections = async () => {
  const runtime = global.redisRuntime;
  if (!runtime) {
    try {
      global.redisClient?.disconnect();
    } catch (error) {
      logger.warn('Orphaned Redis client disconnect failed', { error });
    }
    global.redisClient = null;
    return;
  }

  await runtime.close();
  if (global.redisRuntime === runtime) {
    global.redisRuntime = undefined;
    global.redisClient = null;
  }
};

export type { RedisEndpoint };

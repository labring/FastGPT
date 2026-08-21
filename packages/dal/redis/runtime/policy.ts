import type { RedisOptions } from 'ioredis';
import type { RedisClient, RedisConnectionRole, RedisConnectionState } from './connection';
import type { RedisRuntimeLogger } from '../types';

const DEFAULT_COMMAND_TIMEOUT_MS = 5_000;

const roleOptions: Record<
  RedisConnectionRole,
  Partial<
    Pick<
      RedisOptions,
      | 'autoResendUnfulfilledCommands'
      | 'commandTimeout'
      | 'enableOfflineQueue'
      | 'maxRetriesPerRequest'
    >
  >
> = {
  command: {
    enableOfflineQueue: true,
    maxRetriesPerRequest: 1,
    commandTimeout: DEFAULT_COMMAND_TIMEOUT_MS,
    autoResendUnfulfilledCommands: false
  },
  blocking: {
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
    autoResendUnfulfilledCommands: false
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

/** 将 ioredis 当前 status 映射为 Runtime 对外暴露的连接状态。 */
export const getInitialConnectionState = (client: RedisClient): RedisConnectionState => {
  if (client.status === 'ready') return 'ready';
  if (client.status === 'connect') return 'connected';
  if (client.status === 'reconnecting') return 'reconnecting';
  if (client.status === 'close') return 'closed';
  return 'connecting';
};

/** 为不同 Redis 连接角色合并 endpoint、重连和队列策略。 */
export const getConnectionOptions = ({
  endpointOptions,
  role,
  logger
}: {
  endpointOptions: RedisOptions;
  role: RedisConnectionRole;
  logger: RedisRuntimeLogger;
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
  ...roleOptions[role]
});

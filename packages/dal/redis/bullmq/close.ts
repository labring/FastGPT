import type { RedisRuntimeLogger } from '../types';

export const closeWithTimeout = ({
  operation,
  resource,
  timeoutMs
}: {
  operation: () => Promise<void>;
  resource: string;
  timeoutMs: number;
}) =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${resource} close timed out`)), timeoutMs);
    Promise.resolve()
      .then(operation)
      .then(resolve, reject)
      .finally(() => clearTimeout(timeout));
  });

/** BullMQ close 超时后断开指定连接；强制断开失败只记录日志，不阻塞其他资源关闭。 */
export const forceDisconnect = ({
  name,
  resource,
  disconnect,
  logger
}: {
  name: string;
  resource: string;
  disconnect: () => Promise<void> | void;
  logger: RedisRuntimeLogger;
}) => {
  try {
    void Promise.resolve(disconnect()).catch((error) => {
      logger.warn(`BullMQ ${resource} forced disconnect failed`, { name, error });
    });
  } catch (error) {
    logger.warn(`BullMQ ${resource} forced disconnect failed`, { name, error });
  }
};

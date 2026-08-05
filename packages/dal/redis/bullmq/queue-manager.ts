import { Queue, type QueueOptions } from 'bullmq';
import type { RedisRuntime } from '../runtime/connection';
import type { RedisRuntimeLogger } from '../types';
import { closeWithTimeout, forceDisconnect } from './close';
import type { BullMQDisconnectable } from './types';
import { BullMQLifecycleListeners } from './listeners';

/** 管理 Queue 的创建、复用、错误 listener 和有序关闭。 */
export class BullMQQueueManager {
  private readonly queues = new Map<string, Queue>();
  private readonly listeners = new BullMQLifecycleListeners();

  constructor(
    private readonly options: {
      redisRuntime: RedisRuntime;
      logger: RedisRuntimeLogger;
      closeTimeoutMs: number;
    }
  ) {}

  getQueue<DataType, ReturnType = void>(
    name: string,
    opts?: Omit<QueueOptions, 'connection'>
  ): Queue<DataType, ReturnType> {
    const existing = this.queues.get(name);
    if (existing) return existing as Queue<DataType, ReturnType>;

    const connection = this.options.redisRuntime.createQueueConnection();
    try {
      const queue = new Queue<DataType, ReturnType>(name, {
        ...opts,
        connection
      });
      const errorHandler = (error: Error) => {
        this.options.logger.error('BullMQ queue error', { name, error });
      };
      this.listeners.registerQueueErrorHandler(queue, errorHandler);
      queue.on('error', errorHandler);
      this.queues.set(name, queue);
      return queue;
    } catch (error) {
      this.releaseConnection(connection);
      throw error;
    }
  }

  async close() {
    const activeQueues = Array.from(this.queues.entries());
    this.queues.clear();
    await Promise.all(activeQueues.map(([name, queue]) => this.closeQueue({ name, queue })));
  }

  private releaseConnection(connection: ReturnType<RedisRuntime['createQueueConnection']>) {
    void this.options.redisRuntime.releaseConnection(connection).catch((error) => {
      this.options.logger.warn(
        'Failed to release Redis connection after BullMQ queue creation error',
        {
          error
        }
      );
    });
  }

  private async closeQueue({ name, queue }: { name: string; queue: Queue }) {
    await closeWithTimeout({
      operation: () => queue.close(),
      resource: `BullMQ queue ${name}`,
      timeoutMs: this.options.closeTimeoutMs
    }).catch((error) => {
      this.options.logger.warn('BullMQ queue close failed', { name, error });
      const queueConnection = (queue as unknown as { connection?: BullMQDisconnectable })
        .connection;
      forceDisconnect({
        name,
        resource: 'queue connection',
        disconnect: queueConnection
          ? () => queueConnection.disconnect(false)
          : () => queue.disconnect(),
        logger: this.options.logger
      });
    });

    this.listeners.removeQueueLifecycleListener(queue);
  }
}

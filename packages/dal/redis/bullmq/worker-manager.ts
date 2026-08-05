import { Worker, type Processor, type WorkerOptions } from 'bullmq';
import type { RedisRuntime } from '../runtime/connection';
import type { RedisRuntimeLogger } from '../types';
import { closeWithTimeout, forceDisconnect } from './close';
import { delay } from './constants';
import { BullMQLifecycleListeners } from './listeners';
import type {
  BullMQDisconnectable,
  BullMQEventListener,
  BullMQRuntimeState,
  BullMQWorkerLifecycleOptions,
  WorkerListenerSnapshot
} from './types';

/** 管理 Worker 的创建、异常恢复、业务 listener 迁移和有序关闭。 */
export class BullMQWorkerManager {
  private readonly workers = new Map<string, Worker>();
  private readonly restartingWorkers = new Set<string>();
  private readonly listeners = new BullMQLifecycleListeners();
  private readonly lifecycle: Required<BullMQWorkerLifecycleOptions>;

  constructor(
    private readonly options: {
      redisRuntime: RedisRuntime;
      logger: RedisRuntimeLogger;
      closeTimeoutMs: number;
      workerLifecycle: Required<BullMQWorkerLifecycleOptions>;
      getState: () => BullMQRuntimeState;
    }
  ) {
    this.lifecycle = options.workerLifecycle;
  }

  getWorker<DataType, ReturnType = void>(
    name: string,
    processor: Processor<DataType, ReturnType>,
    opts?: Omit<WorkerOptions, 'connection'>
  ): Worker<DataType, ReturnType> {
    const existing = this.workers.get(name);
    if (existing) return existing as Worker<DataType, ReturnType>;
    if (this.restartingWorkers.has(name)) {
      throw new Error(`BullMQ worker ${name} is restarting`);
    }

    const worker = this.createWorker({ name, processor, opts });
    this.workers.set(name, worker);
    return worker;
  }

  async close() {
    const activeWorkers = Array.from(this.workers.entries());
    this.workers.clear();
    this.restartingWorkers.clear();
    await Promise.all(activeWorkers.map(([name, worker]) => this.closeWorker({ name, worker })));
  }

  private createWorker<DataType, ReturnType>({
    name,
    processor,
    opts,
    listeners
  }: {
    name: string;
    processor: Processor<DataType, ReturnType>;
    opts?: Omit<WorkerOptions, 'connection'>;
    listeners?: readonly WorkerListenerSnapshot[];
  }): Worker<DataType, ReturnType> {
    const connection = this.options.redisRuntime.createWorkerConnection();
    try {
      const worker = new Worker<DataType, ReturnType>(name, processor, {
        ...opts,
        connection
      });
      const lifecycleHandlers = new Set<BullMQEventListener>();

      const readyHandler: BullMQEventListener = () => {
        this.options.logger.info('BullMQ worker ready', { name });
      };
      const errorHandler: BullMQEventListener = (error) => {
        this.options.logger.error('BullMQ worker error', { name, error });
      };
      const closedHandler: BullMQEventListener = () => {
        if (this.workers.get(name) !== worker) return;

        this.workers.delete(name);
        const shouldRestart =
          this.options.getState() === 'running' && this.lifecycle.restartOnClose;
        const businessListeners = shouldRestart
          ? this.listeners.captureWorkerBusinessListeners(worker, lifecycleHandlers)
          : undefined;
        this.listeners.removeWorkerLifecycleListeners(worker);

        if (!shouldRestart) return;

        this.restartingWorkers.add(name);
        this.options.logger.warn('BullMQ worker closed, attempting restart', { name });
        void this.restartWorker({ name, processor, opts, listeners: businessListeners }).finally(
          () => {
            this.restartingWorkers.delete(name);
          }
        );
      };
      const pausedHandler: BullMQEventListener = () => {
        if (
          this.options.getState() !== 'running' ||
          !this.lifecycle.resumeOnPause ||
          this.workers.get(name) !== worker
        ) {
          return;
        }

        this.options.logger.warn('BullMQ worker paused', { name });
        void delay(this.lifecycle.restartDelayMs)
          .then(() => {
            if (this.options.getState() === 'running' && this.workers.get(name) === worker) {
              return worker.resume();
            }
            return undefined;
          })
          .catch((error) => {
            this.options.logger.warn('BullMQ worker resume failed', { name, error });
          });
      };

      lifecycleHandlers.add(readyHandler);
      lifecycleHandlers.add(errorHandler);
      lifecycleHandlers.add(closedHandler);
      lifecycleHandlers.add(pausedHandler);
      this.listeners.registerWorkerLifecycleHandlers(worker, lifecycleHandlers);
      worker.on('ready', readyHandler);
      worker.on('error', errorHandler);
      worker.on('closed', closedHandler);
      worker.on('paused', pausedHandler);
      this.listeners.restoreWorkerBusinessListeners(worker, listeners);

      return worker;
    } catch (error) {
      this.releaseConnection(connection);
      throw error;
    }
  }

  private async restartWorker<DataType, ReturnType>({
    name,
    processor,
    opts,
    listeners
  }: {
    name: string;
    processor: Processor<DataType, ReturnType>;
    opts?: Omit<WorkerOptions, 'connection'>;
    listeners?: readonly WorkerListenerSnapshot[];
  }) {
    while (this.options.getState() === 'running') {
      try {
        const worker = this.createWorker({ name, processor, opts, listeners });
        if (this.options.getState() !== 'running') {
          await this.closeWorker({ name, worker });
          return;
        }

        this.workers.set(name, worker);
        this.options.logger.info('BullMQ worker restarted successfully', { name });
        return;
      } catch (error) {
        this.options.logger.error('BullMQ worker restart failed, will retry', { name, error });
        await delay(this.lifecycle.restartDelayMs);
      }
    }
  }

  private releaseConnection(connection: ReturnType<RedisRuntime['createWorkerConnection']>) {
    void this.options.redisRuntime.releaseConnection(connection).catch((error) => {
      this.options.logger.warn(
        'Failed to release Redis connection after BullMQ worker creation error',
        { error }
      );
    });
  }

  private async closeWorker({ name, worker }: { name: string; worker: Worker }) {
    await closeWithTimeout({
      operation: () => worker.close(true),
      resource: `BullMQ worker ${name}`,
      timeoutMs: this.options.closeTimeoutMs
    }).catch((error) => {
      this.options.logger.warn('BullMQ worker close failed', { name, error });
      const workerConnection = (worker as unknown as { connection?: BullMQDisconnectable })
        .connection;
      forceDisconnect({
        name,
        resource: 'worker connection',
        disconnect: workerConnection
          ? () => workerConnection.disconnect(false)
          : () => worker.disconnect(),
        logger: this.options.logger
      });

      const blockingConnection = (
        worker as unknown as { blockingConnection?: BullMQDisconnectable }
      ).blockingConnection;
      if (blockingConnection) {
        forceDisconnect({
          name,
          resource: 'worker blocking connection',
          disconnect: () => blockingConnection.disconnect(false),
          logger: this.options.logger
        });
      }
    });

    this.listeners.removeWorkerLifecycleListeners(worker);
  }
}

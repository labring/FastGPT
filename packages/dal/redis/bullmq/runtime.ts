import type { FlowProducer, Processor, Queue, QueueOptions, Worker, WorkerOptions } from 'bullmq';
import type { RedisRuntime } from '../runtime/connection';
import {
  DEFAULT_CLOSE_TIMEOUT_MS,
  DEFAULT_RESTART_DELAY_MS,
  silentBullMQLogger
} from './constants';
import { BullMQQueueManager } from './queue-manager';
import { BullMQFlowProducerManager } from './flow-producer-manager';
import type {
  BullMQRuntimeState,
  BullMQWorkerLifecycleOptions,
  RedisBullMQRuntimeOptions
} from './types';
import { BullMQWorkerManager } from './worker-manager';
import type { RedisRuntimeLogger } from '../types';

/** 管理 DAL Redis Runtime 所拥有的 BullMQ Queue/Worker 生命周期。 */
export class RedisBullMQRuntime {
  readonly redisRuntime: RedisRuntime;

  private readonly logger: RedisRuntimeLogger;
  private readonly queueManager: BullMQQueueManager;
  private readonly flowProducerManager: BullMQFlowProducerManager;
  private readonly workerManager: BullMQWorkerManager;
  private readonly unregisterBeforeCloseHook: () => void;
  private state: BullMQRuntimeState = 'running';
  private closePromise: Promise<void> | undefined;

  constructor({
    redisRuntime,
    logger = silentBullMQLogger,
    closeTimeoutMs = DEFAULT_CLOSE_TIMEOUT_MS,
    workerLifecycle = {},
    hookName = 'bullmq'
  }: RedisBullMQRuntimeOptions) {
    this.redisRuntime = redisRuntime;
    this.logger = logger;
    const normalizedLifecycle: Required<BullMQWorkerLifecycleOptions> = {
      restartOnClose: workerLifecycle.restartOnClose ?? false,
      resumeOnPause: workerLifecycle.resumeOnPause ?? false,
      restartDelayMs: workerLifecycle.restartDelayMs ?? DEFAULT_RESTART_DELAY_MS
    };
    this.queueManager = new BullMQQueueManager({
      redisRuntime,
      logger,
      closeTimeoutMs
    });
    this.flowProducerManager = new BullMQFlowProducerManager({
      redisRuntime,
      logger,
      closeTimeoutMs
    });
    this.workerManager = new BullMQWorkerManager({
      redisRuntime,
      logger,
      closeTimeoutMs,
      workerLifecycle: normalizedLifecycle,
      getState: () => this.state
    });
    this.unregisterBeforeCloseHook = redisRuntime.registerBeforeCloseHook({
      name: hookName,
      close: () => this.close()
    });
  }

  getState() {
    return this.state;
  }

  /** 返回当前 BullMQ Runtime 使用的通用日志 port。 */
  getLogger() {
    return this.logger;
  }

  getQueue<DataType, ReturnType = void>(
    name: string,
    opts?: Omit<QueueOptions, 'connection'>
  ): Queue<DataType, ReturnType> {
    this.assertRunning();
    return this.queueManager.getQueue<DataType, ReturnType>(name, opts);
  }

  getWorker<DataType, ReturnType = void>(
    name: string,
    processor: Processor<DataType, ReturnType>,
    opts?: Omit<WorkerOptions, 'connection'>
  ): Worker<DataType, ReturnType> {
    this.assertRunning();
    return this.workerManager.getWorker<DataType, ReturnType>(name, processor, opts);
  }

  /** Returns the Runtime-shared FlowProducer, which owns a dedicated queue connection. */
  getFlowProducer(): FlowProducer {
    this.assertRunning();
    return this.flowProducerManager.getFlowProducer();
  }

  close() {
    if (this.closePromise) return this.closePromise;

    this.state = 'shutting-down';
    this.closePromise = Promise.resolve()
      .then(async () => {
        // Worker 内部拥有 blocking duplicate，必须先于 Queue 和 Redis Runtime 连接关闭。
        let firstError: unknown;
        let hasError = false;

        try {
          await this.workerManager.close();
        } catch (error) {
          firstError = error;
          hasError = true;
        }

        // Worker 关闭失败也不能跳过 Queue，否则队列连接会被 Redis Runtime 强制回收。
        try {
          await this.flowProducerManager.close();
        } catch (error) {
          firstError = error;
          hasError = true;
        }

        try {
          await this.queueManager.close();
        } catch (error) {
          if (!hasError) {
            firstError = error;
            hasError = true;
          }
        }

        if (hasError) throw firstError;
      })
      .finally(() => {
        this.state = 'closed';
        this.unregisterBeforeCloseHook();
      });

    return this.closePromise;
  }

  private assertRunning() {
    if (this.state !== 'running') {
      throw new Error(`BullMQ runtime is ${this.state}`);
    }
  }
}

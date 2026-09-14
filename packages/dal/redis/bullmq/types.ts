import type {
  ConnectionOptions,
  FlowJob,
  FlowProducer,
  Job,
  JobNode,
  JobSchedulerJson,
  Processor,
  Queue,
  QueueOptions,
  Worker,
  WorkerOptions
} from 'bullmq';
import type { RedisRuntime } from '../runtime/connection';
import type { RedisRuntimeLogger } from '../types';

export type BullMQRuntimeState = 'running' | 'shutting-down' | 'closed';

/** BullMQ worker 在 Redis 连接异常关闭时的可选恢复策略。 */
export type BullMQWorkerLifecycleOptions = {
  restartOnClose?: boolean;
  resumeOnPause?: boolean;
  restartDelayMs?: number;
};

export type RedisBullMQRuntimeOptions = {
  redisRuntime: RedisRuntime;
  logger?: RedisRuntimeLogger;
  closeTimeoutMs?: number;
  workerLifecycle?: BullMQWorkerLifecycleOptions;
  hookName?: string;
};

export type BullMQDisconnectable = {
  disconnect: (wait?: boolean) => Promise<void> | void;
};

export type BullMQEventListener = (...args: any[]) => unknown;

export type WorkerListenerSnapshot = {
  eventName: string | symbol;
  listener: BullMQEventListener;
  once: boolean;
};

export type {
  ConnectionOptions,
  FlowJob,
  FlowProducer,
  Job,
  JobNode,
  JobSchedulerJson,
  Processor,
  Queue,
  QueueOptions,
  Worker,
  WorkerOptions
};

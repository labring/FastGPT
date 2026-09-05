import { getRedisRuntime } from '../runtime';
import { getRedisBullMQRuntime } from './context';
import type { QueueNames } from './names';
import type { FlowProducer, Processor, Queue, QueueOptions, Worker, WorkerOptions } from './types';

const defaultWorkerOpts: Omit<WorkerOptions, 'connection'> = {
  removeOnComplete: {
    count: 0 // Delete jobs immediately on completion
  },
  removeOnFail: {
    count: 0 // Delete jobs immediately on failure
  },
  // BullMQ Worker important settings
  lockDuration: 600000, // 10 minutes for large file operations
  stalledInterval: 30000, // Check for stalled jobs every 30s
  maxStalledCount: 3 // Move job to failed after 1 stall (default behavior)
};

/**
 * DAL BullMQ Runtime 的业务绑定。
 *
 * 这个类只放默认 Worker 配置，不缓存 Runtime。Runtime 本身由 DAL 通过进程级 context
 * 复用；这样 Redis Runtime 关闭后重新配置时，binding 不会继续持有旧实例。
 */
export class BullMQBinding {
  private getRuntime() {
    const redisRuntime = getRedisRuntime();
    return getRedisBullMQRuntime({
      redisRuntime,
      logger: redisRuntime.getLogger(),
      workerLifecycle: {
        restartOnClose: true,
        resumeOnPause: true
      }
    });
  }

  /** 返回当前绑定的通用日志 port，业务合同只依赖这个最小能力。 */
  getLogger() {
    return this.getRuntime().getLogger();
  }

  /** 获取或创建业务队列；连接和 Queue 生命周期由 DAL 管理。 */
  getQueue<DataType, ReturnType = void>(
    name: QueueNames,
    opts?: Omit<QueueOptions, 'connection'>
  ): Queue<DataType, ReturnType> {
    return this.getRuntime().getQueue<DataType, ReturnType>(name, opts);
  }

  /** 获取或创建业务 Worker；默认项和生命周期均由 DAL 管理。 */
  getWorker<DataType, ReturnType = void>(
    name: QueueNames,
    processor: Processor<DataType, ReturnType>,
    opts?: Omit<WorkerOptions, 'connection'>
  ): Worker<DataType, ReturnType> {
    return this.getRuntime().getWorker<DataType, ReturnType>(name, processor, {
      ...defaultWorkerOpts,
      ...opts
    });
  }

  /** Returns the Runtime-owned FlowProducer for atomically creating dependent job trees. */
  getFlowProducer(): FlowProducer {
    return this.getRuntime().getFlowProducer();
  }
}

/** 进程级 BullMQ 绑定。 */
export const bullMQ = new BullMQBinding();

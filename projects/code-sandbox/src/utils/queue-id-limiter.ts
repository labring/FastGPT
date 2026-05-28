type QueueState = {
  running: number;
  waiters: Array<() => void>;
};

export type QueueIdLimiterStats = {
  enabled: boolean;
  maxConcurrency?: number;
  queueCount: number;
  queues: Array<{
    queueId: string;
    running: number;
    queued: number;
  }>;
};

/**
 * 按 queueId 控制进入执行流程的请求并发。
 *
 * limiter 只负责同一个 queueId 内的 FIFO 限流；真实 worker 分配仍交给
 * ProcessPool 的等待队列处理，避免把业务排队规则耦合到 worker 生命周期管理。
 */
export class QueueIdLimiter {
  private readonly queues = new Map<string, QueueState>();

  constructor(private readonly maxConcurrency?: number) {
    if (maxConcurrency !== undefined && (!Number.isInteger(maxConcurrency) || maxConcurrency < 1)) {
      throw new Error('QueueIdLimiter maxConcurrency must be a positive integer');
    }
  }

  get enabled(): boolean {
    return this.maxConcurrency !== undefined;
  }

  /**
   * 在指定 queueId 的并发限制下执行任务。
   *
   * 未启用 limiter 或 queueId 为空时直接执行，保持历史接口行为。
   */
  async run<T>(queueId: string | undefined, task: () => Promise<T>): Promise<T> {
    if (!this.enabled || !queueId) {
      return task();
    }

    await this.acquire(queueId);
    try {
      return await task();
    } finally {
      this.release(queueId);
    }
  }

  get stats(): QueueIdLimiterStats {
    return {
      enabled: this.enabled,
      maxConcurrency: this.maxConcurrency,
      queueCount: this.queues.size,
      queues: Array.from(this.queues.entries()).map(([queueId, state]) => ({
        queueId,
        running: state.running,
        queued: state.waiters.length
      }))
    };
  }

  private acquire(queueId: string): Promise<void> {
    const state = this.getOrCreateQueue(queueId);

    if (state.running < this.maxConcurrency!) {
      state.running++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      state.waiters.push(resolve);
    });
  }

  private release(queueId: string): void {
    const state = this.queues.get(queueId);
    if (!state) return;

    const next = state.waiters.shift();
    if (next) {
      // 直接把当前运行名额转交给等待队列头部，running 保持不变。
      next();
      return;
    }

    state.running = Math.max(0, state.running - 1);
    if (state.running === 0) {
      this.queues.delete(queueId);
    }
  }

  private getOrCreateQueue(queueId: string): QueueState {
    const existing = this.queues.get(queueId);
    if (existing) return existing;

    const state: QueueState = { running: 0, waiters: [] };
    this.queues.set(queueId, state);
    return state;
  }
}

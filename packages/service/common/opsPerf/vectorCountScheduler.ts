const SCHEDULER_SYMBOL = Symbol.for('fastgpt.opsPerf.vectorCountScheduler');

export const OPS_PERF_VECTOR_COUNT_MAX_CONCURRENCY = 4;
export const OPS_PERF_VECTOR_COUNT_MAX_QUEUE_SIZE = 64;
const DEFAULT_VECTOR_COUNT_TIMEOUT_MS = 3_000;

type FetchVectorCountFn = (params: { teamId: string; datasetId: string }) => Promise<number>;

type VectorCountWaiter = {
  resolve: (value: number | undefined) => void;
};

type ScheduledCountTask = {
  key: string;
  teamId: string;
  datasetId: string;
  fetchCount: FetchVectorCountFn;
  state: 'queued' | 'running' | 'done';
  waiters: Set<VectorCountWaiter>;
};

type BatchFeeder = {
  feed: () => void;
};

type SchedulerState = {
  runningCount: number;
  maxConcurrency: number;
  maxQueueSize: number;
  queue: ScheduledCountTask[];
  tasks: Map<string, ScheduledCountTask>;
  /** 仍有未入队知识库等待容量槽位的活跃批次（按轮转顺序唤醒）。 */
  pendingBatches: Set<BatchFeeder>;
};

const getSchedulerState = (): SchedulerState => {
  const existing = Reflect.get(globalThis, SCHEDULER_SYMBOL) as SchedulerState | undefined;
  if (existing) return existing;

  const state: SchedulerState = {
    runningCount: 0,
    maxConcurrency: OPS_PERF_VECTOR_COUNT_MAX_CONCURRENCY,
    maxQueueSize: OPS_PERF_VECTOR_COUNT_MAX_QUEUE_SIZE,
    queue: [],
    tasks: new Map(),
    pendingBatches: new Set()
  };
  Reflect.set(globalThis, SCHEDULER_SYMBOL, state);
  return state;
};

const removeQueuedTask = (state: SchedulerState, task: ScheduledCountTask) => {
  if (task.state !== 'queued') return;
  task.state = 'done';
  state.tasks.delete(task.key);
  const idx = state.queue.indexOf(task);
  if (idx !== -1) {
    state.queue.splice(idx, 1);
  }
};

/** 当共享队列释放出槽位时，按轮转顺序唤醒仍在滚动补齐的活跃批次。 */
const drainPendingBatches = (state: SchedulerState) => {
  if (state.pendingBatches.size === 0 || state.queue.length >= state.maxQueueSize) return;
  const feeders = Array.from(state.pendingBatches);
  for (const feeder of feeders) {
    if (state.queue.length >= state.maxQueueSize) break;
    if (!state.pendingBatches.has(feeder)) continue;
    // 移至队尾实现跨请求公平轮转，避免单一大批次饿死其他并发请求
    state.pendingBatches.delete(feeder);
    state.pendingBatches.add(feeder);
    feeder.feed();
  }
};

const pumpQueue = (state: SchedulerState) => {
  while (state.runningCount < state.maxConcurrency && state.queue.length > 0) {
    const task = state.queue.shift()!;
    if (task.state !== 'queued' || task.waiters.size === 0) {
      task.state = 'done';
      state.tasks.delete(task.key);
      continue;
    }

    task.state = 'running';
    state.runningCount += 1;

    void Promise.resolve()
      .then(() => task.fetchCount({ teamId: task.teamId, datasetId: task.datasetId }))
      .then(
        (count) => {
          const valid =
            typeof count === 'number' && Number.isFinite(count) && count >= 0 ? count : undefined;
          return valid;
        },
        () => undefined
      )
      .then((result) => {
        task.state = 'done';
        state.tasks.delete(task.key);
        const waiters = Array.from(task.waiters);
        task.waiters.clear();
        for (const waiter of waiters) {
          waiter.resolve(result);
        }
      })
      .finally(() => {
        state.runningCount = Math.max(0, state.runningCount - 1);
        drainPendingBatches(state);
        pumpQueue(state);
      });
  }
};

/**
 * 进程级共享的冷缓存向量计数补齐调度器。
 *
 * - 全进程共享并发上限（默认 4）与待处理队列上限（默认 64），避免并发冷检索放大底层 COUNT 压力
 * - 单次多知识库请求（如结构化检索最多 100 库）按滑动窗口滚动入队，既不会因超过队列上限整体失败，
 *   也不会一次性占满共享队列饿死其他并发请求；队列已满时新到达请求立即过载降级返回 undefined
 * - 按 `teamId:datasetId` 去重合并并发等待方
 * - 等待批次超时或任一项失败时立刻停止滚动并退订所有未开始任务，无人等待的排队任务直接丢弃
 */
export const scheduleVectorCountsForPerf = async ({
  teamId,
  datasetIds,
  fetchCount,
  timeoutMs = DEFAULT_VECTOR_COUNT_TIMEOUT_MS
}: {
  teamId: string;
  datasetIds: string[];
  fetchCount: FetchVectorCountFn;
  timeoutMs?: number;
}): Promise<{ totalIndexCount: number; maxDatasetIndexCount: number } | undefined> => {
  const uniqueIds = [...new Set(datasetIds.map(String))].filter(Boolean);
  if (uniqueIds.length === 0) return undefined;

  const state = getSchedulerState();
  const teamIdStr = String(teamId);
  // 单批次最多同时占用 min(maxConcurrency, maxQueueSize) 个槽位，保证大请求可滚动跑完且不饿死小请求
  const batchWindow = Math.max(1, Math.min(state.maxConcurrency, state.maxQueueSize));

  return new Promise((resolveBatch) => {
    let settled = false;
    let nextIndex = 0;
    let inFlight = 0;
    let remaining = uniqueIds.length;
    const results = new Array<number>(uniqueIds.length);
    const subscriptions = new Map<VectorCountWaiter, ScheduledCountTask>();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const cleanupSubscriptions = () => {
      let freedQueued = false;
      for (const [waiter, task] of subscriptions.entries()) {
        task.waiters.delete(waiter);
        if (task.state === 'queued' && task.waiters.size === 0) {
          removeQueuedTask(state, task);
          freedQueued = true;
        }
      }
      subscriptions.clear();
      if (freedQueued) {
        drainPendingBatches(state);
        pumpQueue(state);
      }
    };

    const finish = (value?: { totalIndexCount: number; maxDatasetIndexCount: number }) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
      state.pendingBatches.delete(feeder);
      cleanupSubscriptions();
      resolveBatch(value);
    };

    const feed = () => {
      while (!settled && nextIndex < uniqueIds.length && inFlight < batchWindow) {
        const index = nextIndex;
        const datasetId = uniqueIds[index]!;
        const key = `${teamIdStr}:${datasetId}`;
        let task = state.tasks.get(key);

        if (!task) {
          if (state.queue.length >= state.maxQueueSize) {
            break;
          }
          task = {
            key,
            teamId: teamIdStr,
            datasetId,
            fetchCount,
            state: 'queued',
            waiters: new Set()
          };
          state.tasks.set(key, task);
          state.queue.push(task);
        }

        nextIndex += 1;
        inFlight += 1;

        const waiter: VectorCountWaiter = {
          resolve: (count) => {
            subscriptions.delete(waiter);
            inFlight = Math.max(0, inFlight - 1);
            if (settled) return;
            if (count === undefined) {
              finish(undefined);
              return;
            }
            results[index] = count;
            remaining -= 1;
            if (remaining === 0) {
              let totalIndexCount = 0;
              let maxDatasetIndexCount = 0;
              for (const c of results) {
                totalIndexCount += c;
                if (c > maxDatasetIndexCount) maxDatasetIndexCount = c;
              }
              finish({ totalIndexCount, maxDatasetIndexCount });
              return;
            }
            feed();
            pumpQueue(state);
          }
        };

        task.waiters.add(waiter);
        subscriptions.set(waiter, task);
      }

      if (!settled && nextIndex < uniqueIds.length) {
        if (state.pendingBatches.has(feeder) || state.pendingBatches.size < state.maxQueueSize) {
          state.pendingBatches.add(feeder);
        } else {
          finish(undefined);
        }
      } else {
        state.pendingBatches.delete(feeder);
      }
    };

    const feeder: BatchFeeder = { feed };

    feed();

    // 共享队列已饱和导致新批次连首个任务都无法提交时立即过载降级，避免无界积压等待者
    if (!settled && nextIndex === 0 && inFlight === 0) {
      finish(undefined);
      return;
    }

    if (settled) return;

    if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
      timeoutHandle = setTimeout(() => {
        finish(undefined);
      }, timeoutMs);
      timeoutHandle.unref?.();
    }

    pumpQueue(state);
  });
};

/** 仅用于测试重置进程级调度器状态与参数。 */
export const resetPerfVectorCountSchedulerForTest = (options?: {
  maxConcurrency?: number;
  maxQueueSize?: number;
}) => {
  const state = getSchedulerState();
  state.runningCount = 0;
  state.maxConcurrency = options?.maxConcurrency ?? OPS_PERF_VECTOR_COUNT_MAX_CONCURRENCY;
  state.maxQueueSize = options?.maxQueueSize ?? OPS_PERF_VECTOR_COUNT_MAX_QUEUE_SIZE;
  state.queue = [];
  state.tasks.clear();
  state.pendingBatches.clear();
};

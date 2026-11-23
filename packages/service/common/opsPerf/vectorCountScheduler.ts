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

type SchedulerState = {
  runningCount: number;
  maxConcurrency: number;
  maxQueueSize: number;
  queue: ScheduledCountTask[];
  tasks: Map<string, ScheduledCountTask>;
};

const getSchedulerState = (): SchedulerState => {
  const existing = Reflect.get(globalThis, SCHEDULER_SYMBOL) as SchedulerState | undefined;
  if (existing) return existing;

  const state: SchedulerState = {
    runningCount: 0,
    maxConcurrency: OPS_PERF_VECTOR_COUNT_MAX_CONCURRENCY,
    maxQueueSize: OPS_PERF_VECTOR_COUNT_MAX_QUEUE_SIZE,
    queue: [],
    tasks: new Map()
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
        pumpQueue(state);
      });
  }
};

/**
 * 进程级共享的冷缓存向量计数补齐调度器。
 *
 * - 全进程共享并发上限（默认 4）与积压队列上限（默认 64），避免并发冷检索放大底层 COUNT 压力
 * - 按 `teamId:datasetId` 去重合并并发等待方
 * - 等待批次超时或任一项失败时立刻退订所有未开始任务；无人等待的排队任务在出队前直接丢弃，
 *   确保过期请求绝不再派发新的底层计数查询
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

  return new Promise((resolveBatch) => {
    let settled = false;
    let remaining = uniqueIds.length;
    const results = new Array<number>(uniqueIds.length);
    const subscriptions: Array<{ task: ScheduledCountTask; waiter: VectorCountWaiter }> = [];
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const cleanupSubscriptions = () => {
      for (const { task, waiter } of subscriptions) {
        task.waiters.delete(waiter);
        if (task.state === 'queued' && task.waiters.size === 0) {
          removeQueuedTask(state, task);
        }
      }
      subscriptions.length = 0;
    };

    const finish = (value?: { totalIndexCount: number; maxDatasetIndexCount: number }) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
      cleanupSubscriptions();
      resolveBatch(value);
    };

    for (let i = 0; i < uniqueIds.length; i++) {
      const datasetId = uniqueIds[i]!;
      const key = `${teamIdStr}:${datasetId}`;
      let task = state.tasks.get(key);

      if (!task) {
        if (state.queue.length >= state.maxQueueSize) {
          finish(undefined);
          return;
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

      const index = i;
      const waiter: VectorCountWaiter = {
        resolve: (count) => {
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
          }
        }
      };

      task.waiters.add(waiter);
      subscriptions.push({ task, waiter });
    }

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
};

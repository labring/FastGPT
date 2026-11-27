export const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve('');
    }, ms);
  });

/**
 * 把 AbortSignal 的 reason 归一为 Error。
 * `controller.abort(reason)` 允许传入任意值，调用方 reject/throw/destroy 流时需要 Error 实例，
 * 非 Error reason 统一包装为 `Error('Aborted')`。
 */
export const getAbortError = (signal: AbortSignal): Error => {
  if (signal.reason instanceof Error) return signal.reason;
  const abortError = new Error('Aborted');
  abortError.name = 'AbortError';
  return abortError;
};

/** signal 已中断时抛出归一后的中断错误，用于长任务循环中的检查点。 */
export const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw getAbortError(signal);
};

/** 可被 signal 中断的 delay：中断时清理定时器并以归一后的中断错误 reject。 */
export const delayWithSignal = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (!signal) {
      setTimeout(resolve, ms);
      return;
    }
    if (signal.aborted) {
      reject(getAbortError(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(getAbortError(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });

export const retryFn = async <T>(fn: () => Promise<T>, attempts = 3): Promise<T> => {
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempts <= 0) {
        return Promise.reject(error);
      }
      await delay(500);
      attempts--;
    }
  }
};

export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage = `Operation timed out after ${timeoutMs}ms`
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/** 按固定并发执行任务；任一任务失败时立即向调用方抛出该错误。 */
export const batchRun = async <T, R>(
  arr: T[],
  fn: (item: T, index: number) => Promise<R>,
  batchSize = 10
): Promise<R[]> => {
  const result: R[] = new Array(arr.length);
  let nextIndex = 0;
  // 任一任务失败后，其余并发槽不再领取新任务：调用方已经收到错误，
  // 继续跑剩下的任务只会在后台产生无人接收的副作用（例如继续调用模型）。
  let failed = false;
  const batchFn = async () => {
    while (!failed && nextIndex < arr.length) {
      const currentIndex = nextIndex++;
      try {
        result[currentIndex] = await fn(arr[currentIndex], currentIndex);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(batchSize, arr.length) }, () => batchFn()));
  return result;
};

export type BatchRunSettledResult<T> =
  | { success: true; data: T }
  | { success: false; error: unknown };

/** 按固定并发执行全部任务，并按输入顺序返回每项成功或失败结果。 */
export const batchRunSettled = async <T, R>(
  arr: T[],
  fn: (item: T, index: number) => Promise<R>,
  batchSize = 10
): Promise<BatchRunSettledResult<R>[]> =>
  batchRun(
    arr,
    async (item, index) => {
      try {
        return { success: true, data: await fn(item, index) } as const;
      } catch (error) {
        return { success: false, error } as const;
      }
    },
    batchSize
  );

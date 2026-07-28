export const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve('');
    }, ms);
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
  const batchFn = async () => {
    while (nextIndex < arr.length) {
      const currentIndex = nextIndex++;
      result[currentIndex] = await fn(arr[currentIndex], currentIndex);
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

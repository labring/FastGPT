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

/** 按固定并发执行任务；waitForAll 仅用于调用方必须等待所有 worker 收敛后再抛错的场景。 */
export const batchRun = async <T, R>(
  arr: T[],
  fn: (item: T, index: number) => Promise<R>,
  batchSize = 10,
  options: { waitForAll?: boolean } = {}
): Promise<R[]> => {
  const result: R[] = new Array(arr.length);
  const errors: Array<{ index: number; error: unknown }> = [];
  let nextIndex = 0;
  const batchFn = async () => {
    while (nextIndex < arr.length) {
      const currentIndex = nextIndex++;
      try {
        result[currentIndex] = await fn(arr[currentIndex], currentIndex);
      } catch (error) {
        if (!options.waitForAll) throw error;
        errors.push({ index: currentIndex, error });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(batchSize, arr.length) }, () => batchFn()));
  if (errors.length > 0) {
    errors.sort((a, b) => a.index - b.index);
    throw errors[0].error;
  }
  return result;
};

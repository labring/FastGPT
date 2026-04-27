export const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve('');
    }, ms);
  });

export const retryFn = async <T>(fn: () => Promise<T>, attempts = 3, delayMs = 500): Promise<T> => {
  const initialAttempts = attempts;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const currentAttempt = initialAttempts - attempts + 1;
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[retryFn] Attempt ${currentAttempt}/${initialAttempts} failed: ${errMsg}`, {
        error: errMsg,
        stack: error instanceof Error ? error.stack : undefined,
        remainingAttempts: attempts,
        delayMs
      });
      if (attempts <= 0) {
        console.error(`[retryFn] All ${initialAttempts} attempts exhausted, rejecting`);
        return Promise.reject(error);
      }
      await delay(delayMs);
      attempts--;
    }
  }
};

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

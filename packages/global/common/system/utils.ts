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

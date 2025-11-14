export const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve('');
    }, ms);
  });

export const retryFn = async <T>(fn: () => Promise<T>, attempts = 3): Promise<T> => {
  while (true) {
    try {
      return fn();
    } catch (error) {
      if (attempts <= 0) {
        return Promise.reject(error);
      }
      await delay(500);
      attempts--;
    }
  }
};

export const batchRun = async <T>(arr: T[], fn: (arr: T) => any, batchSize = 10) => {
  const batchArr = new Array(batchSize).fill(null);
  const result: any[] = [];

  const batchFn = async () => {
    const data = arr.shift();
    if (data) {
      result.push(await fn(data));
      return batchFn();
    }
  };

  await Promise.all(
    batchArr.map(async () => {
      await batchFn();
    })
  );

  return result;
};

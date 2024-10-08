export const retryRun = <T>(fn: () => T, retry = 2): T => {
  try {
    return fn();
  } catch (error) {
    if (retry > 0) {
      return retryRun(fn, retry - 1);
    }
    throw error;
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

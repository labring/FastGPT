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

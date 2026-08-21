/** 在指定 deadline 内等待 operation；超时只终止等待，不取消底层 Redis 操作。 */
export const runWithTimeout = <T>({
  operation,
  timeoutMs,
  timeoutMessage
}: {
  operation: Promise<T>;
  timeoutMs: number;
  timeoutMessage: string;
}): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);

    operation.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
};

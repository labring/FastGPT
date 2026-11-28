/**
 * 让 HTTP 节点在元数据、读取或出站预检尚未完成时响应取消。
 * 底层操作仍须接收同一个 signal，并在不可取消的等待结束后再次检查，避免迟到结果继续发起请求。
 */
export const runWithHttpAbort = async <T>(
  operation: () => Promise<T>,
  signal: AbortSignal
): Promise<T> => {
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        return operation();
      }),
      new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();
      })
    ]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};

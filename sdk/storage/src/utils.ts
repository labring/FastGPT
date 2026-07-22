import type { Readable } from 'node:stream';

/** 将对象 key 编码为 URL path，同时保留对象存储使用的 `/` 层级分隔符。 */
export const encodeObjectKeyPath = (key: string): string =>
  key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

/** 将任意 AbortSignal.reason 归一为可用于 Readable.destroy 的 Error。 */
export const getAbortSignalError = (abortSignal: AbortSignal): Error => {
  if (abortSignal.reason instanceof Error) return abortSignal.reason;

  const error = new Error(
    abortSignal.reason === undefined ? 'The operation was aborted' : String(abortSignal.reason)
  );
  error.name = 'AbortError';
  return error;
};

/** 在发起远端下载前检查取消，确保预取消请求不会进入厂商 SDK。 */
export const throwIfStorageDownloadAborted = (abortSignal?: AbortSignal): void => {
  if (abortSignal?.aborted) throw getAbortSignalError(abortSignal);
};

/**
 * 将下载取消绑定到返回流，并在流关闭后解除监听。
 * 二次检查覆盖等待厂商返回流期间发生的取消竞态。
 */
export const bindAbortSignalToReadable = ({
  readable,
  abortSignal
}: {
  readable: Readable;
  abortSignal?: AbortSignal;
}): void => {
  if (!abortSignal) return;
  if (abortSignal.aborted) {
    readable.destroy();
    throw getAbortSignalError(abortSignal);
  }

  const abortDownload = () => readable.destroy(getAbortSignalError(abortSignal));
  abortSignal.addEventListener('abort', abortDownload, { once: true });
  readable.once('close', () => {
    abortSignal.removeEventListener('abort', abortDownload);
  });
};

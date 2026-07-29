import axios from 'axios';

const URL_PARSER_BASE = 'http://fastgpt-keep-pathname.dev';
const URL_PROTOCOL_PATTERN = /^[a-z][a-z\d+.-]*:/i;

/** 创建统一的上传取消错误，兼容没有 DOMException 的运行环境。 */
export const createMultipartAbortError = () => {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The multipart upload was aborted', 'AbortError');
  }

  const error = new Error('The multipart upload was aborted');
  error.name = 'AbortError';
  return error;
};

/** 判断请求错误是否属于用户取消或上传器内部取消。 */
export const isUploadAbortError = (error: unknown, signal?: AbortSignal) => {
  if (signal?.aborted || axios.isCancel(error)) return true;

  if (!error || typeof error !== 'object') return false;
  const typedError = error as { name?: string; code?: string };
  return (
    typedError.name === 'AbortError' ||
    typedError.name === 'CanceledError' ||
    typedError.code === 'ERR_CANCELED'
  );
};

/** 在开始新的上传请求前检查外部或内部取消信号。 */
export const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw signal.reason ?? createMultipartAbortError();
  }
};

/** 校验文件和分片大小，并返回 Multipart 分片数量。 */
export const getMultipartPartCount = (fileSize: number, partSize: number) => {
  if (!Number.isInteger(fileSize) || fileSize <= 0) {
    throw new Error('Multipart file size must be a positive integer');
  }
  if (!Number.isInteger(partSize) || partSize <= 0) {
    throw new Error('Multipart part size must be a positive integer');
  }

  return Math.ceil(fileSize / partSize);
};

/** 根据 part number 计算 File.slice 的边界，只有最后一个分片可以小于 partSize。 */
export const getMultipartPartRange = ({
  fileSize,
  partSize,
  partNumber
}: {
  fileSize: number;
  partSize: number;
  partNumber: number;
}) => {
  const partCount = getMultipartPartCount(fileSize, partSize);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount) {
    throw new Error('Multipart part number is out of range');
  }

  const start = (partNumber - 1) * partSize;
  const end = Math.min(start + partSize, fileSize);
  return { start, end, size: end - start };
};

/** 使用 URL API 添加查询参数，并保留调用方原本的相对/绝对 URL 形式。 */
export const appendUrlSearchParam = ({
  url,
  key,
  value
}: {
  url: string;
  key: string;
  value: string;
}) => {
  const parsedUrl = new URL(url, URL_PARSER_BASE);
  parsedUrl.searchParams.set(key, value);

  if (URL_PROTOCOL_PATTERN.test(url) || url.startsWith('//')) {
    return parsedUrl.toString();
  }

  return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
};

/** 等待当前分片的指数退避时间，并允许取消立即结束等待。 */
export const waitForMultipartRetry = (delay: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? createMultipartAbortError());
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delay);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason ?? createMultipartAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });

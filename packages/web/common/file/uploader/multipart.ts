import axios from 'axios';
import { parseS3UploadError } from '@fastgpt/global/common/error/s3';
import { MULTIPART_REQUEST_TIMEOUT, MULTIPART_RETRY_BASE_DELAY } from './constants';
import type { MultipartUploadPart, S3FileUploaderMultipartParams } from './types';
import {
  createMultipartAbortError,
  appendUrlSearchParam,
  getMultipartPartCount,
  getMultipartPartRange,
  isUploadAbortError,
  throwIfAborted,
  waitForMultipartRetry
} from './utils';

const uploadMultipartPartWithRetry = async ({
  url,
  file,
  partNumber,
  partSize,
  headers,
  maxRetry,
  signal,
  onProgress
}: {
  url: string;
  file: File;
  partNumber: number;
  partSize: number;
  headers?: Record<string, string>;
  maxRetry: number;
  signal: AbortSignal;
  onProgress: (loaded: number) => void;
}): Promise<MultipartUploadPart> => {
  const { start, end, size } = getMultipartPartRange({
    fileSize: file.size,
    partSize,
    partNumber
  });
  const partUrl = appendUrlSearchParam({
    url,
    key: 'partNumber',
    value: String(partNumber)
  });

  for (let attempt = 0; ; attempt++) {
    throwIfAborted(signal);

    try {
      const response = await axios.put(partUrl, file.slice(start, end), {
        headers: {
          ...headers
        },
        onUploadProgress: (event) => {
          onProgress(Math.min(event.loaded, size));
        },
        signal,
        timeout: MULTIPART_REQUEST_TIMEOUT
      });
      const etag = response.data?.data?.etag ?? response.data?.etag;

      if (typeof etag !== 'string' || !etag) {
        throw new Error('Multipart part response missing etag');
      }

      onProgress(size);
      return { partNumber, etag };
    } catch (error) {
      if (isUploadAbortError(error, signal) || attempt >= maxRetry) {
        throw error;
      }

      onProgress(0);
      await waitForMultipartRetry(MULTIPART_RETRY_BASE_DELAY * 2 ** attempt, signal);
    }
  }
};

const postMultipartAbort = (abortUrl: string) =>
  axios.post(abortUrl, undefined, {
    timeout: MULTIPART_REQUEST_TIMEOUT
  });

/** 执行 Multipart 分片调度、完成和失败后的远端清理。 */
export const uploadMultipartFile = async (params: S3FileUploaderMultipartParams): Promise<void> => {
  const partCount = getMultipartPartCount(params.file.size, params.partSize);
  if (!Number.isInteger(params.concurrency) || params.concurrency <= 0) {
    throw new Error('Multipart concurrency must be a positive integer');
  }
  if (!Number.isInteger(params.maxRetry) || params.maxRetry < 0) {
    throw new Error('Multipart max retry must be a non-negative integer');
  }

  const requestController = new AbortController();
  const requestSignal = requestController.signal;
  const onExternalAbort = () => {
    requestController.abort(params.signal?.reason ?? createMultipartAbortError());
  };
  params.signal?.addEventListener('abort', onExternalAbort, { once: true });

  const loadedByPart = new Array<number>(partCount).fill(0);
  const parts = new Array<MultipartUploadPart | undefined>(partCount);
  const reportProgress = () => {
    params.onProgress?.(
      Math.min(
        params.file.size,
        loadedByPart.reduce((total, loaded) => total + loaded, 0)
      ),
      params.file.size
    );
  };

  let nextPartNumber = 1;
  let firstUploadError: unknown;

  const worker = async () => {
    while (true) {
      const partNumber = nextPartNumber++;
      if (partNumber > partCount) return;

      try {
        const part = await uploadMultipartPartWithRetry({
          url: params.url,
          file: params.file,
          partNumber,
          partSize: params.partSize,
          headers: params.headers,
          maxRetry: params.maxRetry,
          signal: requestSignal,
          onProgress: (loaded) => {
            loadedByPart[partNumber - 1] = loaded;
            reportProgress();
          }
        });
        parts[partNumber - 1] = part;
      } catch (error) {
        firstUploadError ??= error;
        if (!requestSignal.aborted) requestController.abort(error);
        throw error;
      }
    }
  };

  try {
    throwIfAborted(params.signal);
    reportProgress();

    await Promise.all(
      Array.from({ length: Math.min(params.concurrency, partCount) }, () => worker())
    );
    throwIfAborted(params.signal);

    const completedParts = parts
      .filter((part): part is MultipartUploadPart => !!part)
      .sort((left, right) => left.partNumber - right.partNumber);
    if (completedParts.length !== partCount) {
      throw new Error('Multipart parts are incomplete');
    }

    await axios.post(
      params.completeUrl,
      { parts: completedParts },
      {
        signal: requestSignal,
        timeout: MULTIPART_REQUEST_TIMEOUT
      }
    );
  } catch (error) {
    const uploadError = firstUploadError ?? error;

    await postMultipartAbort(params.abortUrl).catch(() => undefined);
    if (isUploadAbortError(uploadError, params.signal)) {
      throw uploadError;
    }

    throw parseS3UploadError({ t: params.t, error: uploadError, maxSize: params.maxSize });
  } finally {
    params.signal?.removeEventListener('abort', onExternalAbort);
  }

  params.onProgress?.(params.file.size, params.file.size);
  params.onSuccess?.();
};

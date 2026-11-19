import type { BaseClient } from '../core/baseClient';
import {
  createMappedApiError,
  FastGptBadRequestError,
  FastGptError,
  FastGptNetworkError,
  FastGptTimeoutError
} from '../core/errors';

export type PresignedUploadSession =
  | {
      uploadMode: 'single';
      url: string;
      key: string;
      headers: Record<string, string>;
      previewUrl: string;
      maxSize?: number;
    }
  | {
      uploadMode: 'multipart';
      url: string;
      key: string;
      headers: Record<string, string>;
      previewUrl: string;
      maxSize?: number;
      completeUrl: string;
      abortUrl: string;
      partSize: number;
      concurrency: number;
      maxRetry: number;
    };

export type UploadProgressInfo = {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
  completedParts?: number;
  totalParts?: number;
};

type CompletedMultipartPart = {
  partNumber: number;
  etag: string;
};

const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5_000;
const DEFAULT_PART_TIMEOUT_MS = 120_000;

const isRecord = (val: unknown): val is Record<string, unknown> =>
  val !== null && typeof val === 'object' && !Array.isArray(val);

const toPercent = (loaded: number, total: number): number => {
  if (total <= 0) return 100;
  return Math.min(100, Math.round((loaded / total) * 100));
};

const throwIfAborted = (signal: AbortSignal | undefined, url: string): void => {
  if (signal?.aborted) {
    throw new FastGptError({
      message: 'File upload was aborted',
      url,
      cause: signal.reason
    });
  }
};

const sleepWithAbort = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

const isAbortFailure = (error: unknown, signal?: AbortSignal): boolean => {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return false;
};

const parseHttpFailureError = async (response: Response, url: string): Promise<FastGptError> => {
  const requestId =
    response.headers.get('x-request-id') ?? response.headers.get('x-fastgpt-request-id');
  const rawText = await response.text().catch(() => '');

  if (rawText.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawText) as unknown;
      if (isRecord(parsed)) {
        const serverCode = typeof parsed.code === 'number' ? parsed.code : undefined;
        const statusText = typeof parsed.statusText === 'string' ? parsed.statusText : undefined;
        const message =
          typeof parsed.message === 'string' && parsed.message.length > 0
            ? parsed.message
            : (statusText ?? `Upload request failed with HTTP ${response.status}`);
        return createMappedApiError({
          message,
          httpStatus: response.status,
          serverCode,
          statusText,
          requestId,
          url
        });
      }
    } catch {
      // 非 JSON 错误体按纯文本兜底
    }
  }

  return createMappedApiError({
    message: rawText.slice(0, 300) || `Upload request failed with HTTP ${response.status}`,
    httpStatus: response.status,
    requestId,
    url
  });
};

const fetchWithTimeout = async ({
  fetchFn,
  url,
  init,
  timeoutMs,
  signal
}: {
  fetchFn: typeof globalThis.fetch;
  url: string;
  init: RequestInit;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<Response> => {
  throwIfAborted(signal, url);

  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => {
    controller.abort(signal?.reason);
  };
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  try {
    return await fetchFn(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (timedOut) {
      throw new FastGptTimeoutError({
        message: `File upload request timed out after ${timeoutMs}ms`,
        url,
        cause: error
      });
    }
    if (isAbortFailure(error, signal)) {
      throw new FastGptError({
        message: 'File upload was aborted',
        url,
        cause: error
      });
    }
    throw new FastGptNetworkError({
      message:
        error instanceof Error
          ? `Upload network failure: ${error.message}`
          : 'Upload network failure',
      url,
      cause: error
    });
  } finally {
    if (timer !== null) clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
};

const extractPartEtag = async (response: Response, url: string): Promise<string> => {
  const rawText = await response.text().catch(() => '');
  if (rawText.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawText) as unknown;
      if (isRecord(parsed)) {
        if (typeof parsed.code === 'number' && parsed.code >= 400) {
          throw createMappedApiError({
            message:
              typeof parsed.message === 'string' && parsed.message.length > 0
                ? parsed.message
                : `Multipart part upload failed (code ${parsed.code})`,
            httpStatus: response.status,
            serverCode: parsed.code,
            statusText: typeof parsed.statusText === 'string' ? parsed.statusText : undefined,
            url
          });
        }
        if (
          isRecord(parsed.data) &&
          typeof parsed.data.etag === 'string' &&
          parsed.data.etag.length > 0
        ) {
          return parsed.data.etag;
        }
        if (typeof parsed.etag === 'string' && parsed.etag.length > 0) {
          return parsed.etag;
        }
      }
    } catch (error) {
      if (error instanceof FastGptError) throw error;
    }
  }

  const headerEtag = response.headers.get('etag');
  if (headerEtag !== null && headerEtag.trim().length > 0) {
    return headerEtag.trim();
  }

  throw new FastGptError({
    message: 'Multipart part upload response missing ETag',
    httpStatus: response.status,
    url
  });
};

/**
 * 基于标准 Web Fetch 执行 FastGPT 预签名上传会话（同时兼容单 PUT 与 Multipart 分片上传）。
 *
 * - 单 PUT 模式直接向预签名地址发送原始二进制并上报进度；
 * - Multipart 模式按服务端返回的 partSize / concurrency / maxRetry 并发切片上传、汇总 ETag 后调用 completeUrl；
 * - 任一分片或取消信号失败时，自动 best-effort 调用 abortUrl 清理远端未完成分片会话。
 */
export const uploadPresignedFile = async ({
  client,
  session,
  blob,
  onProgress,
  signal,
  timeoutMs,
  retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS
}: {
  client: BaseClient;
  session: PresignedUploadSession;
  blob: Blob;
  onProgress?: (progress: UploadProgressInfo) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  retryBaseDelayMs?: number;
}): Promise<void> => {
  if (session.maxSize !== undefined && blob.size > session.maxSize) {
    throw new FastGptBadRequestError({
      message: `File size (${blob.size} bytes) exceeds maximum allowed limit (${session.maxSize} bytes)`
    });
  }

  const fetchFn = client._getFetch();
  const effectiveTimeoutMs =
    timeoutMs ?? Math.max(client._getDefaultTimeoutMs(), DEFAULT_PART_TIMEOUT_MS);

  // 1. 单请求 PUT 上传
  if (session.uploadMode === 'single') {
    const uploadUrl = client._resolveEndpointUrl(session.url);
    throwIfAborted(signal, uploadUrl);
    onProgress?.({
      loadedBytes: 0,
      totalBytes: blob.size,
      percent: toPercent(0, blob.size)
    });

    const response = await fetchWithTimeout({
      fetchFn,
      url: uploadUrl,
      init: {
        method: 'PUT',
        headers: { ...session.headers },
        body: blob
      },
      timeoutMs: effectiveTimeoutMs,
      signal
    });

    if (!response.ok) {
      throw await parseHttpFailureError(response, uploadUrl);
    }

    onProgress?.({
      loadedBytes: blob.size,
      totalBytes: blob.size,
      percent: 100
    });
    return;
  }

  // 2. Multipart 并发分片上传、合并与失败自动清理
  if (!Number.isInteger(session.partSize) || session.partSize <= 0) {
    throw new FastGptBadRequestError({
      message: 'Presigned multipart session has an invalid partSize'
    });
  }
  if (!Number.isInteger(session.concurrency) || session.concurrency <= 0) {
    throw new FastGptBadRequestError({
      message: 'Presigned multipart session has an invalid concurrency'
    });
  }
  if (!Number.isInteger(session.maxRetry) || session.maxRetry < 0) {
    throw new FastGptBadRequestError({
      message: 'Presigned multipart session has an invalid maxRetry'
    });
  }

  const uploadBaseUrl = client._resolveEndpointUrl(session.url);
  const completeUrl = client._resolveEndpointUrl(session.completeUrl);
  const abortUrl = client._resolveEndpointUrl(session.abortUrl);
  const partCount = Math.max(1, Math.ceil(blob.size / session.partSize));

  const internalController = new AbortController();
  const onExternalAbort = () => {
    internalController.abort(signal?.reason);
  };
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  const loadedByPart = new Array<number>(partCount).fill(0);
  const completedParts = new Array<CompletedMultipartPart | undefined>(partCount);
  let completedPartCount = 0;

  const emitProgress = () => {
    const loadedBytes = Math.min(
      blob.size,
      loadedByPart.reduce((sum, bytes) => sum + bytes, 0)
    );
    onProgress?.({
      loadedBytes,
      totalBytes: blob.size,
      percent: toPercent(loadedBytes, blob.size),
      completedParts: completedPartCount,
      totalParts: partCount
    });
  };

  const uploadSinglePart = async (partNumber: number): Promise<CompletedMultipartPart> => {
    const start = (partNumber - 1) * session.partSize;
    const end = Math.min(blob.size, start + session.partSize);
    const chunk = blob.slice(start, end);
    const partUrlObj = new URL(uploadBaseUrl);
    partUrlObj.searchParams.set('partNumber', String(partNumber));
    const partUrl = partUrlObj.toString();

    for (let attempt = 0; ; attempt += 1) {
      throwIfAborted(internalController.signal, partUrl);
      try {
        const response = await fetchWithTimeout({
          fetchFn,
          url: partUrl,
          init: {
            method: 'PUT',
            headers: { ...session.headers },
            body: chunk
          },
          timeoutMs: effectiveTimeoutMs,
          signal: internalController.signal
        });

        if (!response.ok) {
          throw await parseHttpFailureError(response, partUrl);
        }

        const etag = await extractPartEtag(response, partUrl);
        loadedByPart[partNumber - 1] = chunk.size;
        completedPartCount += 1;
        emitProgress();
        return { partNumber, etag };
      } catch (error) {
        if (isAbortFailure(error, internalController.signal) || attempt >= session.maxRetry) {
          throw error;
        }
        const delayMs = Math.min(retryBaseDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS);
        await sleepWithAbort(delayMs, internalController.signal);
      }
    }
  };

  const completeMultipart = async (parts: CompletedMultipartPart[]): Promise<void> => {
    for (let attempt = 0; ; attempt += 1) {
      throwIfAborted(internalController.signal, completeUrl);
      try {
        const response = await fetchWithTimeout({
          fetchFn,
          url: completeUrl,
          init: {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ parts })
          },
          timeoutMs: effectiveTimeoutMs,
          signal: internalController.signal
        });

        if (!response.ok) {
          throw await parseHttpFailureError(response, completeUrl);
        }
        return;
      } catch (error) {
        const isRetryableCompleteError =
          (error instanceof FastGptError && error.httpStatus === 409) ||
          error instanceof FastGptNetworkError ||
          error instanceof FastGptTimeoutError;
        if (
          isAbortFailure(error, internalController.signal) ||
          !isRetryableCompleteError ||
          attempt >= session.maxRetry
        ) {
          throw error;
        }
        const delayMs = Math.min(retryBaseDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS);
        await sleepWithAbort(delayMs, internalController.signal);
      }
    }
  };

  let nextPartNumber = 1;
  let firstError: unknown;

  const runWorker = async (): Promise<void> => {
    while (true) {
      const partNumber = nextPartNumber;
      nextPartNumber += 1;
      if (partNumber > partCount) return;

      try {
        const part = await uploadSinglePart(partNumber);
        completedParts[partNumber - 1] = part;
      } catch (error) {
        firstError ??= error;
        if (!internalController.signal.aborted) {
          internalController.abort(error);
        }
        throw error;
      }
    }
  };

  try {
    throwIfAborted(signal, uploadBaseUrl);
    emitProgress();

    const workerCount = Math.min(session.concurrency, partCount);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    throwIfAborted(signal, completeUrl);

    const orderedParts = completedParts
      .filter((part): part is CompletedMultipartPart => part !== undefined)
      .sort((a, b) => a.partNumber - b.partNumber);
    if (orderedParts.length !== partCount) {
      throw new FastGptError({
        message: `Multipart upload incomplete: expected ${partCount} parts, received ${orderedParts.length}`,
        url: completeUrl
      });
    }

    await completeMultipart(orderedParts);
  } catch (error) {
    const rootError = firstError ?? error;
    // 上传失败或被中止时尽力通知服务端释放 S3 Multipart 会话，避免残留孤儿分片。
    await fetchWithTimeout({
      fetchFn,
      url: abortUrl,
      init: { method: 'POST' },
      timeoutMs: Math.min(effectiveTimeoutMs, 15_000)
    }).catch(() => {});

    throw rootError;
  } finally {
    signal?.removeEventListener('abort', onExternalAbort);
  }

  onProgress?.({
    loadedBytes: blob.size,
    totalBytes: blob.size,
    percent: 100,
    completedParts: partCount,
    totalParts: partCount
  });
};

import { describe, expect, it, vi } from 'vitest';
import OpenAI from '@fastgpt/global/core/ai';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { getErrText, UserError } from '@fastgpt/global/common/error/utils';
import { isNonRetryableModelError } from '@fastgpt/global/common/error/model';
import { PRIVATE_URL_TEXT } from '@fastgpt/service/common/system/utils';
import {
  classifyEmbeddingError,
  createEmptyInputEmbeddingError,
  createInvalidResponseEmbeddingError,
  EmbeddingRequestError,
  getEmbeddingRetryDirective,
  isEmbeddingRequestError,
  normalizeEmbeddingError
} from '@fastgpt/service/core/ai/embedding/error';

vi.unmock('@fastgpt/service/common/response');
const { processError } = await import('@fastgpt/service/common/response');

const makeApiError = ({
  status,
  message,
  code,
  type
}: {
  status?: number;
  message: string;
  code?: string;
  type?: string;
}) =>
  Object.assign(new Error(status !== undefined ? `${status} ${message}` : message), {
    status,
    code,
    type,
    error: {
      message,
      ...(code !== undefined ? { code } : {}),
      ...(type !== undefined ? { type } : {})
    }
  });

describe('classifyEmbeddingError & normalizeEmbeddingError', () => {
  describe('real production error signatures', () => {
    it('hides internal aiproxy postgres details behind serviceUnavailable (retryable)', () => {
      const raw = makeApiError({
        status: 500,
        type: 'aiproxy_error',
        message:
          'failed to get group: failed to connect to `user=postgres database=aiproxy`: dial tcp 10.96.188.19:5432 (aiproxy-new-postgresql.ns-bjwgfnik.svc): connect: operation not permitted'
      });

      const classified = classifyEmbeddingError(raw);
      expect(classified).toMatchObject({
        category: 'upstreamUnavailable',
        retryable: true,
        errorCode: ModelErrEnum.serviceUnavailable,
        upstreamStatus: 500,
        upstreamType: 'aiproxy_error'
      });

      const normalized = normalizeEmbeddingError(raw);
      expect(isEmbeddingRequestError(normalized)).toBe(true);
      expect(isNonRetryableModelError(normalized)).toBe(false);
      expect(getErrText(normalized)).toBe('common:code_error.model_error.service_unavailable');
      expect(getErrText(normalized)).not.toContain('postgres');
      expect(getErrText(normalized)).not.toContain('10.96.188.19');
      expect(processError({ error: normalized })).toMatchObject({
        statusText: ModelErrEnum.serviceUnavailable,
        httpStatus: 503,
        message: 'common:code_error.model_error.service_unavailable'
      });
    });

    it('does not misclassify 500 database auth failure text as client authFailed', () => {
      const raw = makeApiError({
        status: 500,
        type: 'aiproxy_error',
        message: 'FATAL: password authentication failed for user "postgres"'
      });

      expect(classifyEmbeddingError(raw)).toMatchObject({
        category: 'upstreamUnavailable',
        retryable: true,
        errorCode: ModelErrEnum.serviceUnavailable
      });
    });

    it('classifies 429 bad response status code as retryable rateLimited', () => {
      const raw = makeApiError({
        status: 429,
        code: 'bad_response',
        type: 'upstream_error',
        message: 'bad response status code 429'
      });

      const normalized = normalizeEmbeddingError(raw);
      expect(classifyEmbeddingError(raw)).toMatchObject({
        category: 'rateLimited',
        retryable: true,
        errorCode: ModelErrEnum.rateLimited
      });
      expect(getErrText(normalized)).toBe('common:code_error.model_error.rate_limited');
      expect(processError({ error: normalized }).httpStatus).toBe(429);
    });

    it('classifies HTTP 400 wrapped service_unavailable as retryable upstreamUnavailable rather than invalidRequest', () => {
      const raw = makeApiError({
        status: 400,
        code: 'service_unavailable',
        type: 'upstream_error',
        message: 'upstream temporary failure'
      });

      const classified = classifyEmbeddingError(raw);
      expect(classified).toMatchObject({
        category: 'upstreamUnavailable',
        retryable: true,
        errorCode: ModelErrEnum.serviceUnavailable
      });

      const normalized = normalizeEmbeddingError(raw);
      expect(isNonRetryableModelError(normalized)).toBe(false);
      expect(getErrText(normalized)).toBe('common:code_error.model_error.service_unavailable');
    });

    it('keeps generic HTTP 400 BadRequest with upstream_error type as non-retryable invalidRequest', () => {
      const raw = makeApiError({
        status: 400,
        code: 'BadRequest',
        type: 'upstream_error',
        message: 'dimensions must be <= 1024'
      });

      expect(classifyEmbeddingError(raw)).toMatchObject({
        category: 'invalidRequest',
        retryable: false,
        errorCode: ModelErrEnum.invalidRequest
      });
    });

    it('keeps HTTP 400 invalid_request_error non-retryable even when parameter value contains "overloaded"', () => {
      const raw = makeApiError({
        status: 400,
        type: 'invalid_request_error',
        message: "Unsupported value: 'overloaded' for 'encoding_format'."
      });

      const classified = classifyEmbeddingError(raw);
      expect(classified).toMatchObject({
        category: 'invalidRequest',
        retryable: false,
        errorCode: ModelErrEnum.invalidRequest
      });

      const normalized = normalizeEmbeddingError(raw);
      expect(isNonRetryableModelError(normalized)).toBe(true);
      expect(getErrText(normalized)).toBe('common:code_error.model_error.invalid_request');
    });

    it('parses x-should-retry, retry-after-ms, Retry-After seconds/date and enforces wait budget', () => {
      expect(
        getEmbeddingRetryDirective({ headers: new Headers({ 'x-should-retry': 'false' }) })
      ).toEqual({ shouldRetryInRequest: false });

      expect(
        getEmbeddingRetryDirective({ headers: new Headers({ 'retry-after-ms': '1500' }) })
      ).toEqual({ shouldRetryInRequest: true, retryAfterMs: 1500 });

      expect(getEmbeddingRetryDirective({ headers: new Headers({ 'retry-after': '2' }) })).toEqual({
        shouldRetryInRequest: true,
        retryAfterMs: 2000
      });

      const futureDate = new Date(Date.now() + 2500).toUTCString();
      const dateDirective = getEmbeddingRetryDirective({
        headers: { 'Retry-After': futureDate }
      });
      expect(dateDirective.shouldRetryInRequest).toBe(true);
      expect(dateDirective.retryAfterMs).toBeGreaterThanOrEqual(0);
      expect(dateDirective.retryAfterMs).toBeLessThanOrEqual(4000);

      expect(getEmbeddingRetryDirective({ headers: new Headers({ 'retry-after': '60' }) })).toEqual(
        { shouldRetryInRequest: false, retryAfterMs: 60_000 }
      );
    });

    it('classifies HTTP 400 transient image download 500 failure as retryable and hides signed file URL', () => {
      const raw = makeApiError({
        status: 400,
        code: 'BadRequest',
        type: 'upstream_error',
        message:
          "Failed to download images: 500, message='Internal Server Error', url='https://cloud.fastgpt.cn/api/system/file/d/404/secret-token'"
      });

      const classified = classifyEmbeddingError(raw);
      expect(classified).toMatchObject({
        category: 'imageDownloadFailed',
        retryable: true,
        errorCode: ModelErrEnum.imageDownloadFailed
      });

      const normalized = normalizeEmbeddingError(raw);
      expect(getErrText(normalized)).toBe('common:code_error.model_error.image_download_failed');
      expect(getErrText(normalized)).not.toContain('secret-token');
    });

    it.each([
      "Failed to download images: 404, message='Not Found', url='https://example.com/500/a.png'",
      "Failed to download images: 401, message='Unauthorized', url='https://example.com/a.png'",
      "Failed to download images: 403, message='Forbidden', url='https://example.com/a.png'"
    ])(
      'classifies permanent image download error (%s) as non-retryable imageDownloadFailed',
      (message) => {
        const raw = makeApiError({ status: 400, code: 'BadRequest', message });

        const classified = classifyEmbeddingError(raw);
        expect(classified).toMatchObject({
          category: 'imageDownloadFailed',
          retryable: false,
          errorCode: ModelErrEnum.imageDownloadFailed
        });

        const normalized = normalizeEmbeddingError(raw);
        expect(isNonRetryableModelError(normalized)).toBe(true);
        expect(getErrText(normalized)).toBe('common:code_error.model_error.image_download_failed');
      }
    );

    it('recognizes aborted requests without wrapping them', () => {
      const sdkAbort = new OpenAI.APIUserAbortError();
      const plainAbort = new Error('Request was aborted.');
      const controller = new AbortController();
      controller.abort();

      for (const err of [sdkAbort, plainAbort]) {
        expect(classifyEmbeddingError(err)).toMatchObject({
          category: 'aborted',
          retryable: false
        });
        expect(normalizeEmbeddingError(err)).toBe(err);
      }

      const canceled = new Error('any');
      expect(classifyEmbeddingError(canceled, { signal: controller.signal })).toMatchObject({
        category: 'aborted',
        retryable: false
      });
      expect(normalizeEmbeddingError(canceled, { signal: controller.signal })).toBe(canceled);
    });
  });

  describe('deterministic non-retryable errors', () => {
    it.each([
      {
        name: 'no available channel (404 relay)',
        error: makeApiError({
          status: 404,
          message: 'no available channel for model text-embedding-3'
        }),
        category: 'noAvailableChannel',
        errorCode: ModelErrEnum.noAvailableChannel,
        httpStatus: 404
      },
      {
        name: 'auth failed (401)',
        error: makeApiError({
          status: 401,
          code: 'invalid_api_key',
          message: 'Incorrect API key provided: sk-123'
        }),
        category: 'authFailed',
        errorCode: ModelErrEnum.authFailed,
        httpStatus: 502
      },
      {
        name: 'quota exceeded on HTTP 429',
        error: makeApiError({
          status: 429,
          code: 'insufficient_quota',
          message: 'You exceeded your current quota, please check your plan and billing details.'
        }),
        category: 'quotaExceeded',
        errorCode: ModelErrEnum.upstreamQuotaExceeded,
        httpStatus: 502
      },
      {
        name: 'quota exceeded on HTTP 402',
        error: makeApiError({ status: 402, message: 'Insufficient Balance' }),
        category: 'quotaExceeded',
        errorCode: ModelErrEnum.upstreamQuotaExceeded,
        httpStatus: 502
      },
      {
        name: 'permission denied (403)',
        error: makeApiError({ status: 403, message: 'Access denied for this model' }),
        category: 'permissionDenied',
        errorCode: ModelErrEnum.permissionDenied,
        httpStatus: 502
      },
      {
        name: 'model not found (404)',
        error: makeApiError({
          status: 404,
          code: 'model_not_found',
          message: 'The model foo does not exist'
        }),
        category: 'modelNotFound',
        errorCode: ModelErrEnum.modelNotFound,
        httpStatus: 502
      },
      {
        name: 'content moderation (400 data_inspection_failed)',
        error: makeApiError({
          status: 400,
          code: 'data_inspection_failed',
          message: 'Input data may contain inappropriate content.'
        }),
        category: 'contentModeration',
        errorCode: ModelErrEnum.contentBlocked,
        httpStatus: 400
      },
      {
        name: 'input too long (400 context length)',
        error: makeApiError({
          status: 400,
          code: 'context_length_exceeded',
          message: "This model's maximum context length is 8192 tokens"
        }),
        category: 'inputTooLong',
        errorCode: ModelErrEnum.inputTooLong,
        httpStatus: 400
      },
      {
        name: 'input too long (413)',
        error: makeApiError({ status: 413, message: 'Request Entity Too Large' }),
        category: 'inputTooLong',
        errorCode: ModelErrEnum.inputTooLong,
        httpStatus: 400
      },
      {
        name: 'invalid / unsupported image format',
        error: makeApiError({ status: 400, message: 'Unsupported image format: image/bmp' }),
        category: 'invalidImage',
        errorCode: ModelErrEnum.invalidImage,
        httpStatus: 400
      },
      {
        name: 'generic 400 invalid request',
        error: makeApiError({
          status: 400,
          type: 'invalid_request_error',
          message: 'dimensions must be <= 1024'
        }),
        category: 'invalidRequest',
        errorCode: ModelErrEnum.invalidRequest,
        httpStatus: 400
      },
      {
        name: 'private endpoint blocked inside APIConnectionError cause',
        error: new OpenAI.APIConnectionError({ cause: new Error(PRIVATE_URL_TEXT) }),
        category: 'privateUrl',
        errorCode: ModelErrEnum.privateEndpointBlocked,
        httpStatus: 400
      }
    ])(
      'classifies $name as non-retryable and maps to explicit i18n prompt',
      ({ error, category, errorCode, httpStatus }) => {
        const classified = classifyEmbeddingError(error);
        expect(classified).toMatchObject({
          category,
          retryable: false,
          errorCode
        });

        const normalized = normalizeEmbeddingError(error);
        expect(normalized).toBeInstanceOf(EmbeddingRequestError);
        expect((normalized as EmbeddingRequestError).cause).toBe(error);
        expect(isNonRetryableModelError(normalized)).toBe(true);
        expect(getErrText(normalized)).toBe(ERROR_RESPONSE[errorCode].message);
        expect(processError({ error: normalized })).toMatchObject({
          statusText: errorCode,
          httpStatus,
          message: ERROR_RESPONSE[errorCode].message
        });
      }
    );

    it('preserves model config UserError identity while marking non-retryable', () => {
      const configErr = new UserError(ModelErrEnum.unExist);
      expect(classifyEmbeddingError(configErr)).toMatchObject({
        category: 'modelConfig',
        retryable: false,
        errorCode: ModelErrEnum.unExist
      });
      expect(normalizeEmbeddingError(configErr)).toBe(configErr);
    });

    it('creates non-retryable empty input error with localized key', () => {
      const err = createEmptyInputEmbeddingError();
      expect(classifyEmbeddingError(err)).toMatchObject({
        category: 'emptyInput',
        retryable: false,
        errorCode: ModelErrEnum.embeddingEmptyInput
      });
      expect(getErrText(err)).toBe('common:code_error.model_error.embedding_empty_input');
    });
  });

  describe('transient retryable errors & fallback', () => {
    it.each([
      {
        name: 'SDK timeout error',
        error: new OpenAI.APIConnectionTimeoutError(),
        category: 'timeout',
        errorCode: ModelErrEnum.requestTimeout
      },
      {
        name: 'HTTP 504 gateway timeout',
        error: makeApiError({ status: 504, message: 'Gateway Timeout' }),
        category: 'timeout',
        errorCode: ModelErrEnum.requestTimeout
      },
      {
        name: 'HTTP 400 wrapped gateway_timeout code',
        error: makeApiError({
          status: 400,
          code: 'gateway_timeout',
          type: 'upstream_error',
          message: 'upstream gateway timed out'
        }),
        category: 'timeout',
        errorCode: ModelErrEnum.requestTimeout
      },
      {
        name: 'nested cause UND_ERR_CONNECT_TIMEOUT',
        error: new OpenAI.APIConnectionError({
          cause: Object.assign(new TypeError('fetch failed'), {
            cause: Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' })
          })
        }),
        category: 'timeout',
        errorCode: ModelErrEnum.requestTimeout
      },
      {
        name: 'HTTP 502 HTML gateway error',
        error: makeApiError({ status: 502, message: '<html><body>502 Bad Gateway</body></html>' }),
        category: 'upstreamUnavailable',
        errorCode: ModelErrEnum.serviceUnavailable
      },
      {
        name: 'HTTP 409 conflict',
        error: makeApiError({ status: 409, message: 'Conflict' }),
        category: 'upstreamUnavailable',
        errorCode: ModelErrEnum.serviceUnavailable
      },
      {
        name: 'nested cause ECONNRESET',
        error: new OpenAI.APIConnectionError({
          cause: Object.assign(new TypeError('fetch failed'), {
            cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
          })
        }),
        category: 'networkError',
        errorCode: ModelErrEnum.networkError
      },
      {
        name: 'invalid response (empty embedding)',
        error: createInvalidResponseEmbeddingError(new Error('empty data')),
        category: 'invalidResponse',
        errorCode: ModelErrEnum.invalidResponse
      }
    ])('classifies $name as retryable with clean message', ({ error, category, errorCode }) => {
      const classified = classifyEmbeddingError(error);
      expect(classified).toMatchObject({
        category,
        retryable: true,
        errorCode
      });

      const normalized = normalizeEmbeddingError(error);
      expect(isNonRetryableModelError(normalized)).toBe(false);
      expect(getErrText(normalized)).toBe(ERROR_RESPONSE[errorCode].message);
    });

    it('falls back to original error for truly unclassified errors and guards cyclic cause chains', () => {
      const cyclic: Error & { cause?: unknown } = new Error('unexpected local error');
      cyclic.cause = cyclic;

      expect(classifyEmbeddingError(cyclic)).toMatchObject({
        category: 'unknown',
        retryable: true
      });
      expect(normalizeEmbeddingError(cyclic)).toBe(cyclic);
    });

    it('is idempotent when normalizing an already normalized EmbeddingRequestError', () => {
      const raw = makeApiError({ status: 401, message: 'Incorrect API key' });
      const once = normalizeEmbeddingError(raw);
      const twice = normalizeEmbeddingError(once);
      expect(twice).toBe(once);
    });
  });
});

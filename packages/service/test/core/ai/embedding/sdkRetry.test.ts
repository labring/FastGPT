import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { EmbeddingModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { EmbeddingRequestError } from '@fastgpt/service/core/ai/embedding/error';

vi.unmock('@fastgpt/service/core/ai/embedding');
vi.unmock('@fastgpt/service/core/ai/embedding/index');

vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countPromptTokens: vi.fn(async (text: string) => text.length),
  countPromptTokensBatch: vi.fn(async (texts: string[]) => texts.map((t) => t.length))
}));

const { getVectors } = await import('@fastgpt/service/core/ai/embedding/index');

const buildSystemEmbeddingModel = (): EmbeddingModelDataType => ({
  modelId: 'test-embedding-id',
  provider: 'OpenAI',
  model: 'text-embedding-3-small',
  name: 'text-embedding-3-small',
  type: ModelTypeEnum.embedding,
  scope: ModelScopeEnum.system,
  isActive: true,
  config: {
    maxToken: 8192,
    defaultToken: 512,
    normalization: false,
    batchSize: 1
  }
});

const jsonResponse = ({
  status,
  body,
  headers
}: {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });

describe('getVectors real OpenAI SDK HTTP retry budgets', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: 'HTTP 429 insufficient_quota stops after 1 HTTP request',
      status: 429,
      body: {
        error: {
          message: 'You exceeded your current quota, please check your plan and billing details.',
          type: 'insufficient_quota',
          code: 'insufficient_quota'
        }
      },
      expectedCalls: 1,
      expectedCategory: 'quotaExceeded',
      expectedRetryable: false,
      expectedCode: ModelErrEnum.upstreamQuotaExceeded
    },
    {
      name: 'HTTP 429 generic invalid_request_error with quota message stops after 1 HTTP request',
      status: 429,
      body: {
        error: {
          message: 'You exceeded your current quota',
          type: 'invalid_request_error'
        }
      },
      expectedCalls: 1,
      expectedCategory: 'quotaExceeded',
      expectedRetryable: false,
      expectedCode: ModelErrEnum.upstreamQuotaExceeded
    },
    {
      name: 'HTTP 429 rate limit executes exactly 3 HTTP requests without SDK+retryFn amplification',
      status: 429,
      body: {
        error: {
          message: 'Rate limit reached for requests per min',
          type: 'requests',
          code: 'rate_limit_exceeded'
        }
      },
      expectedCalls: 3,
      expectedCategory: 'rateLimited',
      expectedRetryable: true,
      expectedCode: ModelErrEnum.rateLimited
    },
    {
      name: 'HTTP 429 image download too many requests executes 3 HTTP requests instead of 12',
      status: 429,
      body: {
        error: {
          message: 'Failed to download image: too many requests',
          type: 'upstream_error',
          code: 'bad_response'
        }
      },
      expectedCalls: 3,
      expectedCategory: 'imageDownloadFailed',
      expectedRetryable: true,
      expectedCode: ModelErrEnum.imageDownloadFailed
    },
    {
      name: 'HTTP 400 wrapped service_unavailable remains retryable across 3 HTTP requests',
      status: 400,
      body: {
        error: {
          message: 'upstream temporary error',
          type: 'upstream_error',
          code: 'service_unavailable'
        }
      },
      expectedCalls: 3,
      expectedCategory: 'upstreamUnavailable',
      expectedRetryable: true,
      expectedCode: ModelErrEnum.serviceUnavailable
    },
    {
      name: 'HTTP 400 permanent image download 404 stops after 1 HTTP request',
      status: 400,
      body: {
        error: {
          message:
            "Failed to download images: 404, message='Not Found', url='https://example.com/500/a.png'",
          type: 'upstream_error',
          code: 'BadRequest'
        }
      },
      expectedCalls: 1,
      expectedCategory: 'imageDownloadFailed',
      expectedRetryable: false,
      expectedCode: ModelErrEnum.imageDownloadFailed
    },
    {
      name: 'HTTP 200 carrying structured insufficient_quota error stops after 1 HTTP request',
      status: 200,
      body: {
        error: {
          message: 'You exceeded your current quota',
          code: 'insufficient_quota'
        }
      },
      expectedCalls: 1,
      expectedCategory: 'quotaExceeded',
      expectedRetryable: false,
      expectedCode: ModelErrEnum.upstreamQuotaExceeded
    },
    {
      name: 'HTTP 200 carrying invalid_request_error echoing rate_limit stops after 1 HTTP request',
      status: 200,
      body: {
        error: {
          message: "Unsupported value: 'rate_limit' for 'encoding_format'.",
          type: 'invalid_request_error'
        }
      },
      expectedCalls: 1,
      expectedCategory: 'invalidRequest',
      expectedRetryable: false,
      expectedCode: ModelErrEnum.invalidRequest
    },
    {
      name: 'HTTP 200 carrying invalid_request_error echoing request timed out stops after 1 HTTP request',
      status: 200,
      body: {
        error: {
          message: "Unsupported value: 'request timed out' for 'encoding_format'.",
          type: 'invalid_request_error'
        }
      },
      expectedCalls: 1,
      expectedCategory: 'invalidRequest',
      expectedRetryable: false,
      expectedCode: ModelErrEnum.invalidRequest
    },
    {
      name: 'HTTP 200 carrying invalid_request_error echoing failed to download image stops after 1 HTTP request',
      status: 200,
      body: {
        error: {
          message: "Unsupported value: 'failed to download image: 500' for 'encoding_format'.",
          type: 'invalid_request_error'
        }
      },
      expectedCalls: 1,
      expectedCategory: 'invalidRequest',
      expectedRetryable: false,
      expectedCode: ModelErrEnum.invalidRequest
    },
    {
      name: 'HTTP 400 with type: gateway_timeout and no code remains retryable across 3 HTTP requests',
      status: 400,
      body: {
        error: {
          message: 'Upstream did not respond in time.',
          type: 'gateway_timeout'
        }
      },
      expectedCalls: 3,
      expectedCategory: 'timeout',
      expectedRetryable: true,
      expectedCode: ModelErrEnum.requestTimeout
    }
  ])(
    '$name',
    async ({ status, body, expectedCalls, expectedCategory, expectedRetryable, expectedCode }) => {
      fetchMock.mockImplementation(async () => jsonResponse({ status, body }));

      const err = await getVectors({
        model: buildSystemEmbeddingModel(),
        inputs: [{ type: 'text', input: 'hello' }]
      }).catch((e) => e);

      expect(fetchMock).toHaveBeenCalledTimes(expectedCalls);
      expect(err).toBeInstanceOf(EmbeddingRequestError);
      expect(err).toMatchObject({
        category: expectedCategory,
        retryable: expectedRetryable,
        message: expectedCode
      });
    }
  );

  it('honors Retry-After seconds on 429 and succeeds once upstream recovers after the requested wait', async () => {
    vi.useFakeTimers();
    const requestTimes: number[] = [];
    fetchMock.mockImplementation(async () => {
      requestTimes.push(Date.now());
      if (requestTimes.length === 1) {
        return jsonResponse({
          status: 429,
          body: { error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' } },
          headers: { 'retry-after': '2' }
        });
      }
      return jsonResponse({
        status: 200,
        body: {
          data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
          usage: { total_tokens: 1 }
        }
      });
    });

    const promise = getVectors({
      model: buildSystemEmbeddingModel(),
      inputs: [{ type: 'text', input: 'hello' }]
    });

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestTimes[1] - requestTimes[0]).toBe(2000);
    expect(result.vectors).toHaveLength(1);
  });

  it('obeys x-should-retry: false on 503 without in-request retries while keeping outer retryable semantics', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        status: 503,
        body: {
          error: { message: 'Service temporarily unavailable', code: 'service_unavailable' }
        },
        headers: { 'x-should-retry': 'false', 'retry-after': '180' }
      })
    );

    const err = await getVectors({
      model: buildSystemEmbeddingModel(),
      inputs: [{ type: 'text', input: 'hello' }]
    }).catch((e) => e);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(EmbeddingRequestError);
    expect(err).toMatchObject({
      category: 'upstreamUnavailable',
      retryable: true,
      retryAfterMs: 180_000,
      message: ModelErrEnum.serviceUnavailable
    });
  });

  it('stops in-request retry when Retry-After exceeds budget and hands retryable error to upper layer', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        status: 429,
        body: { error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' } },
        headers: { 'retry-after': '60' }
      })
    );

    const err = await getVectors({
      model: buildSystemEmbeddingModel(),
      inputs: [{ type: 'text', input: 'hello' }]
    }).catch((e) => e);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(EmbeddingRequestError);
    expect(err).toMatchObject({
      category: 'rateLimited',
      retryable: true,
      retryAfterMs: 60_000,
      message: ModelErrEnum.rateLimited
    });
  });

  it('preserves Retry-After from the final HTTP failure after in-request retries are exhausted', async () => {
    let attempt = 0;
    fetchMock.mockImplementation(async () => {
      attempt++;
      return jsonResponse({
        status: 429,
        body: { error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' } },
        headers: { 'retry-after': attempt < 3 ? '0' : '180' }
      });
    });

    const err = await getVectors({
      model: buildSystemEmbeddingModel(),
      inputs: [{ type: 'text', input: 'hello' }]
    }).catch((e) => e);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(err).toBeInstanceOf(EmbeddingRequestError);
    expect(err).toMatchObject({
      category: 'rateLimited',
      retryable: true,
      retryAfterMs: 180_000,
      message: ModelErrEnum.rateLimited
    });
  });

  it('enforces cumulative 10s in-request retry wait budget across repeated Retry-After: 8 responses', async () => {
    vi.useFakeTimers();
    const requestTimes: number[] = [];
    fetchMock.mockImplementation(async () => {
      requestTimes.push(Date.now());
      return jsonResponse({
        status: 429,
        body: { error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' } },
        headers: { 'retry-after': '8' }
      });
    });

    const promise = getVectors({
      model: buildSystemEmbeddingModel(),
      inputs: [{ type: 'text', input: 'hello' }]
    }).catch((e) => e);

    await vi.advanceTimersByTimeAsync(7999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    const err = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestTimes[1] - requestTimes[0]).toBe(8000);
    expect(err).toBeInstanceOf(EmbeddingRequestError);
    expect(err).toMatchObject({
      category: 'rateLimited',
      retryable: true,
      retryAfterMs: 8_000,
      message: ModelErrEnum.rateLimited
    });
  });

  it('retries HTTP 200 generic invalid_request_error with complete "Request timed out." message and succeeds on recovery', async () => {
    vi.useFakeTimers();
    let calls = 0;
    fetchMock.mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        return jsonResponse({
          status: 200,
          body: {
            error: {
              type: 'invalid_request_error',
              message: 'Request timed out.'
            }
          }
        });
      }
      return jsonResponse({
        status: 200,
        body: {
          data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
          usage: { total_tokens: 1 }
        }
      });
    });

    const promise = getVectors({
      model: buildSystemEmbeddingModel(),
      inputs: [{ type: 'text', input: 'hello' }]
    });

    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.vectors).toHaveLength(1);
  });

  it('honors Retry-After header on HTTP 200 structured rate_limit_exceeded for both long queue handoff and short recovery', async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({
        status: 200,
        body: {
          error: {
            message: 'Rate limit exceeded',
            code: 'rate_limit_exceeded'
          }
        },
        headers: { 'retry-after': '180' }
      })
    );

    const longErr = await getVectors({
      model: buildSystemEmbeddingModel(),
      inputs: [{ type: 'text', input: 'hello' }]
    }).catch((e) => e);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(longErr).toBeInstanceOf(EmbeddingRequestError);
    expect(longErr).toMatchObject({
      category: 'rateLimited',
      retryable: true,
      retryAfterMs: 180_000,
      message: ModelErrEnum.rateLimited
    });

    vi.useFakeTimers();
    fetchMock.mockReset();
    const requestTimes: number[] = [];
    fetchMock.mockImplementation(async () => {
      requestTimes.push(Date.now());
      if (requestTimes.length === 1) {
        return jsonResponse({
          status: 200,
          body: {
            error: {
              message: 'Rate limit exceeded',
              code: 'rate_limit_exceeded'
            }
          },
          headers: { 'retry-after': '2' }
        });
      }
      return jsonResponse({
        status: 200,
        body: {
          data: [{ embedding: [0.4, 0.5, 0.6], index: 0 }],
          usage: { total_tokens: 1 }
        }
      });
    });

    const promise = getVectors({
      model: buildSystemEmbeddingModel(),
      inputs: [{ type: 'text', input: 'hello' }]
    });

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const recovered = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestTimes[1] - requestTimes[0]).toBe(2000);
    expect(recovered.vectors).toHaveLength(1);
  });

  it.each(['rate_limit', 'failed to download image: 500'])(
    'stops after 1 HTTP request for HTTP 400 invalid_value echoing %s',
    async (echoedValue) => {
      fetchMock.mockImplementation(async () =>
        jsonResponse({
          status: 400,
          body: {
            error: {
              message: `Unsupported value: '${echoedValue}' for 'encoding_format'.`,
              type: 'invalid_request_error',
              code: 'invalid_value'
            }
          }
        })
      );

      const err = await getVectors({
        model: buildSystemEmbeddingModel(),
        inputs: [{ type: 'text', input: 'hello' }]
      }).catch((e) => e);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(err).toBeInstanceOf(EmbeddingRequestError);
      expect(err).toMatchObject({
        category: 'invalidRequest',
        retryable: false,
        message: ModelErrEnum.invalidRequest
      });
    }
  );

  it('never retries deterministic 429 insufficient_quota even if upstream sends x-should-retry: true', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        status: 429,
        body: { error: { message: 'You exceeded your current quota', code: 'insufficient_quota' } },
        headers: { 'x-should-retry': 'true', 'retry-after': '1' }
      })
    );

    const err = await getVectors({
      model: buildSystemEmbeddingModel(),
      inputs: [{ type: 'text', input: 'hello' }]
    }).catch((e) => e);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(EmbeddingRequestError);
    expect(err).toMatchObject({
      category: 'quotaExceeded',
      retryable: false,
      message: ModelErrEnum.upstreamQuotaExceeded
    });
  });

  it.each([
    {
      name: 'HTTP 204 No Content',
      makeResponse: () => new Response(null, { status: 204 })
    },
    {
      name: 'HTTP 200 JSON Content-Length 0',
      makeResponse: () =>
        new Response('', {
          status: 200,
          headers: { 'content-type': 'application/json', 'content-length': '0' }
        })
    },
    {
      name: 'HTTP 200 truncated JSON',
      makeResponse: () =>
        new Response('{"data": [', {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    },
    {
      name: 'HTTP 200 batch item missing embedding',
      makeResponse: () =>
        jsonResponse({
          status: 200,
          body: { data: [{ embedding: [0.1, 0.2], index: 0 }, { index: 1 }] }
        })
    }
  ])(
    'normalizes malformed 2xx response ($name) into retryable invalidResponse without crashing',
    async ({ makeResponse }) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      fetchMock.mockImplementation(async () => makeResponse());

      const err = await getVectors({
        model: buildSystemEmbeddingModel(),
        inputs: [{ type: 'text', input: 'hello' }]
      }).catch((e) => e);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(err).toBeInstanceOf(EmbeddingRequestError);
      expect(err).toMatchObject({
        category: 'invalidResponse',
        retryable: true,
        message: ModelErrEnum.invalidResponse
      });
    }
  );
});

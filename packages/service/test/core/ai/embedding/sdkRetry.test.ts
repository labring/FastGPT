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

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

describe('getVectors real OpenAI SDK HTTP retry budgets', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
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
    }
  ])(
    '$name',
    async ({ status, body, expectedCalls, expectedCategory, expectedRetryable, expectedCode }) => {
      fetchMock.mockImplementation(async () => jsonResponse(status, body));

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
});

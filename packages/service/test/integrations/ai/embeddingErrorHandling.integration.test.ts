import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { isNonRetryableModelError } from '@fastgpt/global/common/error/model';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { TRAINING_LEASE_TIMEOUT_MS } from '@fastgpt/global/core/dataset/training/constant';
import type { EmbeddingModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type { RerankModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { UserError } from '@fastgpt/global/common/error/utils';
import { generatedLoaders } from '@fastgpt/web/i18n/resourceLoaders.generated';
import { PRIVATE_URL_TEXT } from '@fastgpt/service/common/system/utils';
import { createApiI18n, registerServerI18nLoaders } from '@fastgpt/service/common/i18n/request';
import type { NodeApiRequest, NodeApiResponse } from '@fastgpt/service/types/http';
import { EmbeddingRequestError } from '@fastgpt/service/core/ai/embedding/error';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { findAndLockTrainingTask } from '@fastgpt/service/core/dataset/training/entity';
import { BLOCKED_LOCK_TIME } from '@fastgpt/service/core/dataset/training/query';
import { createTrainingTaskLease } from '@fastgpt/service/core/dataset/training/service';
import { probeModelStatus } from '@fastgpt/service/core/ai/modelStatus/service';
import { testModelConnection } from '@fastgpt/service/core/ai/model/test';

vi.unmock('@fastgpt/service/core/ai/embedding');
vi.unmock('@fastgpt/service/core/ai/embedding/index');
vi.unmock('@fastgpt/service/common/response');

vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countPromptTokens: vi.fn(async (text: string) => text.length),
  countPromptTokensBatch: vi.fn(async (texts: string[]) => texts.map((t) => t.length))
}));

const { getVectors } = await import('@fastgpt/service/core/ai/embedding/index');
const { jsonRes } = await import('@fastgpt/service/common/response');

const withI18n = createApiI18n(generatedLoaders);

const buildEmbeddingModel = (): EmbeddingModelDataType => ({
  modelId: 'integration-emb-id',
  provider: 'OpenAI',
  model: 'text-embedding-3-small',
  name: 'Embedding Integration Model',
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

const jsonResponse = (status: number, body: unknown, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });

const textResponse = (
  status: number,
  body: string,
  contentType = 'text/plain',
  headers?: Record<string, string>
) =>
  new Response(body, {
    status,
    headers: { 'content-type': contentType, ...headers }
  });

const createTrainingPair = async () => {
  const teamId = new Types.ObjectId();
  const tmbId = new Types.ObjectId();
  const datasetId = new Types.ObjectId();
  const collectionId = new Types.ObjectId();
  const data = await MongoDatasetData.create({
    teamId,
    tmbId,
    datasetId,
    collectionId,
    q: 'sample chunk',
    a: '',
    indexes: [],
    indexStatus: DatasetDataIndexStatusEnum.indexing
  });
  const task = await MongoDatasetTraining.create({
    teamId,
    tmbId,
    datasetId,
    collectionId,
    dataId: data._id,
    billId: 'integration-bill',
    mode: TrainingModeEnum.index,
    retryCount: 3,
    lockTime: new Date()
  });
  return { dataId: data._id, task };
};

const makeHttpPair = (locale: string) => {
  const req = { headers: { 'x-fastgpt-language': locale } } as unknown as NodeApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    write: vi.fn(),
    setHeader: vi.fn(),
    getHeader: vi.fn()
  } as unknown as NodeApiResponse;
  return { req, res };
};

describe('Embedding error handling end-to-end integration', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    registerServerI18nLoaders(generatedLoaders);
  });

  afterEach(() => {
    registerServerI18nLoaders(undefined);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('all deterministic & transient HTTP/network/non-JSON errors through getVectors + Mongo lease + API i18n', () => {
    type Scenario = {
      name: string;
      setupFetch: () => void;
      expectedHttpCalls: number;
      expectedCategory: string;
      expectedRetryable: boolean;
      expectedCode: ModelErrEnum;
      expectedHttpStatus: number;
      forbiddenSubstrings?: string[];
    };

    const scenarios: Scenario[] = [
      {
        name: 'HTTP 401 JSON invalid_api_key',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(401, {
              error: {
                message: 'Incorrect API key provided: sk-secret-12345',
                code: 'invalid_api_key',
                type: 'invalid_request_error'
              }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'authFailed',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.authFailed,
        expectedHttpStatus: 502,
        forbiddenSubstrings: ['sk-secret-12345']
      },
      {
        name: 'HTTP 401 plain text Unauthorized',
        setupFetch: () =>
          fetchMock.mockImplementation(async () => textResponse(401, 'Unauthorized')),
        expectedHttpCalls: 1,
        expectedCategory: 'authFailed',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.authFailed,
        expectedHttpStatus: 502
      },
      {
        name: 'HTTP 402 Insufficient Balance',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(402, { error: { message: 'Insufficient Balance' } })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'quotaExceeded',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.upstreamQuotaExceeded,
        expectedHttpStatus: 502
      },
      {
        name: 'HTTP 403 Credit balance too low (quota beats permissionDenied)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(403, { error: { message: 'Credit balance is too low to access API' } })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'quotaExceeded',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.upstreamQuotaExceeded,
        expectedHttpStatus: 502
      },
      {
        name: 'HTTP 429 insufficient_quota even with x-should-retry: true & Retry-After: 1',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(
              429,
              { error: { message: 'You exceeded your current quota', code: 'insufficient_quota' } },
              { 'x-should-retry': 'true', 'retry-after': '1' }
            )
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'quotaExceeded',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.upstreamQuotaExceeded,
        expectedHttpStatus: 502
      },
      {
        name: 'HTTP 403 permission_denied',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(403, {
              error: { message: 'You do not have access to this model', code: 'permission_denied' }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'permissionDenied',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.permissionDenied,
        expectedHttpStatus: 502
      },
      {
        name: 'HTTP 404 relay no available channel',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(404, {
              error: {
                message: 'no available channel for model text-embedding-3-small',
                type: 'aiproxy_error'
              }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'noAvailableChannel',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.noAvailableChannel,
        expectedHttpStatus: 404
      },
      {
        name: 'HTTP 404 model_not_found',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(404, {
              error: {
                message: 'The model `foo-emb` does not exist',
                code: 'model_not_found'
              }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'modelNotFound',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.modelNotFound,
        expectedHttpStatus: 502
      },
      {
        name: 'HTTP 400 content moderation data_inspection_failed',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(400, {
              error: {
                message: 'Input data may contain inappropriate content.',
                code: 'data_inspection_failed',
                type: 'invalid_request_error'
              }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'contentModeration',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.contentBlocked,
        expectedHttpStatus: 400
      },
      {
        name: 'HTTP 451 legal/content policy block',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            textResponse(451, 'Unavailable For Legal Reasons')
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'contentModeration',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.contentBlocked,
        expectedHttpStatus: 400
      },
      {
        name: 'HTTP 400 context_length_exceeded',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(400, {
              error: {
                message: "This model's maximum context length is 8192 tokens.",
                code: 'context_length_exceeded',
                type: 'invalid_request_error'
              }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'inputTooLong',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.inputTooLong,
        expectedHttpStatus: 400
      },
      {
        name: 'HTTP 413 HTML Payload Too Large',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            textResponse(413, '<html><body>413 Request Entity Too Large</body></html>', 'text/html')
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'inputTooLong',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.inputTooLong,
        expectedHttpStatus: 400,
        forbiddenSubstrings: ['<html>']
      },
      {
        name: 'HTTP 400 unsupported image format',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(400, {
              error: {
                message: 'Unsupported image format: image/tiff',
                type: 'invalid_request_error'
              }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'invalidImage',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.invalidImage,
        expectedHttpStatus: 400
      },
      {
        name: 'HTTP 400 permanent image download 404 with /500/ in URL',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(400, {
              error: {
                message:
                  "Failed to download images: 404, message='Not Found', url='https://cdn.example.com/500/secret-token/a.png'",
                code: 'BadRequest',
                type: 'upstream_error'
              }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'imageDownloadFailed',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.imageDownloadFailed,
        expectedHttpStatus: 502,
        forbiddenSubstrings: ['secret-token', 'cdn.example.com']
      },
      {
        name: 'HTTP 400 transient image download 500 with /404/ & signed token in URL',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(400, {
              error: {
                message:
                  "Failed to download images: 500, message='Internal Server Error', url='https://cloud.fastgpt.cn/api/system/file/d/404/signed-secret'",
                code: 'BadRequest',
                type: 'upstream_error'
              }
            })
          ),
        expectedHttpCalls: 3,
        expectedCategory: 'imageDownloadFailed',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.imageDownloadFailed,
        expectedHttpStatus: 502,
        forbiddenSubstrings: ['signed-secret', 'cloud.fastgpt.cn']
      },
      {
        name: 'HTTP 429 image download too many requests (no 12x amplification)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(
              429,
              {
                error: {
                  message: 'Failed to download image: too many requests',
                  code: 'bad_response',
                  type: 'upstream_error'
                }
              },
              { 'retry-after': '0' }
            )
          ),
        expectedHttpCalls: 3,
        expectedCategory: 'imageDownloadFailed',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.imageDownloadFailed,
        expectedHttpStatus: 502
      },
      {
        name: 'ADVERSARIAL HTTP 400 invalid_value echoing rate_limit',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(400, {
              error: {
                message: "Unsupported value: 'rate_limit' for 'encoding_format'.",
                type: 'invalid_request_error',
                code: 'invalid_value'
              }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'invalidRequest',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.invalidRequest,
        expectedHttpStatus: 400
      },
      {
        name: 'ADVERSARIAL HTTP 400 invalid_value echoing overloaded',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(400, {
              error: {
                message: "Unsupported value: 'overloaded' for 'encoding_format'.",
                type: 'invalid_request_error',
                code: 'invalid_value'
              }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'invalidRequest',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.invalidRequest,
        expectedHttpStatus: 400
      },
      {
        name: 'ADVERSARIAL HTTP 400 invalid_value echoing failed to download image: 500',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(400, {
              error: {
                message:
                  "Unsupported value: 'failed to download image: 500' for 'encoding_format'.",
                type: 'invalid_request_error',
                code: 'invalid_value'
              }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'invalidRequest',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.invalidRequest,
        expectedHttpStatus: 400
      },
      {
        name: 'HTTP 400 plain text invalid input',
        setupFetch: () =>
          fetchMock.mockImplementation(async () => textResponse(400, 'Invalid input payload')),
        expectedHttpCalls: 1,
        expectedCategory: 'invalidRequest',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.invalidRequest,
        expectedHttpStatus: 400
      },
      {
        name: 'HTTP 400 proxy-wrapped service_unavailable (stays retryable)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(400, {
              error: {
                message: 'upstream temporary failure',
                code: 'service_unavailable',
                type: 'upstream_error'
              }
            })
          ),
        expectedHttpCalls: 3,
        expectedCategory: 'upstreamUnavailable',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.serviceUnavailable,
        expectedHttpStatus: 503
      },
      {
        name: 'HTTP 400 proxy-wrapped gateway_timeout (stays retryable)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(400, {
              error: {
                message: 'upstream gateway timeout',
                code: 'gateway_timeout',
                type: 'upstream_error'
              }
            })
          ),
        expectedHttpCalls: 3,
        expectedCategory: 'timeout',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.requestTimeout,
        expectedHttpStatus: 504
      },
      {
        name: 'HTTP 429 plain text Too Many Requests',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            textResponse(429, 'Too Many Requests', 'text/plain', { 'retry-after': '0' })
          ),
        expectedHttpCalls: 3,
        expectedCategory: 'rateLimited',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.rateLimited,
        expectedHttpStatus: 429
      },
      {
        name: 'HTTP 500 AI Proxy Postgres IP leak hidden behind serviceUnavailable',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(
              500,
              {
                error: {
                  message:
                    'failed to get group: failed to connect to `user=postgres database=aiproxy`: dial tcp 10.96.188.19:5432',
                  type: 'aiproxy_error'
                }
              },
              { 'retry-after': '0' }
            )
          ),
        expectedHttpCalls: 3,
        expectedCategory: 'upstreamUnavailable',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.serviceUnavailable,
        expectedHttpStatus: 503,
        forbiddenSubstrings: ['postgres', '10.96.188.19']
      },
      {
        name: 'HTTP 500 Postgres password auth failure stays upstreamUnavailable (not authFailed)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(
              500,
              {
                error: {
                  message: 'FATAL: password authentication failed for user "postgres"',
                  type: 'aiproxy_error'
                }
              },
              { 'retry-after': '0' }
            )
          ),
        expectedHttpCalls: 3,
        expectedCategory: 'upstreamUnavailable',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.serviceUnavailable,
        expectedHttpStatus: 503,
        forbiddenSubstrings: ['postgres']
      },
      {
        name: 'HTTP 502 HTML Bad Gateway',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            textResponse(
              502,
              '<!DOCTYPE html><html><body><h1>502 Bad Gateway</h1></body></html>',
              'text/html',
              { 'retry-after': '0' }
            )
          ),
        expectedHttpCalls: 3,
        expectedCategory: 'upstreamUnavailable',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.serviceUnavailable,
        expectedHttpStatus: 503,
        forbiddenSubstrings: ['<html>', 'Bad Gateway']
      },
      {
        name: 'HTTP 503 with x-should-retry: false (1 in-request call, still queue-retryable)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(
              503,
              { error: { message: 'Service temporarily unavailable' } },
              { 'x-should-retry': 'false' }
            )
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'upstreamUnavailable',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.serviceUnavailable,
        expectedHttpStatus: 503
      },
      {
        name: 'HTTP 504 Gateway Timeout',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            textResponse(504, 'Gateway Timeout', 'text/plain', { 'retry-after': '0' })
          ),
        expectedHttpCalls: 3,
        expectedCategory: 'timeout',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.requestTimeout,
        expectedHttpStatus: 504
      },
      {
        name: 'HTTP 408 Request Timeout',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            textResponse(408, 'Request Timeout', 'text/plain', { 'retry-after': '0' })
          ),
        expectedHttpCalls: 3,
        expectedCategory: 'timeout',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.requestTimeout,
        expectedHttpStatus: 504
      },
      {
        name: 'HTTP 409 Conflict',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(409, { error: { message: 'Conflict' } }, { 'retry-after': '0' })
          ),
        expectedHttpCalls: 3,
        expectedCategory: 'upstreamUnavailable',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.serviceUnavailable,
        expectedHttpStatus: 503
      },
      {
        name: 'HTTP 200 structured error insufficient_quota (1 call, non-retryable)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(200, {
              error: { message: 'You exceeded your current quota', code: 'insufficient_quota' }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'quotaExceeded',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.upstreamQuotaExceeded,
        expectedHttpStatus: 502
      },
      {
        name: 'HTTP 200 data.err invalid_api_key (1 call, non-retryable)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(200, {
              data: { err: { message: 'Invalid API key', code: 'invalid_api_key' } }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'authFailed',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.authFailed,
        expectedHttpStatus: 502
      },
      {
        name: 'HTTP 200 empty data array (3 calls, invalidResponse)',
        setupFetch: () => fetchMock.mockImplementation(async () => jsonResponse(200, { data: [] })),
        expectedHttpCalls: 3,
        expectedCategory: 'invalidResponse',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.invalidResponse,
        expectedHttpStatus: 502
      },
      {
        name: 'HTTP 200 non-JSON HTML captive portal page (invalidResponse)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            textResponse(200, '<html><body>Login Required</body></html>', 'text/html')
          ),
        expectedHttpCalls: 3,
        expectedCategory: 'invalidResponse',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.invalidResponse,
        expectedHttpStatus: 502,
        forbiddenSubstrings: ['<html>', 'Login Required']
      },
      {
        name: 'HTTP 204 No Content (null parsed body -> invalidResponse, no TypeError)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () => new Response(null, { status: 204 })),
        expectedHttpCalls: 3,
        expectedCategory: 'invalidResponse',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.invalidResponse,
        expectedHttpStatus: 502
      },
      {
        name: 'HTTP 200 JSON Content-Length 0 (undefined parsed body -> invalidResponse, no TypeError)',
        setupFetch: () =>
          fetchMock.mockImplementation(
            async () =>
              new Response('', {
                status: 200,
                headers: { 'content-type': 'application/json', 'content-length': '0' }
              })
          ),
        expectedHttpCalls: 3,
        expectedCategory: 'invalidResponse',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.invalidResponse,
        expectedHttpStatus: 502
      },
      {
        name: 'HTTP 200 truncated/malformed JSON body (SyntaxError -> invalidResponse)',
        setupFetch: () =>
          fetchMock.mockImplementation(
            async () =>
              new Response('{"data": [', {
                status: 200,
                headers: { 'content-type': 'application/json' }
              })
          ),
        expectedHttpCalls: 3,
        expectedCategory: 'invalidResponse',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.invalidResponse,
        expectedHttpStatus: 502,
        forbiddenSubstrings: ['Unexpected end of JSON']
      },
      {
        name: 'HTTP 400 DashScope PascalCase Arrearage (quotaExceeded, 1 call)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(400, {
              error: {
                code: 'Arrearage',
                message: 'Access denied, please make sure your account is in good standing.'
              }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'quotaExceeded',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.upstreamQuotaExceeded,
        expectedHttpStatus: 502
      },
      {
        name: 'HTTP 400 DashScope PascalCase DataInspectionFailed (contentModeration, 1 call)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(400, {
              error: {
                code: 'DataInspectionFailed',
                message: 'Request rejected by upstream policy.'
              }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'contentModeration',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.contentBlocked,
        expectedHttpStatus: 400
      },
      {
        name: 'HTTP 400 DashScope InvalidParameter real image download 500 (still retryable, 3 calls)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(400, {
              error: {
                code: 'InvalidParameter',
                message: 'Failed to download image: 500 Internal Server Error'
              }
            })
          ),
        expectedHttpCalls: 3,
        expectedCategory: 'imageDownloadFailed',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.imageDownloadFailed,
        expectedHttpStatus: 502
      },
      {
        name: 'HTTP 400 DashScope PascalCase InvalidApiKey (authFailed, 1 call)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            jsonResponse(400, {
              error: {
                code: 'InvalidApiKey',
                message: 'Credential rejected.'
              }
            })
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'authFailed',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.authFailed,
        expectedHttpStatus: 502
      },
      {
        name: 'HTTP 403 Cloudflare HTML error page (permissionDenied, hides HTML)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            textResponse(
              403,
              '<html><head><title>403 Forbidden</title></head><body>Attention Required! | Cloudflare</body></html>',
              'text/html'
            )
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'permissionDenied',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.permissionDenied,
        expectedHttpStatus: 502,
        forbiddenSubstrings: ['<html>', 'Cloudflare']
      },
      {
        name: 'HTTP 413 Nginx HTML error page (inputTooLong, hides HTML)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            textResponse(
              413,
              '<html><head><title>413 Request Entity Too Large</title></head><body>nginx/1.25</body></html>',
              'text/html'
            )
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'inputTooLong',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.inputTooLong,
        expectedHttpStatus: 400,
        forbiddenSubstrings: ['<html>', 'nginx']
      },
      {
        name: 'HTTP 404 Nginx HTML error page (modelNotFound, hides HTML)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () =>
            textResponse(
              404,
              '<html><head><title>404 Not Found</title></head><body>nginx/1.25</body></html>',
              'text/html'
            )
          ),
        expectedHttpCalls: 1,
        expectedCategory: 'modelNotFound',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.modelNotFound,
        expectedHttpStatus: 502,
        forbiddenSubstrings: ['<html>', 'nginx']
      },
      {
        name: 'HTTP 500 empty body (upstreamUnavailable, 3 calls)',
        setupFetch: () =>
          fetchMock.mockImplementation(async () => new Response('', { status: 500 })),
        expectedHttpCalls: 3,
        expectedCategory: 'upstreamUnavailable',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.serviceUnavailable,
        expectedHttpStatus: 503
      },
      {
        name: 'Network ECONNRESET inside fetch failed',
        setupFetch: () =>
          fetchMock.mockImplementation(async () => {
            throw new TypeError('fetch failed', {
              cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
            });
          }),
        expectedHttpCalls: 3,
        expectedCategory: 'networkError',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.networkError,
        expectedHttpStatus: 502
      },
      {
        name: 'Network UND_ERR_CONNECT_TIMEOUT inside fetch failed',
        setupFetch: () =>
          fetchMock.mockImplementation(async () => {
            throw new TypeError('fetch failed', {
              cause: Object.assign(new Error('connect timeout'), {
                code: 'UND_ERR_CONNECT_TIMEOUT'
              })
            });
          }),
        expectedHttpCalls: 3,
        expectedCategory: 'timeout',
        expectedRetryable: true,
        expectedCode: ModelErrEnum.requestTimeout,
        expectedHttpStatus: 504
      },
      {
        name: 'SSRF private endpoint blocked inside fetch cause',
        setupFetch: () =>
          fetchMock.mockImplementation(async () => {
            throw new TypeError('fetch failed', { cause: new Error(PRIVATE_URL_TEXT) });
          }),
        expectedHttpCalls: 1,
        expectedCategory: 'privateUrl',
        expectedRetryable: false,
        expectedCode: ModelErrEnum.privateEndpointBlocked,
        expectedHttpStatus: 400
      }
    ];

    it.each(scenarios)(
      'handles $name end-to-end across getVectors -> Mongo lease -> API 4-locale response',
      async ({
        setupFetch,
        expectedHttpCalls,
        expectedCategory,
        expectedRetryable,
        expectedCode,
        expectedHttpStatus,
        forbiddenSubstrings
      }) => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        setupFetch();

        const err = await getVectors({
          model: buildEmbeddingModel(),
          inputs: [{ type: 'text', input: 'integration test input' }]
        }).catch((e) => e);

        expect(fetchMock).toHaveBeenCalledTimes(expectedHttpCalls);
        expect(err).toBeInstanceOf(EmbeddingRequestError);
        expect(err).toMatchObject({
          category: expectedCategory,
          retryable: expectedRetryable,
          message: expectedCode
        });
        expect(isNonRetryableModelError(err)).toBe(!expectedRetryable);

        const i18nKey = ERROR_RESPONSE[expectedCode].message;
        const errText = getErrText(err);
        expect(errText).toBe(i18nKey);
        for (const forbidden of forbiddenSubstrings ?? []) {
          expect(errText).not.toContain(forbidden);
        }

        // 1. Real MongoDB training task lease state transition
        vi.useRealTimers();
        const { dataId, task } = await createTrainingPair();
        const lease = createTrainingTaskLease(task);
        try {
          await lease.fail(err);
        } finally {
          await lease.stop();
        }
        const savedTask = await MongoDatasetTraining.findById(task._id).lean();
        const savedData = await MongoDatasetData.findById(dataId).lean();
        expect(savedTask?.errorMsg).toBe(i18nKey);
        if (expectedRetryable) {
          expect(savedTask?.retryCount).toBe(2);
          expect(savedData?.indexStatus).toBe(DatasetDataIndexStatusEnum.indexing);
          expect(savedData?.indexErrorMsg).toBeUndefined();
        } else {
          expect(savedTask?.retryCount).toBe(0);
          expect(savedTask?.expireAt).toBeNull();
          expect(savedData?.indexStatus).toBe(DatasetDataIndexStatusEnum.error);
          expect(savedData?.indexErrorMsg).toBe(i18nKey);
        }

        // 2. Real API response + 4-locale translation check
        for (const locale of ['zh-CN', 'en', 'zh-Hant', 'ko-KR'] as const) {
          const http = makeHttpPair(locale);
          await withI18n(http, () => {
            jsonRes(http.res, { code: 500, error: err });
          });
          expect(http.res.status).toHaveBeenCalledWith(expectedHttpStatus);
          const payload = (http.res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
          expect(payload.statusText).toBe(expectedCode);
          expect(payload.message).not.toContain('common:code_error');
          expect(payload.message.trim().length).toBeGreaterThan(0);
          for (const forbidden of forbiddenSubstrings ?? []) {
            expect(payload.message).not.toContain(forbidden);
          }
        }
      },
      20000
    );
  });

  describe('Retry-After coordination across getVectors + real MongoDB training queue', () => {
    it('propagates 180s Retry-After from final failure into Mongo lockTime and blocks premature claim', async () => {
      let attempt = 0;
      fetchMock.mockImplementation(async () => {
        attempt++;
        return jsonResponse(
          429,
          { error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' } },
          { 'retry-after': attempt < 3 ? '0' : '180' }
        );
      });

      const err = await getVectors({
        model: buildEmbeddingModel(),
        inputs: [{ type: 'text', input: 'hello' }]
      }).catch((e) => e);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(err).toMatchObject({ retryable: true, retryAfterMs: 180_000 });

      const { task } = await createTrainingPair();
      const before = Date.now();
      const lease = createTrainingTaskLease(task);
      try {
        await lease.fail(err);
      } finally {
        await lease.stop();
      }

      const updated = await MongoDatasetTraining.findById(task._id).lean();
      expect(updated?.retryCount).toBe(2);
      const claimableAt = updated!.lockTime.getTime() + TRAINING_LEASE_TIMEOUT_MS;
      expect(claimableAt - before).toBeGreaterThanOrEqual(179_000);
      expect(claimableAt - before).toBeLessThanOrEqual(185_000);
      expect(updated!.lockTime.getTime()).toBeLessThan(BLOCKED_LOCK_TIME.getTime());
      expect(
        await findAndLockTrainingTask({ mode: TrainingModeEnum.index, filter: { _id: task._id } })
      ).toBeNull();
    });

    it('handles HTTP-date Retry-After recovery end-to-end', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-19T12:00:00.000Z'));
      let calls = 0;
      fetchMock.mockImplementation(async () => {
        calls++;
        if (calls === 1) {
          return jsonResponse(
            429,
            { error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' } },
            { 'retry-after': 'Thu, 19 Nov 2026 12:00:03 GMT' }
          );
        }
        return jsonResponse(200, {
          data: [{ embedding: [0.2, 0.4, 0.6], index: 0 }],
          usage: { total_tokens: 1 }
        });
      });

      const promise = getVectors({
        model: buildEmbeddingModel(),
        inputs: [{ type: 'text', input: 'hello' }]
      });

      await vi.advanceTimersByTimeAsync(2999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      const res = await promise;
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(res.vectors).toHaveLength(1);
    });
  });

  describe('Model status probe integration through real testModelConnection + getVectors', () => {
    it('records readable English error + errorCode for real embedding 401 failure', async () => {
      fetchMock.mockImplementation(async () =>
        jsonResponse(401, {
          error: { message: 'Incorrect API key provided: sk-xxx', code: 'invalid_api_key' }
        })
      );

      const record = await probeModelStatus({
        model: buildEmbeddingModel(),
        test: testModelConnection
      });

      expect(record.status).toBe('red');
      expect(record.attempts).toBe(4);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(record.error).toBe(
        'Embedding Integration Model: Model API authentication failed. Please check the API key or channel configuration. (modelAuthFailed)'
      );
      expect(record.error).not.toContain('common:code_error');
      expect(record.error).not.toContain('sk-xxx');
    });

    it('falls back cleanly to generic English + errorCode when server i18n loaders are unavailable', async () => {
      registerServerI18nLoaders(undefined);
      fetchMock.mockImplementation(async () =>
        jsonResponse(401, {
          error: { message: 'Incorrect API key provided: sk-secret', code: 'invalid_api_key' }
        })
      );

      const record = await probeModelStatus({
        model: buildEmbeddingModel(),
        test: testModelConnection
      });

      expect(record.status).toBe('red');
      expect(record.error).toBe('Embedding Integration Model: Model test failed (modelAuthFailed)');
      expect(record.error).not.toContain('common:code_error');
      expect(record.error).not.toContain('sk-secret');
    });

    it('preserves plain upstream Rerank 401 messages with colons instead of treating them as i18n keys', async () => {
      const rerankModel: RerankModelDataType = {
        modelId: 'integration-rerank-id',
        provider: 'Cohere',
        model: 'rerank-v3',
        name: 'Rerank Integration Model',
        type: ModelTypeEnum.rerank,
        scope: ModelScopeEnum.system,
        isActive: true,
        config: {}
      };

      const record = await probeModelStatus({
        model: rerankModel,
        test: async () => {
          throw new Error('Unauthorized: Invalid API key');
        }
      });

      expect(record.status).toBe('red');
      expect(record.error).toBe('Rerank Integration Model: Unauthorized: Invalid API key');
    });
  });

  describe('Local validation, abort, batch malformed data, and long Retry-After boundaries', () => {
    it.each([
      { name: 'empty array', inputs: [] },
      { name: 'whitespace-only text', inputs: [{ type: 'text' as const, input: '   \n\t  ' }] }
    ])(
      'handles $name without HTTP calls -> Mongo immediate termination -> 4-locale 400 API response',
      async ({ inputs }) => {
        const err = await getVectors({
          model: buildEmbeddingModel(),
          inputs
        }).catch((e) => e);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(err).toBeInstanceOf(EmbeddingRequestError);
        expect(err).toMatchObject({
          category: 'emptyInput',
          retryable: false,
          message: ModelErrEnum.embeddingEmptyInput
        });
        expect(isNonRetryableModelError(err)).toBe(true);

        const i18nKey = ERROR_RESPONSE[ModelErrEnum.embeddingEmptyInput].message;
        const { dataId, task } = await createTrainingPair();
        const lease = createTrainingTaskLease(task);
        try {
          await lease.fail(err);
        } finally {
          await lease.stop();
        }
        const savedTask = await MongoDatasetTraining.findById(task._id).lean();
        const savedData = await MongoDatasetData.findById(dataId).lean();
        expect(savedTask?.retryCount).toBe(0);
        expect(savedTask?.errorMsg).toBe(i18nKey);
        expect(savedData?.indexStatus).toBe(DatasetDataIndexStatusEnum.error);
        expect(savedData?.indexErrorMsg).toBe(i18nKey);

        for (const locale of ['zh-CN', 'en', 'zh-Hant', 'ko-KR'] as const) {
          const http = makeHttpPair(locale);
          await withI18n(http, () => {
            jsonRes(http.res, { code: 500, error: err });
          });
          expect(http.res.status).toHaveBeenCalledWith(400);
          const payload = (http.res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
          expect(payload.statusText).toBe(ModelErrEnum.embeddingEmptyInput);
          expect(payload.message).not.toContain('common:code_error');
          expect(payload.message.trim().length).toBeGreaterThan(0);
        }
      }
    );

    it('handles AbortSignal cancellation without retrying or permanently failing Mongo training task', async () => {
      const controller = new AbortController();
      controller.abort();

      const err = await getVectors({
        model: buildEmbeddingModel(),
        inputs: [{ type: 'text', input: 'hello' }],
        signal: controller.signal
      }).catch((e) => e);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(err).not.toBeInstanceOf(EmbeddingRequestError);
      expect(isNonRetryableModelError(err)).toBe(false);

      const { dataId, task } = await createTrainingPair();
      const lease = createTrainingTaskLease(task);
      try {
        await lease.fail(err);
      } finally {
        await lease.stop();
      }
      const savedTask = await MongoDatasetTraining.findById(task._id).lean();
      const savedData = await MongoDatasetData.findById(dataId).lean();
      expect(savedTask?.retryCount).toBe(2);
      expect(savedData?.indexStatus).toBe(DatasetDataIndexStatusEnum.indexing);
    });

    it('terminates Mongo training task immediately on UserError(ModelErrEnum.unExist)', async () => {
      const err = new UserError(ModelErrEnum.unExist);
      expect(isNonRetryableModelError(err)).toBe(true);

      const { dataId, task } = await createTrainingPair();
      const lease = createTrainingTaskLease(task);
      try {
        await lease.fail(err);
      } finally {
        await lease.stop();
      }
      const savedTask = await MongoDatasetTraining.findById(task._id).lean();
      const savedData = await MongoDatasetData.findById(dataId).lean();
      expect(savedTask?.retryCount).toBe(0);
      expect(savedData?.indexStatus).toBe(DatasetDataIndexStatusEnum.error);
    });

    it('handles HTTP 200 batch response where 2nd item lacks embedding as invalidResponse without TypeError', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      fetchMock.mockImplementation(async () =>
        jsonResponse(200, {
          data: [{ embedding: [0.1, 0.2], index: 0 }, { index: 1 }]
        })
      );

      const model = buildEmbeddingModel();
      model.config.batchSize = 2;

      const err = await getVectors({
        model,
        inputs: [
          { type: 'text', input: 'first' },
          { type: 'text', input: 'second' }
        ]
      }).catch((e) => e);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(err).toBeInstanceOf(EmbeddingRequestError);
      expect(err).toMatchObject({
        category: 'invalidResponse',
        retryable: true,
        message: ModelErrEnum.invalidResponse
      });
    });

    it('stops inner retry immediately when Retry-After > 10s, extends Mongo expireAt, and caps extreme delays at 24h', async () => {
      fetchMock.mockImplementationOnce(async () =>
        jsonResponse(
          429,
          { error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' } },
          { 'retry-after': '864000' }
        )
      );

      const err = await getVectors({
        model: buildEmbeddingModel(),
        inputs: [{ type: 'text', input: 'hello' }]
      }).catch((e) => e);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(err).toBeInstanceOf(EmbeddingRequestError);
      expect(err).toMatchObject({
        category: 'rateLimited',
        retryable: true,
        retryAfterMs: 864_000_000
      });

      const { task } = await createTrainingPair();
      const before = Date.now();
      const lease = createTrainingTaskLease(task);
      try {
        await lease.fail(err);
      } finally {
        await lease.stop();
      }

      const updated = await MongoDatasetTraining.findById(task._id).lean();
      expect(updated?.retryCount).toBe(2);
      const maxDelayMs = 24 * 60 * 60 * 1000;
      const claimableAt = updated!.lockTime.getTime() + TRAINING_LEASE_TIMEOUT_MS;
      expect(claimableAt - before).toBeGreaterThanOrEqual(maxDelayMs - 2_000);
      expect(claimableAt - before).toBeLessThanOrEqual(maxDelayMs + 5_000);
      expect(updated!.expireAt).not.toBeNull();
      // TTL index deletes 7 days after expireAt, so expireAt >= claimableAt guarantees 7 full days post-retry.
      expect(updated!.expireAt!.getTime()).toBeGreaterThanOrEqual(claimableAt);
    });
  });
});

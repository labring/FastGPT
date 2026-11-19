import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { UserError, getErrText } from '@fastgpt/global/common/error/utils';
import { isNonRetryableModelError } from '@fastgpt/global/common/error/model';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { TRAINING_LEASE_TIMEOUT_MS } from '@fastgpt/global/core/dataset/training/constant';
import type {
  EmbeddingModelDataType,
  RerankModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import { generatedLoaders } from '@fastgpt/web/i18n/resourceLoaders.generated';
import { PRIVATE_URL_TEXT } from '@fastgpt/service/common/system/utils';
import { createApiI18n } from '@fastgpt/service/common/i18n/request';
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
const TARGET_LOCALES = ['zh-CN', 'en', 'zh-Hant', 'ko-KR'] as const;
type TargetLocale = (typeof TARGET_LOCALES)[number];

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

const textResponse = ({
  status,
  body,
  contentType = 'text/plain',
  headers
}: {
  status: number;
  body: string;
  contentType?: string;
  headers?: Record<string, string>;
}) =>
  new Response(body, {
    status,
    headers: { 'content-type': contentType, ...headers }
  });

const createTrainingPair = async ({
  mode = TrainingModeEnum.index,
  indexStatus = DatasetDataIndexStatusEnum.indexing,
  expireAt
}: {
  mode?: TrainingModeEnum;
  indexStatus?: DatasetDataIndexStatusEnum;
  expireAt?: Date | null;
} = {}) => {
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
    indexStatus
  });
  const task = await MongoDatasetTraining.create({
    teamId,
    tmbId,
    datasetId,
    collectionId,
    dataId: data._id,
    billId: 'integration-bill',
    mode,
    retryCount: 3,
    ...(expireAt !== undefined ? { expireAt } : {}),
    lockTime: new Date()
  });
  return { dataId: data._id, task };
};

const renderApiError = async ({ locale, error }: { locale: TargetLocale; error: unknown }) => {
  const req = { headers: { 'x-fastgpt-language': locale } } as unknown as NodeApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    write: vi.fn(),
    setHeader: vi.fn(),
    getHeader: vi.fn()
  } as unknown as NodeApiResponse;
  await withI18n({ req, res }, async () => {
    jsonRes(res, { error });
  });
  return (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
    code: number;
    statusText: string;
    message: string;
  };
};

describe('Embedding error handling end-to-end integration', () => {
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

  describe('representative Mongo training lease state transitions', () => {
    it.each([
      {
        name: 'HTTP 401 invalid API key terminates immediately without leaking key',
        setupFetch: () => {
          fetchMock.mockImplementation(async () =>
            jsonResponse({
              status: 401,
              body: {
                error: {
                  message: 'Incorrect API key provided: sk-secret-integration-1234',
                  code: 'invalid_api_key'
                }
              }
            })
          );
        },
        expectedHttpCalls: 1,
        expectedErrorCode: ModelErrEnum.authFailed,
        forbiddenSubstrings: ['sk-secret-integration-1234']
      },
      {
        name: 'HTTP 429 generic invalid_request_error with quota message terminates immediately',
        setupFetch: () => {
          fetchMock.mockImplementation(async () =>
            jsonResponse({
              status: 429,
              body: {
                error: {
                  message: 'You exceeded your current quota, please check your billing.',
                  type: 'invalid_request_error'
                }
              }
            })
          );
        },
        expectedHttpCalls: 1,
        expectedErrorCode: ModelErrEnum.upstreamQuotaExceeded,
        forbiddenSubstrings: ['check your billing']
      },
      {
        name: 'HTTP 400 permanent image download 404 terminates immediately and hides URL',
        setupFetch: () => {
          fetchMock.mockImplementation(async () =>
            jsonResponse({
              status: 400,
              body: {
                error: {
                  message:
                    "Failed to download images: 404, message='Not Found', url='https://internal-bucket.example/500/img.png?token=sig'",
                  type: 'upstream_error',
                  code: 'BadRequest'
                }
              }
            })
          );
        },
        expectedHttpCalls: 1,
        expectedErrorCode: ModelErrEnum.imageDownloadFailed,
        forbiddenSubstrings: ['internal-bucket.example', 'token=sig']
      },
      {
        name: 'SSRF private URL block terminates immediately',
        setupFetch: () => {
          fetchMock.mockRejectedValue(new Error(PRIVATE_URL_TEXT));
        },
        expectedHttpCalls: 1,
        expectedErrorCode: ModelErrEnum.privateEndpointBlocked,
        forbiddenSubstrings: [PRIVATE_URL_TEXT]
      }
    ])(
      'deterministic failure ($name) exhausts retryCount and marks dataset data error',
      async ({ setupFetch, expectedHttpCalls, expectedErrorCode, forbiddenSubstrings }) => {
        setupFetch();

        const err = await getVectors({
          model: buildEmbeddingModel(),
          inputs: [{ type: 'text', input: 'hello world' }]
        }).catch((e) => e);

        expect(fetchMock).toHaveBeenCalledTimes(expectedHttpCalls);
        expect(err).toBeInstanceOf(EmbeddingRequestError);
        expect(err).toMatchObject({
          retryable: false,
          errorCode: expectedErrorCode,
          message: expectedErrorCode
        });
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
        expect(savedTask?.expireAt).toBeNull();
        expect(savedTask?.errorMsg).toBe(ERROR_RESPONSE[expectedErrorCode].message);
        expect(savedData?.indexStatus).toBe(DatasetDataIndexStatusEnum.error);
        expect(savedData?.indexErrorMsg).toBe(ERROR_RESPONSE[expectedErrorCode].message);
        for (const secret of forbiddenSubstrings) {
          expect(savedTask?.errorMsg).not.toContain(secret);
        }
      }
    );

    it('empty input local validation terminates Mongo training task without HTTP calls', async () => {
      const err = await getVectors({
        model: buildEmbeddingModel(),
        inputs: [{ type: 'text', input: '   ' }]
      }).catch((e) => e);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(err).toBeInstanceOf(EmbeddingRequestError);
      expect(err).toMatchObject({
        category: 'emptyInput',
        retryable: false,
        errorCode: ModelErrEnum.embeddingEmptyInput
      });

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
      expect(savedTask?.expireAt).toBeNull();
      expect(savedData?.indexStatus).toBe(DatasetDataIndexStatusEnum.error);
    });

    it.each([
      {
        name: 'HTTP 503 HTML gateway error',
        setupFetch: () => {
          fetchMock.mockImplementation(async () =>
            textResponse({
              status: 503,
              body: '<html><body>503 Service Temporarily Unavailable</body></html>',
              contentType: 'text/html'
            })
          );
        },
        expectedErrorCode: ModelErrEnum.serviceUnavailable
      },
      {
        name: 'HTTP 200 batch item missing embedding',
        setupFetch: () => {
          fetchMock.mockImplementation(async () =>
            jsonResponse({
              status: 200,
              body: {
                data: [{ embedding: [0.1, 0.2], index: 0 }, { index: 1 }],
                usage: { total_tokens: 2 }
              }
            })
          );
        },
        expectedErrorCode: ModelErrEnum.invalidResponse
      }
    ])(
      'transient failure ($name) decrements retryCount once and keeps dataset data indexing',
      async ({ setupFetch, expectedErrorCode }) => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        setupFetch();

        const err = await getVectors({
          model: buildEmbeddingModel(),
          inputs: [{ type: 'text', input: 'hello world' }]
        }).catch((e) => e);

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(err).toBeInstanceOf(EmbeddingRequestError);
        expect(err).toMatchObject({
          retryable: true,
          errorCode: expectedErrorCode,
          message: expectedErrorCode
        });

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
        expect(savedTask?.expireAt).toBeInstanceOf(Date);
        expect(savedTask?.errorMsg).toBe(ERROR_RESPONSE[expectedErrorCode].message);
        expect(savedData?.indexStatus).toBe(DatasetDataIndexStatusEnum.indexing);
      }
    );
  });

  describe('Retry-After and x-should-retry coordination with real MongoDB queue', () => {
    it('propagates 180s Retry-After from final 429 failure into Mongo lockTime, extends active expireAt, and blocks premature claim', async () => {
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
        model: buildEmbeddingModel(),
        inputs: [{ type: 'text', input: 'hello' }]
      }).catch((e) => e);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(err).toBeInstanceOf(EmbeddingRequestError);
      expect(err).toMatchObject({
        category: 'rateLimited',
        retryable: true,
        retryAfterMs: 180_000
      });

      const { dataId, task } = await createTrainingPair();
      const beforeFail = Date.now();
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
      const nextClaimableAt = savedTask!.lockTime.getTime() + TRAINING_LEASE_TIMEOUT_MS;
      expect(nextClaimableAt - beforeFail).toBeGreaterThanOrEqual(179_000);
      expect(nextClaimableAt - beforeFail).toBeLessThanOrEqual(185_000);
      expect(savedTask!.expireAt!.getTime() - beforeFail).toBeGreaterThanOrEqual(179_000);

      const premature = await findAndLockTrainingTask({
        mode: TrainingModeEnum.index,
        filter: { _id: task._id }
      });
      expect(premature).toBeNull();
    });

    it('honors x-should-retry: false + Retry-After: 180 on 503 while preserving rebuildSynonym expireAt: null', async () => {
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
        model: buildEmbeddingModel(),
        inputs: [{ type: 'text', input: 'hello' }]
      }).catch((e) => e);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(err).toBeInstanceOf(EmbeddingRequestError);
      expect(err).toMatchObject({
        category: 'upstreamUnavailable',
        retryable: true,
        retryAfterMs: 180_000
      });

      const { dataId, task } = await createTrainingPair({
        mode: TrainingModeEnum.rebuildSynonym,
        indexStatus: DatasetDataIndexStatusEnum.rebuildSynonymRunning,
        expireAt: null
      });
      const beforeFail = Date.now();
      const lease = createTrainingTaskLease(task);
      try {
        await lease.fail(err);
      } finally {
        await lease.stop();
      }

      const savedTask = await MongoDatasetTraining.findById(task._id).lean();
      const savedData = await MongoDatasetData.findById(dataId).lean();
      expect(savedTask?.retryCount).toBe(2);
      expect(savedTask?.expireAt).toBeNull();
      expect(savedData?.indexStatus).toBe(DatasetDataIndexStatusEnum.rebuildSynonymRunning);
      const nextClaimableAt = savedTask!.lockTime.getTime() + TRAINING_LEASE_TIMEOUT_MS;
      expect(nextClaimableAt - beforeFail).toBeGreaterThanOrEqual(179_000);
      expect(nextClaimableAt - beforeFail).toBeLessThanOrEqual(185_000);

      const premature = await findAndLockTrainingTask({
        mode: TrainingModeEnum.rebuildSynonym,
        filter: { _id: task._id }
      });
      expect(premature).toBeNull();
    });

    it('caps extreme Retry-After delays at 24h so lockTime stays active below BLOCKED_LOCK_TIME', async () => {
      const tenDaysSeconds = 10 * 24 * 60 * 60;
      fetchMock.mockImplementation(async () =>
        jsonResponse({
          status: 429,
          body: { error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' } },
          headers: { 'retry-after': String(tenDaysSeconds) }
        })
      );

      const err = await getVectors({
        model: buildEmbeddingModel(),
        inputs: [{ type: 'text', input: 'hello' }]
      }).catch((e) => e);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(err).toMatchObject({ retryAfterMs: tenDaysSeconds * 1000 });

      const { task } = await createTrainingPair();
      const beforeFail = Date.now();
      const lease = createTrainingTaskLease(task);
      try {
        await lease.fail(err);
      } finally {
        await lease.stop();
      }

      const savedTask = await MongoDatasetTraining.findById(task._id).lean();
      const maxDelayMs = 24 * 60 * 60 * 1000;
      expect(savedTask!.lockTime.getTime()).toBeLessThan(BLOCKED_LOCK_TIME.getTime());
      const nextClaimableAt = savedTask!.lockTime.getTime() + TRAINING_LEASE_TIMEOUT_MS;
      expect(nextClaimableAt - beforeFail).toBeGreaterThanOrEqual(maxDelayMs - 1000);
      expect(nextClaimableAt - beforeFail).toBeLessThanOrEqual(maxDelayMs + 5000);
      expect(savedTask!.expireAt!.getTime() - beforeFail).toBeGreaterThanOrEqual(maxDelayMs - 1000);
    });

    it('recovers end-to-end when HTTP-date Retry-After is within in-request wait budget', async () => {
      vi.useFakeTimers();
      const base = new Date('2026-11-19T00:00:00.000Z');
      vi.setSystemTime(base);
      let calls = 0;
      fetchMock.mockImplementation(async () => {
        calls++;
        if (calls === 1) {
          return jsonResponse({
            status: 429,
            body: { error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' } },
            headers: { 'retry-after': new Date(base.getTime() + 3000).toUTCString() }
          });
        }
        return jsonResponse({
          status: 200,
          body: { data: [{ embedding: [0.5, 0.5], index: 0 }], usage: { total_tokens: 1 } }
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

  describe('API i18n renders exact localized text for each target locale', () => {
    const expectedLocaleMessages: Record<
      | ModelErrEnum.authFailed
      | ModelErrEnum.upstreamQuotaExceeded
      | ModelErrEnum.serviceUnavailable
      | ModelErrEnum.embeddingEmptyInput,
      Record<TargetLocale, string>
    > = {
      [ModelErrEnum.authFailed]: {
        'zh-CN': '模型接口鉴权失败，请检查 API Key 或渠道配置',
        en: 'Model API authentication failed. Please check the API key or channel configuration.',
        'zh-Hant': '模型介面驗證失敗，請檢查 API Key 或渠道設定',
        'ko-KR': '모델 API 인증에 실패했습니다. API 키 또는 채널 설정을 확인해 주세요.'
      },
      [ModelErrEnum.upstreamQuotaExceeded]: {
        'zh-CN': '上游模型服务额度不足或账户欠费，请检查模型渠道余额',
        en: 'Upstream model service quota or balance is insufficient. Please check the model channel account.',
        'zh-Hant': '上游模型服務額度不足或帳戶欠費，請檢查模型渠道餘額',
        'ko-KR': '상위 모델 서비스 할당량 또는 잔액이 부족합니다. 모델 채널 계정을 확인해 주세요.'
      },
      [ModelErrEnum.serviceUnavailable]: {
        'zh-CN': '模型服务暂时不可用，请稍后重试',
        en: 'Model service is temporarily unavailable. Please try again later.',
        'zh-Hant': '模型服務暫時不可用，請稍後重試',
        'ko-KR': '모델 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'
      },
      [ModelErrEnum.embeddingEmptyInput]: {
        'zh-CN': '向量化输入内容为空，请检查数据内容',
        en: 'Embedding input content is empty. Please check the data.',
        'zh-Hant': '向量化輸入內容為空，請檢查資料內容',
        'ko-KR': '임베딩 입력 내용이 비어 있습니다. 데이터를 확인해 주세요.'
      }
    };

    it.each([
      {
        errorCode: ModelErrEnum.authFailed as const,
        trigger: () => {
          fetchMock.mockImplementation(async () =>
            jsonResponse({
              status: 401,
              body: {
                error: { message: 'Incorrect API key: sk-leak-check', code: 'invalid_api_key' }
              }
            })
          );
          return getVectors({
            model: buildEmbeddingModel(),
            inputs: [{ type: 'text', input: 'hello' }]
          });
        }
      },
      {
        errorCode: ModelErrEnum.upstreamQuotaExceeded as const,
        trigger: () => {
          fetchMock.mockImplementation(async () =>
            jsonResponse({
              status: 429,
              body: {
                error: { message: 'You exceeded your current quota', code: 'insufficient_quota' }
              }
            })
          );
          return getVectors({
            model: buildEmbeddingModel(),
            inputs: [{ type: 'text', input: 'hello' }]
          });
        }
      },
      {
        errorCode: ModelErrEnum.serviceUnavailable as const,
        trigger: () => {
          fetchMock.mockImplementation(async () =>
            textResponse({
              status: 503,
              body: '<html>503 Service Temporarily Unavailable</html>',
              contentType: 'text/html',
              headers: { 'x-should-retry': 'false' }
            })
          );
          return getVectors({
            model: buildEmbeddingModel(),
            inputs: [{ type: 'text', input: 'hello' }]
          });
        }
      },
      {
        errorCode: ModelErrEnum.embeddingEmptyInput as const,
        trigger: () =>
          getVectors({
            model: buildEmbeddingModel(),
            inputs: [{ type: 'text', input: '   ' }]
          })
      }
    ])(
      'translates $errorCode to exact target strings across all 4 locales',
      async ({ errorCode, trigger }) => {
        const err = await trigger().catch((e) => e);
        expect(getErrText(err)).toBe(ERROR_RESPONSE[errorCode].message);

        for (const locale of TARGET_LOCALES) {
          const payload = await renderApiError({ locale, error: err });
          expect(payload.code).toBe(ERROR_RESPONSE[errorCode].code);
          expect(payload.statusText).toBe(errorCode);
          expect(payload.message).toBe(expectedLocaleMessages[errorCode][locale]);
        }
      }
    );
  });

  describe('AbortSignal, model config error, and probeModelStatus integration', () => {
    it('keeps Mongo training task retryable on AbortSignal and terminates immediately on UserError(unExist)', async () => {
      const controller = new AbortController();
      controller.abort();
      const abortErr = await getVectors({
        model: buildEmbeddingModel(),
        inputs: [{ type: 'text', input: 'hello' }],
        signal: controller.signal
      }).catch((e) => e);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(abortErr).not.toBeInstanceOf(EmbeddingRequestError);
      expect(isNonRetryableModelError(abortErr)).toBe(false);

      const { dataId: abortDataId, task: abortTask } = await createTrainingPair();
      const abortLease = createTrainingTaskLease(abortTask);
      try {
        await abortLease.fail(abortErr);
      } finally {
        await abortLease.stop();
      }
      const savedAbortTask = await MongoDatasetTraining.findById(abortTask._id).lean();
      const savedAbortData = await MongoDatasetData.findById(abortDataId).lean();
      expect(savedAbortTask?.retryCount).toBe(2);
      expect(savedAbortData?.indexStatus).toBe(DatasetDataIndexStatusEnum.indexing);

      const { dataId: configDataId, task: configTask } = await createTrainingPair();
      const configLease = createTrainingTaskLease(configTask);
      try {
        await configLease.fail(new UserError(ModelErrEnum.unExist));
      } finally {
        await configLease.stop();
      }
      const savedConfigTask = await MongoDatasetTraining.findById(configTask._id).lean();
      const savedConfigData = await MongoDatasetData.findById(configDataId).lean();
      expect(savedConfigTask?.retryCount).toBe(0);
      expect(savedConfigData?.indexStatus).toBe(DatasetDataIndexStatusEnum.error);
    });

    it('records errorCode + HTTP status for embedding failures without leaking secrets and preserves Rerank 401 messages', async () => {
      fetchMock.mockImplementation(async () =>
        jsonResponse({
          status: 401,
          body: {
            error: { message: 'Incorrect API key provided: sk-xxx', code: 'invalid_api_key' }
          }
        })
      );

      const embeddingRecord = await probeModelStatus({
        model: buildEmbeddingModel(),
        test: testModelConnection
      });
      expect(embeddingRecord.status).toBe('red');
      expect(embeddingRecord.error).toBe('Embedding Integration Model: modelAuthFailed (HTTP 401)');
      expect(embeddingRecord.error).not.toContain('sk-xxx');
      expect(embeddingRecord.error).not.toContain('common:code_error');

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
      const rerankRecord = await probeModelStatus({
        model: rerankModel,
        test: async () => {
          throw new Error('Unauthorized: Invalid API key');
        }
      });
      expect(rerankRecord.status).toBe('red');
      expect(rerankRecord.error).toBe('Rerank Integration Model: Unauthorized: Invalid API key');
    });
  });
});

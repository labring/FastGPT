import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { TRAINING_LEASE_TIMEOUT_MS } from '@fastgpt/global/core/dataset/training/constant';
import type { EmbeddingModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { generatedLoaders } from '@fastgpt/web/i18n/resourceLoaders.generated';
import { createApiI18n } from '@fastgpt/service/common/i18n/request';
import type { NodeApiRequest, NodeApiResponse } from '@fastgpt/service/types/http';
import { EmbeddingRequestError } from '@fastgpt/service/core/ai/embedding/error';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { findAndLockTrainingTask } from '@fastgpt/service/core/dataset/training/entity';
import { createTrainingTaskLease } from '@fastgpt/service/core/dataset/training/service';
import { probeModelStatus } from '@fastgpt/service/core/ai/modelStatus/service';

vi.unmock('@fastgpt/service/core/ai/embedding');
vi.unmock('@fastgpt/service/core/ai/embedding/index');
vi.unmock('@fastgpt/service/common/response');

vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countPromptTokens: vi.fn(async (text: string) => text.length),
  countPromptTokensBatch: vi.fn(async (texts: string[]) => texts.map((text) => text.length))
}));

const { getVectors } = await import('@fastgpt/service/core/ai/embedding/index');
const { jsonRes } = await import('@fastgpt/service/common/response');

const withI18n = createApiI18n(generatedLoaders);

const model: EmbeddingModelDataType = {
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
};
const inputs = [{ type: 'text' as const, input: 'hello' }];

const rateLimitResponse = (retryAfter: string) =>
  Response.json(
    { error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' } },
    { status: 429, headers: { 'retry-after': retryAfter } }
  );

const authFailureResponse = () =>
  Response.json(
    { error: { message: 'Incorrect API key provided: sk-xxx', code: 'invalid_api_key' } },
    { status: 401 }
  );

const createIndexTrainingTask = async () => {
  const context = {
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId(),
    datasetId: new Types.ObjectId(),
    collectionId: new Types.ObjectId()
  };
  const data = await MongoDatasetData.create({
    ...context,
    q: 'sample chunk',
    a: '',
    indexes: [],
    indexStatus: DatasetDataIndexStatusEnum.indexing
  });
  return MongoDatasetTraining.create({
    ...context,
    dataId: data._id,
    billId: 'integration-bill',
    mode: TrainingModeEnum.index,
    retryCount: 3,
    lockTime: new Date()
  });
};

describe('Embedding error handling integration', () => {
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

  it('terminates index training and persists safe messages for a permanent image download failure', async () => {
    const signedUrl = 'https://internal-bucket.example/500/img.png?token=sig';
    fetchMock.mockImplementation(async () =>
      Response.json(
        {
          error: {
            message: `Failed to download images: 404, message='Not Found', url='${signedUrl}'`,
            type: 'upstream_error',
            code: 'BadRequest'
          }
        },
        { status: 400 }
      )
    );
    const error = await getVectors({ model, inputs }).catch((error: unknown) => error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(EmbeddingRequestError);
    expect(error).toMatchObject({
      retryable: false,
      errorCode: ModelErrEnum.imageDownloadFailed
    });

    const task = await createIndexTrainingTask();
    const lease = createTrainingTaskLease(task);
    try {
      await lease.fail(error);
    } finally {
      await lease.stop();
    }

    const safeMessage = ERROR_RESPONSE[ModelErrEnum.imageDownloadFailed].message;
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      retryCount: 0,
      expireAt: null,
      errorMsg: safeMessage
    });
    expect(await MongoDatasetData.findById(task.dataId).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.error,
      indexErrorMsg: safeMessage
    });
  });

  it('honors the final HTTP 429 Retry-After in the Mongo queue and caps the delay at 24h', async () => {
    const retryAfterSeconds = 10 * 24 * 60 * 60;
    fetchMock
      .mockImplementationOnce(async () => rateLimitResponse('0'))
      .mockImplementationOnce(async () => rateLimitResponse('0'))
      .mockImplementation(async () => rateLimitResponse(String(retryAfterSeconds)));

    const error = await getVectors({ model, inputs }).catch((error: unknown) => error);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(EmbeddingRequestError);
    expect(error).toMatchObject({
      retryable: true,
      retryAfterMs: retryAfterSeconds * 1000
    });

    const task = await createIndexTrainingTask();
    // 只固定应用时钟，Mongo 驱动与事务相关的定时器仍使用真实时间。
    vi.useFakeTimers({ toFake: ['Date'] });
    const nextClaimableAt = Date.now() + 24 * 60 * 60 * 1000;
    const lease = createTrainingTaskLease(task);
    try {
      await lease.fail(error);
    } finally {
      await lease.stop();
    }

    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      retryCount: 2,
      lockTime: new Date(nextClaimableAt - TRAINING_LEASE_TIMEOUT_MS),
      expireAt: new Date(nextClaimableAt),
      errorMsg: ERROR_RESPONSE[ModelErrEnum.rateLimited].message
    });
    expect(await MongoDatasetData.findById(task.dataId).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });

    const claimOptions = { mode: TrainingModeEnum.index, filter: { _id: task._id } };
    // 默认退避早已结束，此时仍不能在上游退避结束前领取任务。
    vi.setSystemTime(nextClaimableAt - 1);
    expect(await findAndLockTrainingTask(claimOptions)).toBeNull();
    vi.setSystemTime(nextClaimableAt);
    expect(await findAndLockTrainingTask(claimOptions)).toMatchObject({
      _id: task._id.toString(),
      retryCount: 2,
      lockTime: new Date(nextClaimableAt)
    });
  });

  it('keeps index training retryable when the embedding request is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await getVectors({ model, inputs, signal: controller.signal }).catch(
      (error: unknown) => error
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(EmbeddingRequestError);

    const task = await createIndexTrainingTask();
    const lease = createTrainingTaskLease(task);
    try {
      await lease.fail(error);
    } finally {
      await lease.stop();
    }

    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({ retryCount: 2 });
    expect(await MongoDatasetData.findById(task.dataId).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });
  });

  it.each([
    {
      errorCode: ModelErrEnum.authFailed,
      response: authFailureResponse,
      expectedHttpCalls: 1,
      messages: {
        'zh-CN': '模型接口鉴权失败，请检查 API Key 或渠道配置',
        en: 'Model API authentication failed. Please check the API key or channel configuration.',
        'zh-Hant': '模型介面驗證失敗，請檢查 API Key 或渠道設定',
        'ko-KR': '모델 API 인증에 실패했습니다. API 키 또는 채널 설정을 확인해 주세요.'
      }
    },
    {
      errorCode: ModelErrEnum.upstreamQuotaExceeded,
      response: () =>
        Response.json(
          {
            error: { message: 'You exceeded your current quota', code: 'insufficient_quota' }
          },
          { status: 429 }
        ),
      expectedHttpCalls: 1,
      messages: {
        'zh-CN': '上游模型服务额度不足或账户欠费，请检查模型渠道余额',
        en: 'Upstream model service quota or balance is insufficient. Please check the model channel account.',
        'zh-Hant': '上游模型服務額度不足或帳戶欠費，請檢查模型渠道餘額',
        'ko-KR': '상위 모델 서비스 할당량 또는 잔액이 부족합니다. 모델 채널 계정을 확인해 주세요.'
      }
    },
    {
      errorCode: ModelErrEnum.serviceUnavailable,
      response: () =>
        new Response('<html>503 Service Temporarily Unavailable</html>', {
          status: 503,
          headers: { 'content-type': 'text/html' }
        }),
      expectedHttpCalls: 3,
      messages: {
        'zh-CN': '模型服务暂时不可用，请稍后重试',
        en: 'Model service is temporarily unavailable. Please try again later.',
        'zh-Hant': '模型服務暫時不可用，請稍後重試',
        'ko-KR': '모델 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'
      }
    },
    {
      errorCode: ModelErrEnum.embeddingEmptyInput,
      response: undefined,
      expectedHttpCalls: 0,
      messages: {
        'zh-CN': '向量化输入内容为空，请检查数据内容',
        en: 'Embedding input content is empty. Please check the data.',
        'zh-Hant': '向量化輸入內容為空，請檢查資料內容',
        'ko-KR': '임베딩 입력 내용이 비어 있습니다. 데이터를 확인해 주세요.'
      }
    }
  ])(
    'renders the exact JSON message for $errorCode in each locale',
    async ({ errorCode, response, expectedHttpCalls, messages }) => {
      if (response) {
        fetchMock.mockImplementation(async () => response());
      }
      const error = await getVectors({
        model,
        inputs: response ? inputs : [{ type: 'text', input: '   ' }]
      }).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(EmbeddingRequestError);
      expect(fetchMock).toHaveBeenCalledTimes(expectedHttpCalls);

      for (const [locale, message] of Object.entries(messages)) {
        const req = { headers: { 'x-fastgpt-language': locale } } as NodeApiRequest;
        const json = vi.fn();
        const res = { status: vi.fn().mockReturnThis(), json } as unknown as NodeApiResponse;
        await withI18n({ req, res }, () => jsonRes(res, { error }));
        expect(json).toHaveBeenCalledWith(
          expect.objectContaining({
            code: ERROR_RESPONSE[errorCode].code,
            statusText: errorCode,
            message
          })
        );
      }
    }
  );

  it('records the code and upstream status from a real embedding probe without exposing the API key', async () => {
    fetchMock.mockImplementation(async () => authFailureResponse());

    const record = await probeModelStatus({ model });
    expect(record).toMatchObject({
      status: 'red',
      error: 'Embedding Integration Model: modelAuthFailed (HTTP 401)'
    });
  });
});

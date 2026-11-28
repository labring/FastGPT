import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { EmbeddingModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { generatedLoaders } from '@fastgpt/web/i18n/resourceLoaders.generated';
import { createApiI18n } from '@fastgpt/service/common/i18n/request';
import type { NodeApiRequest, NodeApiResponse } from '@fastgpt/service/types/http';
import { EmbeddingRequestError } from '@fastgpt/service/core/ai/embedding/error';
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

const authFailureResponse = () =>
  Response.json(
    { error: { message: 'Incorrect API key provided: sk-xxx', code: 'invalid_api_key' } },
    { status: 401 }
  );

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

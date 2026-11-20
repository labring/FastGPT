import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { z } from 'zod';
import type { NodeApiRequest, NodeApiResponse } from '@fastgpt/service/types/http';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { UserConfigError } from '@fastgpt/global/common/error/utils';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ApiHttpError } from '@fastgpt/service/common/http/apiError';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { createModelHandle } from '@fastgpt/service/core/ai/model/catalog/handle';
import { validateEvaluationFile } from '@fastgpt/service/core/app/evaluation/utils';

const tracingMocks = vi.hoisted(() => ({
  setSpanError: vi.fn()
}));

vi.mock('@fastgpt/service/common/tracing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/tracing')>();
  return {
    ...actual,
    setSpanError: (...args: Parameters<typeof actual.setSpanError>) => {
      tracingMocks.setSpanError(...args);
      return actual.setSpanError(...args);
    }
  };
});

// 必须运行真实入口和 JSON 响应，才能验证 end/finish/close 之间的边界。
vi.unmock('@fastgpt/service/common/http/entry');
vi.unmock('@fastgpt/service/common/response');
vi.unmock('@fastgpt/service/common/logger');

import { createApiEntry, redactRequestUrl } from '@fastgpt/service/common/http/entry';
import { isProfiling, profileStage } from '@fastgpt/service/common/profiling';
import { REQUEST_PROFILE_HEADER } from '@fastgpt/service/common/http/requestProfile';
import { createApiI18n } from '@fastgpt/service/common/i18n/request';
import { generatedLoaders } from '@fastgpt/web/i18n/resourceLoaders.generated';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { jsonRes } from '@fastgpt/service/common/response';

describe('redactRequestUrl', () => {
  it('redacts every declared query value while preserving non-sensitive parameters', () => {
    const secretTicket = 'secret-download-ticket';
    const url = `/api/core/dataset/collection/batchDownload?ticket=${secretTicket}&source=web&ticket=second-secret`;

    const redactedUrl = redactRequestUrl(url, ['ticket']);

    expect(redactedUrl).not.toContain(secretTicket);
    expect(redactedUrl).not.toContain('second-secret');
    expect(redactedUrl).toContain('ticket=REDACTED');
    expect(redactedUrl).toContain('source=web');
  });

  it('returns URLs unchanged when no sensitive query value is present', () => {
    expect(redactRequestUrl('/api/health?source=web', ['ticket'])).toBe('/api/health?source=web');
  });
});

describe('createApiEntry response lifecycle', () => {
  const requestI18n = createApiI18n(generatedLoaders);

  /** 不绑定 socket，让真实 ServerResponse 保持 end 已调用但 finish 尚未发生的状态。 */
  const createHttpObjects = () => {
    const req: NodeApiRequest = Object.assign(new IncomingMessage(new Socket()), {
      method: 'GET',
      url: '/api/test',
      query: {},
      body: undefined
    });
    const res: NodeApiResponse = Object.assign(new ServerResponse(req), {
      status: (status: number): NodeApiResponse => {
        res.statusCode = status;
        return res;
      },
      json: vi.fn((data: unknown) => res.end(JSON.stringify(data)))
    });
    onTestFinished(() => {
      res.destroy();
      req.socket.destroy();
    });
    return { req, res };
  };

  it('keeps the default JSON envelope for handlers returning business data', async () => {
    const { req, res } = createHttpObjects();

    await createApiEntry({ requestI18n })(async () => ({ value: 1 }))(req, res);

    expect(res.json).toHaveBeenCalledWith({
      code: 200,
      statusText: '',
      message: '',
      data: { value: 1 }
    });
  });

  it.each(['beforeCallback', 'handler', 'explicitResponse'])(
    'localizes the complete request pipeline, including %s',
    async (source) => {
      const { req, res } = createHttpObjects();
      req.headers['x-fastgpt-language'] = 'zh-CN';
      const handler = createApiEntry({
        requestI18n: createApiI18n(generatedLoaders),
        beforeCallback: [
          async () => {
            if (source === 'beforeCallback') throw ERROR_ENUM.unAuthorization;
          }
        ]
      })(async () => {
        if (source === 'explicitResponse')
          return jsonRes(res, { error: ERROR_ENUM.unAuthorization });
        throw ERROR_ENUM.unAuthorization;
      });
      await handler(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.json).toHaveBeenCalledOnce();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: '凭证错误', code: 401 })
      );
    }
  );

  it.each([undefined, '1'])(
    '请求入口按 header 创建上下文，覆盖前置中间件和异步业务：%s',
    async (header) => {
      const { req, res } = createHttpObjects();
      req.headers[REQUEST_PROFILE_HEADER] = header;
      const active = header === '1';
      const handler = createApiEntry({
        requestI18n,
        beforeCallback: [
          async () => {
            expect(isProfiling()).toBe(active);
          }
        ]
      })(async () => {
        expect(isProfiling()).toBe(active);
        await profileStage({ event: 'tools.authorize', params: { toolCount: 2 } }, async () => {
          await Promise.resolve();
          expect(isProfiling()).toBe(active);
        });
        return { value: 1 };
      });
      await handler(req, res);
      expect(isProfiling()).toBe(false);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { value: 1 } }));
    }
  );

  it('stops later handlers and JSON fallback after end without waiting for finish', async () => {
    const { req, res } = createHttpObjects();
    const nextHandler = vi.fn();

    await createApiEntry({ requestI18n })(async () => {
      res.end('success');
      expect(res.writableFinished).toBe(false);
    }, nextHandler)(req, res);

    expect(nextHandler).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('does not call the handler after a beforeCallback destroys the response', async () => {
    const { req, res } = createHttpObjects();
    const handler = vi.fn();

    await createApiEntry({
      requestI18n,
      beforeCallback: [async () => res.destroy()]
    })(handler)(req, res);

    expect(handler).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('does not append JSON after a handler destroys the response', async () => {
    const { req, res } = createHttpObjects();

    await createApiEntry({ requestI18n })(async () => res.destroy())(req, res);

    expect(res.json).not.toHaveBeenCalled();
  });

  it('does not append default JSON to a started raw response without Content-Type', async () => {
    const { req, res } = createHttpObjects();

    await createApiEntry({ requestI18n })(async () => res.write('partial'))(req, res);

    expect(res.headersSent).toBe(true);
    expect(res.json).not.toHaveBeenCalled();
  });

  it.each([
    { error: new Error('Handler failed'), status: 500 },
    {
      error: Object.assign(new Error('Internal failure'), {
        name: 'ApiHttpError',
        statusCode: 409
      }),
      status: 500
    },
    { error: new UserConfigError('Invalid API key'), status: 400 },
    { error: new ApiHttpError(409, 'Revision conflict'), status: 409 }
  ])('returns the response mapper status before streaming: $status', async ({ error, status }) => {
    const { req, res } = createHttpObjects();

    await createApiEntry({ requestI18n })(async () => {
      throw error;
    })(req, res);

    expect(res.statusCode).toBe(status);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: error.message }));
  });

  it.each([
    ['en', 'Evaluation file validation failed'],
    ['zh-CN', '评测文件校验失败']
  ])(
    'keeps the evaluation error identifier stable while localizing to %s',
    async (locale, message) => {
      const { req, res } = createHttpObjects();
      req.headers['x-fastgpt-language'] = locale;

      await createApiEntry({ requestI18n })(async () => validateEvaluationFile('invalid'))(
        req,
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 502008,
          statusText: AppErrEnum.invalidEvaluationFile,
          message
        })
      );
    }
  );

  it('preserves the 400 response for invalid API input before response streaming', async () => {
    const { req, res } = createHttpObjects();

    await createApiEntry({ requestI18n })(async () => {
      parseApiInput({ req, bodySchema: z.object({ value: z.string() }) });
    })(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 400, message: 'Data validation error' })
    );
  });

  it('preserves the 500 response for internal validation failures before response streaming', async () => {
    const { req, res } = createHttpObjects();

    await createApiEntry({ requestI18n })(async () => z.string().parse(undefined))(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.json).toHaveBeenCalledOnce();
  });

  it('preserves 501 for an unsupported channel model catalog', async () => {
    const { req, res } = createHttpObjects();

    await createApiEntry({ requestI18n })(async () => {
      throw ModelErrEnum.channelCatalogUnsupported;
    })(req, res);

    expect(res.statusCode).toBe(501);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 513028, statusText: ModelErrEnum.channelCatalogUnsupported })
    );
  });

  it.each([
    [ModelErrEnum.channelNameConflict, 513009],
    [ModelErrEnum.noAvailableChannel, 513010],
    [ModelErrEnum.teamModelDisabled, 513011]
  ])('preserves the error code for %s', async (statusText, code) => {
    const { req, res } = createHttpObjects();
    await createApiEntry({ requestI18n })(async () => {
      throw statusText;
    })(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code, statusText }));
  });

  it('keeps request validation at 400 across separately loaded module instances', async () => {
    vi.resetModules();
    const reloaded = await import('../../../common/zod/requestParseError');
    const { req, res } = createHttpObjects();

    await createApiEntry({ requestI18n })(async () => {
      reloaded.parseApiInput({ req, bodySchema: z.object({ value: z.string() }) });
    })(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 400 }));
  });

  it('keeps explicit HTTP errors at their declared status across module instances', async () => {
    vi.resetModules();
    const reloaded = await import('../../../common/http/apiError');
    const { req, res } = createHttpObjects();
    const error = new reloaded.ApiHttpError(409, 'Revision conflict');
    expect(error).not.toBeInstanceOf(ApiHttpError);

    await createApiEntry({ requestI18n })(async () => {
      throw error;
    })(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 409 }));
  });

  it.each([
    { error: ERROR_ENUM.unAuthApiKey, status: 401, code: 514 },
    { error: TeamErrEnum.aiPointsNotEnough, status: 402, code: 500005 },
    { error: AppErrEnum.unAuthApp, status: 403, code: 502001 },
    { error: AppErrEnum.unExist, status: 404, code: 502000 },
    { error: SandboxErrEnum.runtimeUpgradeFailed, status: 500, code: 510002 }
  ])(
    'maps domain business error $error to HTTP $status while preserving business code $code',
    async ({ error, status, code }) => {
      const { req, res } = createHttpObjects();

      await createApiEntry({ requestI18n })(async () => {
        throw error;
      })(req, res);

      expect(res.statusCode).toBe(status);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code,
          statusText: error
        })
      );
    }
  );

  it('distinguishes missing server default model (500 + span error) from empty request model ref (400)', async () => {
    const emptyHandle = createModelHandle({
      models: [],
      defaultModels: {},
      configuredDefaultModelIds: {},
      revision: 0,
      version: 'empty'
    });

    tracingMocks.setSpanError.mockClear();
    const serverMissing = createHttpObjects();
    await createApiEntry({ requestI18n })(async () => {
      emptyHandle.getDefaultModelData(ModelTypeEnum.llm);
    })(serverMissing.req, serverMissing.res);

    expect(serverMissing.res.statusCode).toBe(500);
    expect(serverMissing.res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 513001,
        statusText: ModelErrEnum.unConfigured
      })
    );
    expect(tracingMocks.setSpanError).toHaveBeenCalledTimes(1);

    tracingMocks.setSpanError.mockClear();
    const requestMissing = createHttpObjects();
    await createApiEntry({ requestI18n })(async () => {
      emptyHandle.getModelData({ modelId: '' }, { type: ModelTypeEnum.llm });
    })(requestMissing.req, requestMissing.res);

    expect(requestMissing.res.statusCode).toBe(400);
    expect(requestMissing.res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 513001,
        statusText: ModelErrEnum.unConfigured
      })
    );
    expect(tracingMocks.setSpanError).not.toHaveBeenCalled();
  });

  it('distinguishes disabled server default model (500 + span error) from explicit disabled model lookup (404)', async () => {
    const disabledDefault: LLMModelDataType = {
      modelId: '68ee0bd23d17260b7829b137',
      type: ModelTypeEnum.llm,
      scope: ModelScopeEnum.system,
      provider: 'OpenAI',
      model: 'default-llm',
      name: 'Default LLM',
      isActive: false,
      config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000, vision: false }
    };
    const handle = createModelHandle({
      models: [disabledDefault],
      defaultModels: { llm: disabledDefault },
      configuredDefaultModelIds: { llm: disabledDefault.modelId },
      revision: 1,
      version: 'disabled-default'
    });

    tracingMocks.setSpanError.mockClear();
    const defaultCall = createHttpObjects();
    await createApiEntry({ requestI18n })(async () => {
      handle.getDefaultModelData(ModelTypeEnum.llm, {
        authorizedIds: new Set([disabledDefault.modelId])
      });
    })(defaultCall.req, defaultCall.res);

    expect(defaultCall.res.statusCode).toBe(500);
    expect(defaultCall.res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 513000,
        statusText: ModelErrEnum.unExist,
        message: 'Model is disabled: Default LLM'
      })
    );
    expect(tracingMocks.setSpanError).toHaveBeenCalledTimes(1);

    tracingMocks.setSpanError.mockClear();
    const explicitCall = createHttpObjects();
    await createApiEntry({ requestI18n })(async () => {
      handle.getModelData({ modelId: disabledDefault.modelId }, { type: ModelTypeEnum.llm });
    })(explicitCall.req, explicitCall.res);

    expect(explicitCall.res.statusCode).toBe(404);
    expect(explicitCall.res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 513000,
        statusText: ModelErrEnum.unExist,
        message: 'Model is disabled: Default LLM'
      })
    );
    expect(tracingMocks.setSpanError).not.toHaveBeenCalled();
  });

  it('returns HTTP 503 and marks span error when instance externalChunkNotConfigured is thrown', async () => {
    tracingMocks.setSpanError.mockClear();
    const { req, res } = createHttpObjects();

    await createApiEntry({ requestI18n })(async () => {
      throw DatasetErrEnum.externalChunkNotConfigured;
    })(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 501015,
        statusText: DatasetErrEnum.externalChunkNotConfigured
      })
    );
    expect(tracingMocks.setSpanError).toHaveBeenCalledTimes(1);
  });

  it('destroys a partial response instead of appending a JSON error', async () => {
    const { req, res } = createHttpObjects();

    await createApiEntry({ requestI18n })(async () => {
      res.write('partial');
      throw new Error('Stream failed');
    })(req, res);

    expect(res.destroyed).toBe(true);
    expect(res.json).not.toHaveBeenCalled();
  });

  it.each(['ended', 'destroyed'] as const)(
    'does not append an error to an already %s response',
    async (state) => {
      const { req, res } = createHttpObjects();

      await createApiEntry({ requestI18n })(async () => {
        if (state === 'ended') res.end('success');
        else res.destroy();
        throw new Error('Response already closed');
      })(req, res);

      expect(res.json).not.toHaveBeenCalled();
    }
  );
});

import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { z } from 'zod';
import type { NodeApiRequest, NodeApiResponse } from '@fastgpt/service/types/http';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { UserConfigError } from '@fastgpt/global/common/error/utils';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { validateEvaluationFile } from '@fastgpt/service/core/app/evaluation/utils';

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
    { error: new UserConfigError('Invalid API key'), status: 400 }
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

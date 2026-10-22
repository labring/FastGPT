import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { z } from 'zod';
import type { NodeApiRequest, NodeApiResponse } from '@fastgpt/service/types/http';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

// 必须运行真实入口和 JSON 响应，才能验证 end/finish/close 之间的边界。
vi.unmock('@fastgpt/service/common/http/entry');
vi.unmock('@fastgpt/service/common/response');
vi.unmock('@fastgpt/service/common/logger');

import { createApiEntry, redactRequestUrl } from '@fastgpt/service/common/http/entry';

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

    await createApiEntry({})(async () => ({ value: 1 }))(req, res);

    expect(res.json).toHaveBeenCalledWith({
      code: 200,
      statusText: '',
      message: '',
      data: { value: 1 }
    });
  });

  it('stops later handlers and JSON fallback after end without waiting for finish', async () => {
    const { req, res } = createHttpObjects();
    const nextHandler = vi.fn();

    await createApiEntry({})(async () => {
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
      beforeCallback: [async () => res.destroy()]
    })(handler)(req, res);

    expect(handler).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('does not append JSON after a handler destroys the response', async () => {
    const { req, res } = createHttpObjects();

    await createApiEntry({})(async () => res.destroy())(req, res);

    expect(res.json).not.toHaveBeenCalled();
  });

  it('does not append default JSON to a started raw response without Content-Type', async () => {
    const { req, res } = createHttpObjects();

    await createApiEntry({})(async () => res.write('partial'))(req, res);

    expect(res.headersSent).toBe(true);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns JSON errors when no response has started', async () => {
    const { req, res } = createHttpObjects();

    await createApiEntry({})(async () => {
      throw new Error('Handler failed');
    })(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Handler failed' }));
  });

  it('preserves the 400 response for invalid API input before response streaming', async () => {
    const { req, res } = createHttpObjects();

    await createApiEntry({})(async () => {
      parseApiInput({ req, bodySchema: z.object({ value: z.string() }) });
    })(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 400, message: 'Data validation error' })
    );
  });

  it('preserves the 500 response for internal validation failures before response streaming', async () => {
    const { req, res } = createHttpObjects();

    await createApiEntry({})(async () => z.string().parse(undefined))(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.json).toHaveBeenCalledOnce();
  });

  it('destroys a partial response instead of appending a JSON error', async () => {
    const { req, res } = createHttpObjects();

    await createApiEntry({})(async () => {
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

      await createApiEntry({})(async () => {
        if (state === 'ended') res.end('success');
        else res.destroy();
        throw new Error('Response already closed');
      })(req, res);

      expect(res.json).not.toHaveBeenCalled();
    }
  );
});

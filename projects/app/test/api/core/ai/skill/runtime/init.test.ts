import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { NodeApiRequest, NodeApiResponse } from '@fastgpt/service/types/http';

// 运行真实 NextAPI 及响应出口，验证 SSE 结束后不会被补写统一 JSON。
vi.unmock('@fastgpt/service/common/http/entry');
vi.unmock('@fastgpt/service/common/response');
vi.unmock('@fastgpt/service/common/logger');

import handler from '@/pages/api/core/ai/skill/runtime/init';

describe('Skill runtime init NextAPI entry', () => {
  it.each([
    ['zh-CN', '无效的技能 ID'],
    ['en', 'Invalid skill ID']
  ])('preserves the localized SSE error and ends the response in %s', async (locale, message) => {
    const req: NodeApiRequest = Object.assign(new IncomingMessage(new Socket()), {
      method: 'POST',
      url: '/api/core/ai/skill/runtime/init',
      body: { skillId: 'invalid' },
      query: {}
    });
    req.headers['x-fastgpt-language'] = locale;
    const res: NodeApiResponse = Object.assign(new ServerResponse(req), {
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json: vi.fn((body: unknown) => res.end(JSON.stringify(body))),
      write: vi.fn(() => true)
    });
    onTestFinished(() => {
      res.destroy();
      req.socket.destroy();
    });

    await handler(req as any, res as any);

    expect(res.getHeader('x-request-id')).toEqual(expect.any(String));
    expect(res.getHeader('Content-Type')).toBe('text/event-stream');
    expect(res.statusCode).toBe(200);
    expect(res.writableEnded).toBe(true);
    expect(res.json).not.toHaveBeenCalled();
    const output = vi
      .mocked(res.write)
      .mock.calls.map(([chunk]) => chunk)
      .join('');
    expect(output).toContain('event: error\n');
    expect(JSON.parse(output.split('data: ')[1].trim())).toMatchObject({
      code: 509011,
      statusText: 'invalidSkillId',
      message
    });
  });

  it('keeps the original 405 response and writes it once for unsupported methods', async () => {
    const req: NodeApiRequest = Object.assign(new IncomingMessage(new Socket()), {
      method: 'PUT',
      url: '/api/core/ai/skill/runtime/init',
      body: {},
      query: {}
    });
    const res: NodeApiResponse = Object.assign(new ServerResponse(req), {
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json: vi.fn((body: unknown) => res.end(JSON.stringify(body)))
    });
    onTestFinished(() => {
      res.destroy();
      req.socket.destroy();
    });

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(405);
    expect(res.json).toHaveBeenCalledExactlyOnceWith({ error: 'Method not allowed' });
  });
});

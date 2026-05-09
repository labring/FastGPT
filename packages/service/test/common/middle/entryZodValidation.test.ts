import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { jsonRes } from '@fastgpt/service/common/response';

const { mockWithNextCors, mockReportHttpZodValidationError } = vi.hoisted(() => ({
  mockWithNextCors: vi.fn(),
  mockReportHttpZodValidationError: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn()
  }),
  withContext: async (_context: Record<string, unknown>, callback: () => Promise<unknown>) =>
    callback(),
  LogCategories: {
    HTTP: {
      REQUEST: ['http', 'request'],
      RESPONSE: ['http', 'response'],
      ERROR: ['http', 'error']
    }
  }
}));

vi.mock('@fastgpt/service/common/middle/cors', () => ({
  withNextCors: mockWithNextCors
}));

vi.mock('@fastgpt/service/common/middle/zodValidationReporter', () => ({
  reportHttpZodValidationError: mockReportHttpZodValidationError
}));

const createReq = () =>
  ({
    method: 'POST',
    url: '/api/test',
    body: {
      name: 123
    },
    query: {},
    headers: {
      'user-agent': 'vitest'
    },
    socket: {
      remoteAddress: '127.0.0.1'
    }
  }) as any;

const createRes = () => {
  const res = new EventEmitter() as any;
  res.setHeader = vi.fn();
  res.getHeader = vi.fn();
  res.once = res.once.bind(res);
  res.writableFinished = false;
  res.statusCode = 200;
  return res;
};

describe('NextEntry zod validation handling', () => {
  it('should report zod validation errors and return 400 response', async () => {
    const { NextEntry } = await vi.importActual<
      typeof import('@fastgpt/service/common/middle/entry')
    >('@fastgpt/service/common/middle/entry');
    const schema = z.object({
      name: z.string()
    });
    const handler = vi.fn(() => schema.parse({ name: 123 }));
    const api = NextEntry({})(handler);
    const req = createReq();
    const res = createRes();

    await api(req, res);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(mockReportHttpZodValidationError).toHaveBeenCalledTimes(1);
    expect(mockReportHttpZodValidationError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(z.ZodError),
        req,
        request: {
          requestId: expect.any(String),
          method: 'POST',
          url: '/api/test',
          route: '/api/test',
          ip: '127.0.0.1',
          userAgent: 'vitest'
        }
      })
    );
    expect(jsonRes).toHaveBeenCalledWith(res, {
      code: 400,
      message: 'Data validation error',
      error: expect.any(z.ZodError),
      url: '/api/test'
    });
  });
});

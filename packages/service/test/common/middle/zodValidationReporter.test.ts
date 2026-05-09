import { describe, expect, it, vi } from 'vitest';
import { SpanStatusCode } from '@opentelemetry/api';
import { z } from 'zod';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

const { mockLoggerError } = vi.hoisted(() => ({
  mockLoggerError: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({
    error: mockLoggerError
  }),
  LogCategories: {
    HTTP: {
      ERROR: ['http', 'error']
    }
  }
}));

describe('zodValidationReporter', () => {
  it('should normalize zod issues and only include top-level input keys', async () => {
    const { normalizeZodIssues, getRequestInputSummary, reportHttpZodValidationError } =
      await import('@fastgpt/service/common/middle/zodValidationReporter');

    const schema = z.object({
      name: z.string(),
      apps: z.array(
        z.object({
          id: z.string()
        })
      )
    });
    const result = schema.safeParse({
      name: 123,
      apps: [{ id: 456 }],
      token: 'secret-token'
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    const issues = normalizeZodIssues(result.error);
    expect(issues).toEqual([
      expect.objectContaining({
        path: 'name',
        code: 'invalid_type',
        expected: 'string'
      }),
      expect.objectContaining({
        path: 'apps.0.id',
        code: 'invalid_type',
        expected: 'string'
      })
    ]);

    const req = {
      body: {
        name: 123,
        apps: [{ id: 456 }],
        token: 'secret-token'
      },
      query: {
        appId: 'app-1'
      },
      headers: {
        'user-agent': 'vitest'
      }
    } as unknown as ApiRequestProps;

    expect(getRequestInputSummary(req)).toEqual({
      body: {
        topLevelKeys: ['name', 'apps', 'token']
      },
      query: {
        topLevelKeys: ['appId']
      }
    });

    const span = {
      setAttribute: vi.fn(),
      setStatus: vi.fn()
    };

    reportHttpZodValidationError({
      error: result.error,
      req,
      span,
      request: {
        requestId: 'request-1',
        method: 'POST',
        url: '/api/test?debug=1',
        route: '/api/test',
        ip: '127.0.0.1',
        userAgent: 'vitest'
      }
    });

    expect(span.setAttribute).toHaveBeenCalledWith('http.response.status_code', 400);
    expect(span.setAttribute).toHaveBeenCalledWith('error.type', 'ZodError');
    expect(span.setAttribute).toHaveBeenCalledWith('validation.error', true);
    expect(span.setAttribute).toHaveBeenCalledWith('validation.issue_count', 2);
    expect(span.setAttribute).toHaveBeenCalledWith('validation.paths', 'name,apps.0.id');
    expect(span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'Data validation error'
    });

    expect(mockLoggerError).toHaveBeenCalledWith(
      'HTTP Zod validation error',
      expect.objectContaining({
        event: 'http.zod_validation_error',
        requestId: 'request-1',
        method: 'POST',
        url: '/api/test?debug=1',
        route: '/api/test',
        issueCount: 2,
        paths: ['name', 'apps.0.id'],
        inputSummary: {
          body: {
            topLevelKeys: ['name', 'apps', 'token']
          },
          query: {
            topLevelKeys: ['appId']
          }
        }
      })
    );

    const logPayload = mockLoggerError.mock.calls[0][1];
    expect(JSON.stringify(logPayload)).not.toContain('secret-token');
    expect(JSON.stringify(logPayload)).not.toContain('"valueTypes"');
  });
});

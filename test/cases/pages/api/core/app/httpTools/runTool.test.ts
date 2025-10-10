import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import type {
  RunHTTPToolBody,
  RunHTTPToolQuery,
  RunHTTPToolResponse
} from '@/pages/api/core/app/httpTools/runTool';
import { handler } from '@/pages/api/core/app/httpTools/runTool';

// Mock runHTTPTool
vi.mock('@fastgpt/service/core/app/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/app/http')>();
  return {
    ...actual,
    runHTTPTool: vi.fn()
  };
});

import { runHTTPTool } from '@fastgpt/service/core/app/http';

describe('handler', () => {
  const baseUrl = 'https://api.example.com';
  const toolPath = '/v1/resource';
  const method = 'POST';
  const params = { foo: 'bar', baz: 123 };
  const customHeaders = { Authorization: 'Bearer token', 'X-Test': 'true' };
  const headerSecret = { key: 'secret-key', value: 'secret-value' };
  const staticParams = { static1: 'value1', static2: 2 };
  const staticHeaders = { 'X-Static': 'static-header' };
  const staticBody = { bodyField: 'bodyValue' };

  let req: ApiRequestProps<RunHTTPToolBody, RunHTTPToolQuery>;
  let res: ApiResponseType<RunHTTPToolResponse>;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      body: {
        params,
        baseUrl,
        toolPath,
        method,
        customHeaders,
        headerSecret,
        staticParams,
        staticHeaders,
        staticBody
      },
      query: {}
    };

    // res is not used in handler, but must be present
    res = {} as ApiResponseType<RunHTTPToolResponse>;
  });

  it('should call runHTTPTool with all provided fields and return its result', async () => {
    const expectedResult: RunHTTPToolResponse = {
      success: true,
      data: { result: 'ok' }
    } as RunHTTPToolResponse;
    vi.mocked(runHTTPTool).mockResolvedValue(expectedResult);

    const result = await handler(req, res);

    expect(runHTTPTool).toHaveBeenCalledWith({
      baseUrl,
      toolPath,
      method,
      params,
      headerSecret,
      customHeaders,
      staticParams,
      staticHeaders,
      staticBody
    });
    expect(result).toBe(expectedResult);
  });

  it('should default method to POST if not provided', async () => {
    req.body.method = undefined as any;
    const expectedResult: RunHTTPToolResponse = { success: true, data: {} } as RunHTTPToolResponse;
    vi.mocked(runHTTPTool).mockResolvedValue(expectedResult);

    await handler(req, res);

    expect(runHTTPTool).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST'
      })
    );
  });

  it('should handle missing optional fields', async () => {
    req.body.customHeaders = undefined;
    req.body.headerSecret = undefined;
    req.body.staticParams = undefined;
    req.body.staticHeaders = undefined;
    req.body.staticBody = undefined;

    const expectedResult: RunHTTPToolResponse = { success: true, data: {} } as RunHTTPToolResponse;
    vi.mocked(runHTTPTool).mockResolvedValue(expectedResult);

    await handler(req, res);

    expect(runHTTPTool).toHaveBeenCalledWith({
      baseUrl,
      toolPath,
      method,
      params,
      headerSecret: undefined,
      customHeaders: undefined,
      staticParams: undefined,
      staticHeaders: undefined,
      staticBody: undefined
    });
  });

  it('should pass through all values correctly', async () => {
    const expectedResult: RunHTTPToolResponse = {
      success: true,
      data: { echo: true }
    } as RunHTTPToolResponse;
    vi.mocked(runHTTPTool).mockResolvedValue(expectedResult);

    const result = await handler(req, res);

    expect(result).toEqual(expectedResult);
  });

  it('should propagate errors from runHTTPTool', async () => {
    const error = new Error('runHTTPTool failed');
    vi.mocked(runHTTPTool).mockRejectedValue(error);

    await expect(handler(req, res)).rejects.toThrow('runHTTPTool failed');
  });
});

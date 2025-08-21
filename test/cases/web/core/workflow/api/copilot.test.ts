import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testCode } from '@/web/core/workflow/api/copilot';
import type { TestCodeParams, TestCodeResponse } from '@/pages/api/core/workflow/copilot/testCode';

// Mock the POST method from '@/web/common/api/request'
vi.mock('@/web/common/api/request', () => ({
  POST: vi.fn()
}));

// Use import.meta.glob to resolve alias for vitest
let mockedPOST: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  // Dynamically import POST after mocking
  // This avoids require error with alias
  const mod = await import('@/web/common/api/request');
  mockedPOST = vi.mocked(mod.POST);
  vi.clearAllMocks();
});

describe('testCode', () => {
  const params: TestCodeParams = {
    code: 'console.log("hello");',
    language: 'javascript'
    // Add other fields if TestCodeParams requires more
  };

  const response: TestCodeResponse = {
    success: true,
    output: 'hello'
    // Add other fields if TestCodeResponse requires more
  };

  it('should call POST with correct url and params', async () => {
    mockedPOST.mockResolvedValueOnce(response);

    const result = await testCode(params);

    expect(mockedPOST).toHaveBeenCalledWith('/core/workflow/copilot/testCode', params);
    expect(result).toBe(response);
  });

  it('should propagate errors from POST', async () => {
    const error = new Error('Network error');
    mockedPOST.mockRejectedValueOnce(error);

    await expect(testCode(params)).rejects.toThrow('Network error');
    expect(mockedPOST).toHaveBeenCalledWith('/core/workflow/copilot/testCode', params);
  });

  it('should handle empty params object', async () => {
    // @ts-expect-error purposely test missing fields
    mockedPOST.mockResolvedValueOnce(response);
    // @ts-expect-error purposely test missing fields
    await expect(testCode({})).resolves.toBe(response);
    // @ts-expect-error purposely test missing fields
    expect(mockedPOST).toHaveBeenCalledWith('/core/workflow/copilot/testCode', {});
  });
});

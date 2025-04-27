import { describe, it, expect, vi } from 'vitest';
import { postFetchWorkflow } from '@/web/support/marketing/api';
import { POST } from '@/web/common/api/request';

vi.mock('@/web/common/api/request', () => ({
  POST: vi.fn()
}));

describe('marketing api', () => {
  it('should call POST with correct params', async () => {
    const mockData = {
      workflowId: 'test-id',
      variables: {
        foo: 'bar'
      }
    };

    await postFetchWorkflow(mockData);

    expect(POST).toHaveBeenCalledWith('/support/marketing/fetchWorkflow', mockData);
  });

  it('should return response from POST', async () => {
    const mockResponse = {
      success: true,
      data: {
        id: 'test-id',
        result: 'test result'
      }
    };

    vi.mocked(POST).mockResolvedValueOnce(mockResponse);

    const result = await postFetchWorkflow({
      workflowId: 'test-id',
      variables: {}
    });

    expect(result).toEqual(mockResponse);
  });

  it('should handle POST error', async () => {
    const mockError = new Error('Network error');
    vi.mocked(POST).mockRejectedValueOnce(mockError);

    await expect(
      postFetchWorkflow({
        workflowId: 'test-id',
        variables: {}
      })
    ).rejects.toThrow('Network error');
  });
});

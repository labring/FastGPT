import { describe, expect, it, vi } from 'vitest';
import { requestStopAndAbortClient } from '@/components/core/chat/ChatContainer/ChatBox/utils/stop';

describe('requestStopAndAbortClient', () => {
  it('aborts the client request after the stop signal is confirmed', async () => {
    const callOrder: string[] = [];
    const requestStop = vi.fn(async () => {
      callOrder.push('request-stop');
    });
    const abortClientRequest = vi.fn(() => {
      callOrder.push('abort-client');
    });

    await requestStopAndAbortClient({ requestStop, abortClientRequest });

    expect(callOrder).toEqual(['request-stop', 'abort-client']);
  });

  it('keeps the client request running when the stop signal fails', async () => {
    const error = new Error('stop signal failed');
    const abortClientRequest = vi.fn();

    await expect(
      requestStopAndAbortClient({
        requestStop: async () => Promise.reject(error),
        abortClientRequest
      })
    ).rejects.toBe(error);
    expect(abortClientRequest).not.toHaveBeenCalled();
  });
});

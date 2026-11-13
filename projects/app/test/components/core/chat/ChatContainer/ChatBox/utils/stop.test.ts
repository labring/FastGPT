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

  it('waits for the active SSE stream to settle before running fallback client abort', async () => {
    const callOrder: string[] = [];
    const settleDeferred = Promise.withResolvers<void>();
    const requestStop = vi.fn(async () => {
      callOrder.push('request-stop');
    });
    const abortClientRequest = vi.fn(() => {
      callOrder.push('abort-client');
    });

    const stopPromise = requestStopAndAbortClient({
      requestStop,
      waitForStreamSettle: async () => {
        callOrder.push('wait-stream');
        await settleDeferred.promise;
        callOrder.push('stream-settled');
      },
      settleTimeoutMs: 1000,
      abortClientRequest
    });

    await vi.waitFor(() => expect(callOrder).toEqual(['request-stop', 'wait-stream']));
    expect(abortClientRequest).not.toHaveBeenCalled();

    settleDeferred.resolve();
    await stopPromise;

    expect(callOrder).toEqual(['request-stop', 'wait-stream', 'stream-settled', 'abort-client']);
  });

  it('falls back to client abort after settleTimeoutMs when the SSE stream stays open', async () => {
    const abortClientRequest = vi.fn();

    await requestStopAndAbortClient({
      requestStop: async () => undefined,
      waitForStreamSettle: () => new Promise<void>(() => {}),
      settleTimeoutMs: 25,
      abortClientRequest
    });

    expect(abortClientRequest).toHaveBeenCalledOnce();
  });
});

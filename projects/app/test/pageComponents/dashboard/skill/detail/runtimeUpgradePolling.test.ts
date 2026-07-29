import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startRuntimeUpgradePolling } from '@/pageComponents/dashboard/skill/detail/runtimeUpgradePolling';

describe('startRuntimeUpgradePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('continues serial polling until runtime is ready', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: 'upgrading' })
      .mockResolvedValueOnce({ status: 'upgrading' })
      .mockResolvedValueOnce({ status: 'readyToInit' });
    const onStatus = vi.fn();
    const stop = startRuntimeUpgradePolling({
      intervalMs: 3000,
      request,
      onStatus,
      onError: vi.fn()
    });

    await vi.advanceTimersByTimeAsync(9000);

    expect(request).toHaveBeenCalledTimes(3);
    expect(onStatus).toHaveBeenCalledTimes(3);
    expect(onStatus).toHaveBeenLastCalledWith({ status: 'readyToInit' });

    await vi.advanceTimersByTimeAsync(3000);
    expect(request).toHaveBeenCalledTimes(3);
    stop();
  });

  it('does not overlap requests when a poll exceeds the interval', async () => {
    let resolveFirstRequest!: (status: { status: 'upgrading' }) => void;
    const request = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ status: 'upgrading' }>((resolve) => {
            resolveFirstRequest = resolve;
          })
      )
      .mockResolvedValueOnce({ status: 'readyToInit' });
    const stop = startRuntimeUpgradePolling({
      intervalMs: 3000,
      request,
      onStatus: vi.fn(),
      onError: vi.fn()
    });

    await vi.advanceTimersByTimeAsync(9000);
    expect(request).toHaveBeenCalledTimes(1);

    resolveFirstRequest({ status: 'upgrading' });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3000);

    expect(request).toHaveBeenCalledTimes(2);
    stop();
  });

  it('clears a scheduled poll when stopped', async () => {
    const request = vi.fn();
    const stop = startRuntimeUpgradePolling({
      intervalMs: 3000,
      request,
      onStatus: vi.fn(),
      onError: vi.fn()
    });

    stop();
    await vi.advanceTimersByTimeAsync(3000);

    expect(request).not.toHaveBeenCalled();
  });

  it('aborts an in-flight request and ignores its result when stopped', async () => {
    let resolveRequest!: (status: { status: 'upgrading' }) => void;
    let requestAbortCtrl: AbortController | undefined;
    const request = vi.fn(
      (abortCtrl: AbortController) =>
        new Promise<{ status: 'upgrading' }>((resolve) => {
          requestAbortCtrl = abortCtrl;
          resolveRequest = resolve;
        })
    );
    const onStatus = vi.fn();
    const stop = startRuntimeUpgradePolling({
      intervalMs: 3000,
      request,
      onStatus,
      onError: vi.fn()
    });

    await vi.advanceTimersByTimeAsync(3000);
    stop();

    expect(requestAbortCtrl?.signal.aborted).toBe(true);
    resolveRequest({ status: 'upgrading' });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3000);

    expect(request).toHaveBeenCalledTimes(1);
    expect(onStatus).not.toHaveBeenCalled();
  });

  it('does not schedule another poll when stopped during status handling', async () => {
    let finishStatusHandling!: () => void;
    const onStatus = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishStatusHandling = resolve;
        })
    );
    const request = vi.fn().mockResolvedValue({ status: 'upgrading' });
    const stop = startRuntimeUpgradePolling({
      intervalMs: 3000,
      request,
      onStatus,
      onError: vi.fn()
    });

    await vi.advanceTimersByTimeAsync(3000);
    stop();
    finishStatusHandling();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3000);

    expect(request).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledTimes(1);
  });

  it('reports a request error once and stops polling', async () => {
    const error = new Error('status request failed');
    const request = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const stop = startRuntimeUpgradePolling({
      intervalMs: 3000,
      request,
      onStatus: vi.fn(),
      onError
    });

    await vi.advanceTimersByTimeAsync(6000);

    expect(request).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
    stop();
  });
});

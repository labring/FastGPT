import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postSandboxHeartbeat, startSandboxHeartbeat } from '../src/heartbeat';

describe('postSandboxHeartbeat', () => {
  const APP_BASE = 'http://localhost:3000';
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to the internal heartbeat endpoint with the proxy secret', async () => {
    await postSandboxHeartbeat('sid-heartbeat');

    expect(fetchMock).toHaveBeenCalledWith(
      `${APP_BASE}/api/core/sandbox/internal/heartbeat`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${'a'.repeat(32)}`
        },
        body: JSON.stringify({ sandboxId: 'sid-heartbeat' })
      })
    );
  });

  it('does not throw on non-2xx responses or fetch errors', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(postSandboxHeartbeat('sid-fail')).resolves.toBeUndefined();

    fetchMock.mockRejectedValueOnce(new Error('network'));
    await expect(postSandboxHeartbeat('sid-error')).resolves.toBeUndefined();
  });
});

describe('startSandboxHeartbeat', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends an immediate heartbeat and repeats until stopped', async () => {
    const stop = startSandboxHeartbeat('sid-repeat', 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('shares one timer per sandbox across multiple websocket connections', async () => {
    const stopA = startSandboxHeartbeat('sid-shared', 1000);
    const stopB = startSandboxHeartbeat('sid-shared', 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    stopA();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    stopB();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

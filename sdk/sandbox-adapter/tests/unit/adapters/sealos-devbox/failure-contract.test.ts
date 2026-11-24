import { afterEach, describe, expect, it, vi } from 'vitest';
import { SealosDevboxAdapter, type SealosDevboxConfig } from '@/adapters/sealos-devbox';
import { DevboxClientError } from '@/adapters/sealos-devbox/client';
import {
  ConnectionError,
  SandboxReadyTimeoutError,
  SandboxTerminationError,
  getSandboxFailureDetail
} from '@/errors';

const CONFIG: SealosDevboxConfig = {
  baseUrl: 'https://devbox.example.com',
  token: 'token',
  sandboxId: 'sandbox-1'
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const infoResponse = (phase: string, state: Record<string, unknown> = {}): Response =>
  jsonResponse({
    code: 200,
    message: 'ok',
    data: {
      name: 'sandbox-1',
      image: 'node:20',
      state: { phase, ...state },
      ssh: {}
    }
  });

const runningInfo = () => ({
  id: 'sandbox-1',
  image: { repository: 'node', tag: '20' },
  entrypoint: [],
  status: { state: 'Running' as const },
  createdAt: new Date()
});

describe('SealosDevboxAdapter failure contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('turns the controller Error phase into a structured termination', async () => {
    // provider 原因带换行与控制字符，展示前必须压成单行。
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      infoResponse('Error', {
        message: 'pod sandbox-1 failed:\n\tOOMKilled (exit 137)\u0007'
      })
    );

    const error = await new SealosDevboxAdapter(CONFIG).ensureRunning().catch((err) => err);

    expect(error).toBeInstanceOf(SandboxTerminationError);
    expect((error as SandboxTerminationError).code).toBe('SEALOS_DEVBOX::FAILED');
    // 对外 message 直接使用 provider 可展示原因，不是通用包装文案。
    expect((error as SandboxTerminationError).message).toContain('OOMKilled');
    expect((error as SandboxTerminationError).message).not.toContain('\n');

    const detail = getSandboxFailureDetail(error);
    expect(detail).toMatchObject({ code: 'SEALOS_DEVBOX::FAILED', terminated: true });
    expect(detail?.displayMessage).toContain('OOMKilled');
    expect(detail?.displayMessage).not.toContain('Failed to create sandbox');
  });

  it('falls back to the structured phase when provider exposes no reason', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(infoResponse('Error'));

    const error = await new SealosDevboxAdapter(CONFIG).connectRunning().catch((err) => err);

    expect(error).toBeInstanceOf(SandboxTerminationError);
    expect((error as SandboxTerminationError).message).toContain('Devbox phase Error');
  });

  it('recognizes termination through an outer ConnectionError cause chain', () => {
    const termination = new SandboxTerminationError(
      'SEALOS_DEVBOX::FAILED',
      'devbox sandbox-1 crashed',
      { message: 'devbox sandbox-1 crashed' }
    );
    const inner = new ConnectionError(
      'Failed to ensure sandbox running',
      CONFIG.baseUrl,
      termination
    );
    const outer = new ConnectionError('Failed to prepare sandbox runtime', CONFIG.baseUrl, inner);

    const detail = getSandboxFailureDetail(outer);

    expect(detail).toMatchObject({ code: 'SEALOS_DEVBOX::FAILED', terminated: true });
    expect(detail?.displayMessage).toContain('crashed');
  });

  it('keeps a DevboxClientError transport wrapper non-terminal', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('bad gateway', { status: 502 }));

    const error = await new SealosDevboxAdapter(CONFIG).getInfo().catch((err) => err);

    expect(error).toBeInstanceOf(ConnectionError);
    expect((error as ConnectionError).cause).toBeInstanceOf(DevboxClientError);
    expect(getSandboxFailureDetail(error)?.terminated ?? false).toBe(false);
  });

  it('turns a 4xx create rejection into structured termination', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ code: 403, message: 'quota exceeded: team sandbox limit', data: null })
      );

    const error = await new SealosDevboxAdapter(CONFIG).create().catch((err) => err);

    expect(error).toBeInstanceOf(SandboxTerminationError);
    expect((error as SandboxTerminationError).code).toBe('SEALOS_DEVBOX::CREATE_REJECTED');
    expect((error as SandboxTerminationError).message).toContain('quota exceeded');
    expect(getSandboxFailureDetail(error)).toMatchObject({
      code: 'SEALOS_DEVBOX::CREATE_REJECTED',
      terminated: true
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 404, 408, 429, 500, 503])(
    'keeps create rejection %i as an unknown result',
    async (code) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ code, message: `gateway rejected create with ${code}`, data: null })
      );

      const error = await new SealosDevboxAdapter(CONFIG).create().catch((err) => err);

      expect(error).toBeInstanceOf(ConnectionError);
      expect(error).not.toBeInstanceOf(SandboxTerminationError);
      expect(getSandboxFailureDetail(error)?.terminated ?? false).toBe(false);
    }
  );

  it.each(['Paused', 'Stopped', 'Pausing', 'Stopping', 'Shutdown', 'Shutting'])(
    'treats %s as a recoverable state instead of termination',
    async (phase) => {
      let infoCalls = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/resume')) {
          return jsonResponse({ code: 200, message: 'resumed', data: { name: 'sandbox-1' } });
        }
        if (url.includes('/exec')) {
          return jsonResponse({
            code: 200,
            message: 'ok',
            data: { exitCode: 0, stdout: '', stderr: '' }
          });
        }
        infoCalls += 1;
        return infoResponse(infoCalls === 1 ? phase : 'Running');
      });
      const adapter = new SealosDevboxAdapter(CONFIG);

      await expect(adapter.ensureRunning()).resolves.toBeUndefined();

      expect(infoCalls).toBeGreaterThanOrEqual(2);
      expect(adapter.status.state).toBe('Running');
      expect(adapter.status.code).toBeUndefined();
    }
  );

  it('keeps the Unknown phase and readiness timeouts non-terminal', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(infoResponse('Unknown'));

    const unknownError = await new SealosDevboxAdapter(CONFIG).ensureRunning().catch((err) => err);

    expect(unknownError).not.toBeInstanceOf(SandboxTerminationError);
    expect(getSandboxFailureDetail(unknownError)?.terminated ?? false).toBe(false);

    vi.useFakeTimers();
    const adapter = new SealosDevboxAdapter(CONFIG);
    vi.spyOn(adapter, 'getInfo').mockResolvedValue({
      ...runningInfo(),
      status: { state: 'Creating', reason: 'Pending' }
    });

    const readyPromise = adapter.waitUntilReady(3_000);
    const assertion = expect(readyPromise).rejects.toBeInstanceOf(SandboxReadyTimeoutError);
    await vi.advanceTimersByTimeAsync(4_000);
    await assertion;
  });

  it('keeps network failures non-terminal', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    const error = await new SealosDevboxAdapter(CONFIG).getInfo().catch((err) => err);

    expect(error).toBeInstanceOf(ConnectionError);
    expect(getSandboxFailureDetail(error)?.terminated ?? false).toBe(false);
  });

  it('flattens and truncates long provider reasons', async () => {
    const longReason = `${'disk quota exceeded; '.repeat(60)}\nretry later`;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(infoResponse('Error', { message: longReason }));

    const error = await new SealosDevboxAdapter(CONFIG).connectRunning().catch((err) => err);

    expect(error).toBeInstanceOf(SandboxTerminationError);
    const message = (error as SandboxTerminationError).message;
    expect(message).not.toContain('\n');
    expect(message.endsWith('…')).toBe(true);
    expect(message.length).toBeLessThan(530);
  });
});

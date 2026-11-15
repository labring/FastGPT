import { describe, expect, it, vi } from 'vitest';
import { createSessionFetch } from '@fastgpt/web/common/auth/sessionFetch';
import { SessionCoordinator } from '@fastgpt/web/common/auth/sessionCoordinator';
import { SessionErrEnum } from '@fastgpt/global/common/error/code/session';

describe('session-aware fetch and SSE handshake', () => {
  it('sends and cancels requests when AbortSignal.throwIfAborted and reason are unavailable', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'throwIfAborted')!;
    Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', {
      configurable: true,
      value: undefined
    });
    const coordinator = new SessionCoordinator({ request: async () => ({ session: null }) });
    coordinator.observe(null);
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('ready'));
    const fetcher = createSessionFetch({ coordinator, fetchImpl });
    try {
      await expect(
        (
          await fetcher('https://fastgpt.test/api/private', {
            signal: new AbortController().signal
          })
        ).text()
      ).resolves.toBe('ready');
      const canceled = new AbortController();
      const reason = new Error('caller canceled');
      canceled.abort(reason);
      await expect(
        fetcher('https://fastgpt.test/api/private', { signal: canceled.signal })
      ).rejects.toBe(reason);
      await expect(
        coordinator.beforeRequest({ signal: { aborted: true } as AbortSignal })
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', descriptor);
    }
  });

  it.each([false, true])(
    'returns a new login stream while a previous legacy mutation is pending (dual=%s)',
    async (dual) => {
      const coordinator = new SessionCoordinator({ request: async () => ({ session: null }) });
      coordinator.observe(null, { login: true });
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const oldMutation = coordinator.trackContextMutation(() => held);
      coordinator.stop();
      const now = Date.now();
      coordinator.observe(
        dual
          ? {
              sessionId: 'user:new-login',
              serverTime: now,
              createdAt: now,
              accessExpiresAt: now + 900_000,
              refreshExpiresAt: now + 604_800_000,
              absoluteExpiresAt: now + 2_592_000_000,
              generation: 1,
              contextVersion: 1
            }
          : null,
        { login: true }
      );
      const fetcher = createSessionFetch({
        coordinator,
        fetchImpl: async () =>
          new Response('event: answer\ndata: current\n\n', {
            headers: { 'content-type': 'text/event-stream' }
          })
      });
      let delivered = false;
      const current = fetcher('https://fastgpt.test/api/v2/chat/completions').then((response) => {
        delivered = true;
        return response;
      });
      try {
        // 新登录必须自行完成，不能靠旧登录的慢请求结束后才恢复。
        await vi.waitFor(() => expect(delivered).toBe(true));
        expect(await (await current).text()).toContain('current');
      } finally {
        release();
        await Promise.allSettled([oldMutation, current]);
      }
    }
  );

  it.each(['body', 'query'] as const)(
    'does not bind independent share %s requests to a stopped user session',
    async (transport) => {
      const coordinator = new SessionCoordinator({
        request: async () => {
          throw new Error('must not refresh');
        }
      });
      coordinator.stop();
      const auth = { shareId: 'share', outLinkUid: 'viewer' };
      const fetchImpl = vi.fn<typeof fetch>(
        async () => new Response('event: answer\ndata: shared\n\n')
      );
      const fetcher = createSessionFetch({ coordinator, fetchImpl });
      const response = await fetcher(
        transport === 'query'
          ? `https://fastgpt.test/api/core/chat/resume?outLinkAuthData=${encodeURIComponent(JSON.stringify(auth))}`
          : 'https://fastgpt.test/api/v2/chat/completions',
        transport === 'body'
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ outLinkAuthData: auth })
            }
          : {}
      );
      expect(await response.text()).toContain('shared');
      expect(fetchImpl).toHaveBeenCalledOnce();
      const sent = fetchImpl.mock.calls[0][0] as Request;
      expect(sent.headers.has('x-fastgpt-session-context')).toBe(false);
      if (transport === 'body') expect(await sent.json()).toEqual({ outLinkAuthData: auth });
      await expect(
        fetcher('https://fastgpt.test/api/v2/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outLinkAuthData: { shareId: 'incomplete' } })
        })
      ).rejects.toThrow('context changed');
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
  );

  const createCoordinator = (onRefresh: () => void) =>
    new SessionCoordinator({
      now: () => 0,
      request: async () => {
        onRefresh();
        return {
          session: {
            sessionId: 'user:device',
            serverTime: 1000,
            createdAt: 1000,
            accessExpiresAt: 901_000,
            refreshExpiresAt: 1_000_000,
            absoluteExpiresAt: 2_000_000,
            generation: 2,
            contextVersion: 1
          }
        };
      }
    });

  it.each(['json', 'sse'] as const)(
    'recovers %s Access rejection before any business event and sends the same body once more',
    async (type) => {
      let refreshes = 0;
      const bodies: string[] = [];
      const coordinator = createCoordinator(() => {
        refreshes++;
      });
      const fetcher = createSessionFetch({
        coordinator,
        fetchImpl: async (input) => {
          const req = input as Request;
          bodies.push(await req.text());
          if (bodies.length === 1) {
            const error = { code: 401, statusText: SessionErrEnum.accessExpired };
            return type === 'json'
              ? new Response(JSON.stringify(error), {
                  status: 401,
                  headers: { 'content-type': 'application/json' }
                })
              : new Response(`event: error\ndata: ${JSON.stringify(error)}\n\n`, {
                  headers: { 'content-type': 'text/event-stream' }
                });
          }
          return new Response('event: answer\ndata: once\n\n', {
            headers: { 'content-type': 'text/event-stream' }
          });
        }
      });
      const response = await fetcher('https://fastgpt.test/chat', {
        method: 'POST',
        body: '{"requestId":"same-round"}'
      });
      expect(await response.text()).toContain('data: once');
      expect(bodies).toEqual(['{"requestId":"same-round"}', '{"requestId":"same-round"}']);
      expect(refreshes).toBe(1);
    }
  );

  it('forwards a started stream including later errors without submitting the business again', async () => {
    let calls = 0;
    let refreshes = 0;
    const content = `event: answer\ndata: charged-once\n\nevent: error\ndata: ${JSON.stringify({ statusText: SessionErrEnum.accessExpired })}\n\n`;
    const fetcher = createSessionFetch({
      coordinator: createCoordinator(() => {
        refreshes++;
      }),
      fetchImpl: async () => {
        calls++;
        return new Response(content, { headers: { 'content-type': 'text/event-stream' } });
      }
    });
    expect(await (await fetcher('https://fastgpt.test/chat')).text()).toBe(content);
    expect(calls).toBe(1);
    expect(refreshes).toBe(0);
  });

  it('rejects a successful response held across a newer login', async () => {
    const coordinator = createCoordinator(() => {});
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived!: () => void;
    const started = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const fetcher = createSessionFetch({
      coordinator,
      fetchImpl: async () => {
        arrived();
        await pending;
        return new Response('old user data');
      }
    });
    const response = fetcher('https://fastgpt.test/read');
    const rejection = expect(response).rejects.toThrow('context changed');
    await started;
    coordinator.observe(
      {
        sessionId: 'user:new-device',
        serverTime: 1000,
        createdAt: 1000,
        accessExpiresAt: 901_000,
        refreshExpiresAt: 1_000_000,
        absoluteExpiresAt: 2_000_000,
        generation: 1,
        contextVersion: 1
      },
      { login: true }
    );
    release();
    await rejection;
  });
  it('checks the prepared epoch before sending an initially unknown-session request', async () => {
    const coordinator = createCoordinator(() => {});
    const snapshot = await coordinator.beforeRequest();
    vi.spyOn(coordinator, 'beforeRequest').mockImplementation(async () => {
      coordinator.observe(
        {
          sessionId: 'user:new-device',
          serverTime: 1000,
          createdAt: 1000,
          accessExpiresAt: 901_000,
          refreshExpiresAt: 1_000_000,
          absoluteExpiresAt: 2_000_000,
          generation: 1,
          contextVersion: 1
        },
        { login: true }
      );
      return snapshot;
    });
    const send = vi.fn(async () => new Response('must not execute'));
    const fetcher = createSessionFetch({ coordinator, fetchImpl: send });
    await expect(
      fetcher('https://fastgpt.test/write', { method: 'POST', body: 'old payload' })
    ).rejects.toThrow('context changed');
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['login', 'team'] as const)(
    'does not send a queued write with replacement credentials after a %s and refresh outage',
    async (change) => {
      let reject!: (error: Error) => void;
      const coordinator = new SessionCoordinator({
        now: () => 0,
        request: () =>
          new Promise((_, fail) => {
            reject = fail;
          })
      });
      const session = {
        sessionId: 'user:device',
        serverTime: 1000,
        createdAt: 1000,
        accessExpiresAt: 31_000,
        refreshExpiresAt: 1_000_000,
        absoluteExpiresAt: 2_000_000,
        generation: 1,
        contextVersion: 1
      };
      coordinator.observe(session);
      const send = vi.fn(async () => new Response('must not execute'));
      const fetcher = createSessionFetch({ coordinator, fetchImpl: send });
      const queued = fetcher('https://fastgpt.test/write', { method: 'POST', body: 'old payload' });
      const rejected = expect(queued).rejects.toThrow('context changed');
      coordinator.observe(
        {
          ...session,
          sessionId: change === 'login' ? 'user:new-device' : session.sessionId,
          contextVersion: 2,
          accessExpiresAt: 901_000
        },
        { login: change === 'login' }
      );
      reject(new Error('offline'));
      await rejected;
      expect(send).not.toHaveBeenCalled();
    }
  );
});

import { describe, expect, it } from 'vitest';
import { createSessionFetch } from '@fastgpt/web/common/auth/sessionFetch';
import { SessionCoordinator } from '@fastgpt/web/common/auth/sessionCoordinator';
import { SessionErrEnum } from '@fastgpt/global/common/error/code/session';

describe('session-aware fetch and SSE handshake', () => {
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
});

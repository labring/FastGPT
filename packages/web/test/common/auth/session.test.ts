import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserSession, observeSessionHeader } from '@fastgpt/web/common/auth/session';
import type { SessionLifecycle } from '@fastgpt/global/support/user/session/type';
import { SESSION_API_PATH } from '@fastgpt/global/support/user/session/constants';

afterEach(() => {
  browserSession.stop();
  vi.unstubAllGlobals();
});

describe('browser login session initialization', () => {
  it.each([false, true])(
    'visits the scoped status boundary after every login (legacy=%s)',
    async (legacy) => {
      vi.stubGlobal('window', {});
      const now = Date.now();
      const session: SessionLifecycle | null = legacy
        ? null
        : {
            sessionId: 'user:device',
            contextVersion: 1,
            generation: 1,
            serverTime: now,
            createdAt: now,
            accessExpiresAt: now + 900_000,
            refreshExpiresAt: now + 604_800_000,
            absoluteExpiresAt: now + 2_592_000_000
          };
      const request = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ code: 200, data: { session } })));
      vi.stubGlobal('fetch', request);
      observeSessionHeader(JSON.stringify(session), { login: true });
      await browserSession.beforeRequest({ initialize: true });
      expect(request).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining(`/api${SESSION_API_PATH}/status`),
        expect.objectContaining({
          method: 'GET',
          credentials: 'same-origin'
        })
      );
      // 普通业务元数据不能再次触发清理或多余的会话请求。
      observeSessionHeader(JSON.stringify(session));
      expect(request).toHaveBeenCalledTimes(1);
    }
  );

  it('does not issue browser cleanup requests for malformed login metadata or SSR', () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    vi.stubGlobal('window', {});
    observeSessionHeader('{broken', { login: true });
    observeSessionHeader('{}', { login: true });
    vi.stubGlobal('window', undefined);
    observeSessionHeader('null', { login: true });
    expect(request).not.toHaveBeenCalled();
  });
});

import { browserSession } from '@fastgpt/web/common/auth/session';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  maxQuantityMap,
  deduplicatedRequestMap,
  checkMaxQuantity,
  requestFinish,
  checkRes,
  responseError,
  responseSuccess,
  AUTH_ERROR_EVENT_NAME,
  GET,
  POST,
  instance,
  startInterceptors
} from '../../../../src/web/common/api/request';
import {
  FASTGPT_LANGUAGE_HEADER,
  FASTGPT_SHARE_LANGUAGE_HEADER,
  FASTGPT_WEB_REQUEST_HEADER,
  FASTGPT_WEB_REQUEST_VALUE
} from '@fastgpt/global/common/system/constants';
import {
  LANG_KEY,
  persistLanguagePreference,
  restoreLanguagePreference,
  SHARE_LANG_KEY
} from '@fastgpt/web/i18n/utils';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { TOKEN_ERROR_CODE } from '@fastgpt/global/common/error/errorCode';
import { ToastHandledError } from '@fastgpt/global/common/error/utils';
import { clearToken } from '@/web/support/user/auth';
import { beginLogout, resetLogoutState } from '@/web/support/user/logoutState';
import { getDashboardData, getUserUsages } from '@/web/support/wallet/usage/api';

// Mock all required dependencies
vi.mock('@fastgpt/web/common/system/utils', () => ({
  getWebReqUrl: vi.fn().mockReturnValue('http://test.com'),
  subRoute: '/test-route' // Add subRoute mock
}));

vi.mock('@fastgpt/global/common/i18n/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/global/common/i18n/utils')>()),
  i18nT: vi.fn((key: string) => {
    const translations: Record<string, string> = {
      'common:server_error': '服务器异常',
      'common:error.unKnow': '出现了点意外~'
    };

    return translations[key] ?? key;
  })
}));

vi.mock('@/web/support/user/auth', () => ({
  clearToken: vi.fn()
}));

vi.mock('../../../../src/web/common/system/useSystemStore', () => ({
  useSystemStore: {
    getState: vi.fn().mockReturnValue({
      setNotSufficientModalType: vi.fn()
    })
  }
}));

// Mock window.location
const mockLocation = {
  origin: 'https://fastgpt.test',
  pathname: '/test',
  replace: vi.fn(),
  search: '',
  reload: vi.fn()
};
const dispatchEventMock = vi.fn();
const tokenErrorCode = Number(Object.keys(TOKEN_ERROR_CODE)[0]);

vi.stubGlobal('window', {
  location: mockLocation,
  dispatchEvent: dispatchEventMock
});
vi.stubGlobal('location', mockLocation);

describe('request utils', () => {
  it('sends external geolocation requests while stopped and keeps same-origin absolute URLs coordinated', async () => {
    browserSession.stop();
    const send = vi
      .spyOn(instance, 'request')
      .mockResolvedValue({ data: { code: 200, data: { country: '中国' } } });
    try {
      await expect(GET('https://qifu-api.baidubce.com/ip/local/geo/v1/district')).resolves.toEqual({
        country: '中国'
      });
      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].headers).not.toHaveProperty('x-fastgpt-session-context');
      await expect(GET('https://fastgpt.test/api/private')).rejects.toThrow(
        'Ignore request from an old session context'
      );
      expect(send).toHaveBeenCalledOnce();
    } finally {
      send.mockRestore();
      browserSession.observe(null, { login: true });
    }
  });

  it.each(['before', 'after'] as const)(
    'ignores a legacy 401 arriving %s a password rekey response installs its Cookie',
    async (order) => {
      browserSession.observe(null, { login: true });
      let failOld!: (reason: unknown) => void;
      let release!: () => void;
      let oldArrived!: () => void;
      let changeArrived!: () => void;
      const oldStarted = new Promise<void>((resolve) => {
        oldArrived = resolve;
      });
      const changeStarted = new Promise<void>((resolve) => {
        changeArrived = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const send = vi.spyOn(instance, 'request').mockImplementation(async (config) => {
        if (config.url === '/test/old')
          return new Promise((_, reject) => {
            failOld = reject;
            oldArrived();
          });
        if (config.url?.endsWith('/password/update')) {
          changeArrived();
          await held;
          return responseSuccess({
            data: { code: 200, data: 'changed' },
            config,
            headers: { 'x-fastgpt-session': 'null' }
          } as Parameters<typeof responseSuccess>[0]);
        }
        return { data: { code: 200, data: 'current' } };
      });
      const old = GET('/test/old').then(
        () => undefined,
        (error) => error
      );
      await oldStarted;
      const changing = POST('/support/user/account/password/update', {});
      await changeStarted;
      try {
        if (order === 'before') failOld({ code: 401, statusText: 'unAuthorization' });
        await Promise.resolve();
        release();
        await expect(changing).resolves.toBe('changed');
        if (order === 'after') failOld({ code: 401, statusText: 'unAuthorization' });
        expect(await old).toBeInstanceOf(ToastHandledError);
        expect(clearToken).not.toHaveBeenCalled();
        expect(mockLocation.replace).not.toHaveBeenCalled();
        await expect(GET('/test/current')).resolves.toBe('current');
      } finally {
        release();
        failOld({ code: 401, statusText: 'unAuthorization' });
        await Promise.allSettled([old, changing]);
        send.mockRestore();
        browserSession.observe(null, { login: true });
      }
    }
  );

  it.each([false, true])(
    'allows independent share requests after session cleanup (query=%s)',
    async (query) => {
      browserSession.stop();
      const auth = { shareId: 'share', outLinkUid: 'viewer' };
      const send = vi
        .spyOn(instance, 'request')
        .mockResolvedValue({ data: { code: 200, data: 'shared' } });
      try {
        const data = { outLinkAuthData: query ? JSON.stringify(auth) : auth };
        await expect(
          query ? GET('/core/chat/outLink/init', data) : POST('/core/ai/sandbox/getTicket', data)
        ).resolves.toBe('shared');
        expect(send).toHaveBeenCalledOnce();
        expect(send.mock.calls[0][0].headers).not.toHaveProperty('x-fastgpt-session-context');
        await expect(
          POST('/core/ai/sandbox/getTicket', { outLinkAuthData: { shareId: 'incomplete' } })
        ).rejects.toThrow('Ignore request from an old session context');
        expect(send).toHaveBeenCalledOnce();
      } finally {
        send.mockRestore();
        browserSession.observe(null, { login: true });
      }
    }
  );

  it('keeps a successful password response usable when an overlapping request sees stale cookies', async () => {
    const now = Date.now();
    const session = {
      sessionId: 'user:password',
      serverTime: now,
      createdAt: now,
      accessExpiresAt: now + 900_000,
      refreshExpiresAt: now + 604_800_000,
      absoluteExpiresAt: now + 2_592_000_000,
      generation: 1,
      contextVersion: 1
    };
    browserSession.observe(session, { login: true });
    let release!: () => void;
    let arrived!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const send = vi.spyOn(instance, 'request').mockImplementation(async (config) => {
      if (config.url?.endsWith('/password/update')) {
        arrived();
        await held;
        return responseSuccess({
          data: { code: 200, data: 'changed' },
          config,
          headers: {
            'x-fastgpt-session': JSON.stringify({ ...session, generation: 2, contextVersion: 2 })
          }
        } as Parameters<typeof responseSuccess>[0]);
      }
      throw { code: 409, statusText: 'session_context_changed' };
    });
    const changing = POST('/support/user/account/password/update', {});
    await started;
    const overlap = GET('/test/read');
    const rejected = expect(overlap).rejects.toThrow('Ignore request from an old session context');
    try {
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
      expect(mockLocation.reload).not.toHaveBeenCalled();
      release();
      await expect(changing).resolves.toBe('changed');
      await rejected;
      expect(mockLocation.reload).not.toHaveBeenCalled();
      expect(clearToken).not.toHaveBeenCalled();
      expect(browserSession.hasSession).toBe(true);
      expect(browserSession.contextHeaders).toEqual({
        'x-fastgpt-session-context': 'user:password.2'
      });
    } finally {
      release();
      await Promise.allSettled([changing, overlap]);
      send.mockRestore();
      browserSession.observe(null, { login: true });
    }
  });

  it('allows public initialization and network recovery while logged out', async () => {
    browserSession.stop();
    const send = vi
      .spyOn(instance, 'request')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        data: { code: 200, data: { feConfigs: { systemTitle: 'Recovered' } } }
      });
    try {
      await expect(GET('/common/system/getInitData')).rejects.toThrow('offline');
      await expect(GET('/common/system/getInitData')).resolves.toMatchObject({
        feConfigs: { systemTitle: 'Recovered' }
      });
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      send.mockRestore();
      browserSession.observe(null, { login: true });
    }
  });

  it('rejects before dispatch if login changes while an unknown-session snapshot is being prepared', async () => {
    browserSession.observe(null, { login: true });
    const snapshot = await browserSession.beforeRequest();
    const prepare = vi.spyOn(browserSession, 'beforeRequest').mockImplementation(async () => {
      const now = Date.now();
      browserSession.observe(
        {
          sessionId: 'user:new-device',
          serverTime: now,
          createdAt: now,
          accessExpiresAt: now + 900_000,
          refreshExpiresAt: now + 604_800_000,
          absoluteExpiresAt: now + 2_592_000_000,
          generation: 1,
          contextVersion: 1
        },
        { login: true }
      );
      return snapshot;
    });
    const send = vi
      .spyOn(instance, 'request')
      .mockResolvedValue({ data: { code: 200, data: 'must not execute' } });
    try {
      await expect(POST('/test/write', { intent: 'old context' })).rejects.toThrow(
        'Ignore request from an old session context'
      );
      expect(send).not.toHaveBeenCalled();
    } finally {
      prepare.mockRestore();
      send.mockRestore();
      browserSession.observe(null, { login: true });
    }
  });

  it('keeps notification binding behind authenticated session coordination', async () => {
    browserSession.stop();
    const send = vi.spyOn(instance, 'request');
    try {
      await expect(
        POST('/proApi/support/user/inform/sendAuthCode', { type: 'bindNotification' })
      ).rejects.toThrow('Ignore request from an old session context');
      expect(send).not.toHaveBeenCalled();
    } finally {
      send.mockRestore();
      browserSession.observe(null, { login: true });
    }
  });

  it.each(['register', 'findPassword'])(
    'sends anonymous %s codes after login-page cleanup',
    async (type) => {
      browserSession.stop();
      const send = vi
        .spyOn(instance, 'request')
        .mockResolvedValue({ data: { code: 200, data: 'sent' } });
      try {
        await expect(POST('/proApi/support/user/inform/sendAuthCode', { type })).resolves.toBe(
          'sent'
        );
        expect(send).toHaveBeenCalledOnce();
      } finally {
        send.mockRestore();
        browserSession.observe(null, { login: true });
      }
    }
  );

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(maxQuantityMap).forEach((key) => delete maxQuantityMap[key]);
    deduplicatedRequestMap.clear();
    resetLogoutState();
    mockLocation.pathname = '/test';
    dispatchEventMock.mockReturnValue(true);
  });

  it('preserves inclusive date boundaries and milliseconds in GET and POST requests', async () => {
    const start = new Date(2026, 10, 2, 0, 0, 0, 0);
    const end = new Date(2026, 10, 9, 23, 59, 59, 999);
    const spy = vi
      .spyOn(instance, 'request')
      .mockResolvedValue({ data: { code: 200, data: null } });
    try {
      await GET('/test', { dateStart: start, dateEnd: end });
      await POST('/test', { dateStart: start, dateEnd: end });
      const [get, post] = spy.mock.calls.slice(-2).map(([config]) => config);
      for (const body of [get.params, post.data]) {
        expect(body.dateStart).toMatch(/T00:00:00\.000[+-]\d{2}:\d{2}$/);
        expect(body.dateEnd).toMatch(/T23:59:59\.999[+-]\d{2}:\d{2}$/);
        expect(new Date(body.dateStart).getTime()).toBe(start.getTime());
        expect(new Date(body.dateEnd).getTime()).toBe(end.getTime());
      }
    } finally {
      spy.mockRestore();
    }
  });

  it('aborts the previous usage request per endpoint and keeps the latest request registered', async () => {
    const pending: { signal: AbortSignal; resolve: (value: any) => void }[] = [];
    const spy = vi.spyOn(instance, 'request').mockImplementation(
      (config) =>
        new Promise((resolve, reject) => {
          const signal = config.signal as AbortSignal;
          pending.push({ signal, resolve });
          signal.addEventListener('abort', () => reject({ code: 'ERR_CANCELED' }), { once: true });
        })
    );
    try {
      const body = {
        dateStart: '2026-11-01T00:00:00Z',
        dateEnd: '2026-11-02T00:00:00Z',
        unit: 'day' as const
      };
      const oldList = getUserUsages(body).catch((error) => error);
      const oldDashboard = getDashboardData(body).catch((error) => error);
      await vi.waitFor(() => expect(pending).toHaveLength(2));
      expect(pending.map(({ signal }) => signal.aborted)).toEqual([false, false]);

      const latestList = getUserUsages(body);
      const latestDashboard = getDashboardData(body);
      await vi.waitFor(() => expect(pending).toHaveLength(4));
      expect(pending.map(({ signal }) => signal.aborted)).toEqual([true, true, false, false]);
      await expect(oldList).resolves.toMatchObject({ code: 'ERR_CANCELED' });
      await expect(oldDashboard).resolves.toMatchObject({ code: 'ERR_CANCELED' });
      expect(maxQuantityMap['/proApi/support/wallet/usage/getUsage']).toHaveLength(1);
      expect(maxQuantityMap['/proApi/support/wallet/usage/getDashboardData']).toHaveLength(1);

      pending[2].resolve({ data: { code: 200, data: { list: [], total: 0 } } });
      pending[3].resolve({ data: { code: 200, data: [] } });
      await expect(latestList).resolves.toEqual({ list: [], total: 0 });
      await expect(latestDashboard).resolves.toEqual([]);
      expect(maxQuantityMap['/proApi/support/wallet/usage/getUsage']).toBeUndefined();
      expect(maxQuantityMap['/proApi/support/wallet/usage/getDashboardData']).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  describe('deduplicate request', () => {
    it('should share an in-flight request with the same params', async () => {
      let resolveRequest: ((value: any) => void) | undefined;
      const axiosRequest = new Promise((resolve) => {
        resolveRequest = resolve;
      });
      const requestSpy = vi.spyOn(instance, 'request').mockReturnValue(axiosRequest);

      const firstRequest = GET('/test', { versionKey: '1', type: 'llm' }, { deduplicate: true });
      const secondRequest = GET('/test', { type: 'llm', versionKey: '1' }, { deduplicate: true });

      expect(firstRequest).toBe(secondRequest);
      await vi.waitFor(() => expect(requestSpy).toHaveBeenCalledTimes(1));

      resolveRequest?.({ data: { code: 200, data: 'shared result', message: 'success' } });
      await expect(firstRequest).resolves.toBe('shared result');
      await expect(secondRequest).resolves.toBe('shared result');
      expect(deduplicatedRequestMap.size).toBe(0);
    });

    it('should start a new request after the previous request finishes', async () => {
      const requestSpy = vi.spyOn(instance, 'request').mockResolvedValue({
        data: { code: 200, data: 'result', message: 'success' }
      });

      await GET('/test', {}, { deduplicate: true });
      await GET('/test', {}, { deduplicate: true });

      expect(requestSpy).toHaveBeenCalledTimes(2);
    });

    it('should clear the shared request after it fails', async () => {
      const requestSpy = vi.spyOn(instance, 'request').mockRejectedValueOnce('request failed');

      await expect(GET('/test', {}, { deduplicate: true })).rejects.toEqual({
        message: 'request failed'
      });
      expect(deduplicatedRequestMap.size).toBe(0);

      requestSpy.mockResolvedValueOnce({
        data: { code: 200, data: 'result', message: 'success' }
      });
      await expect(GET('/test', {}, { deduplicate: true })).resolves.toBe('result');
      expect(requestSpy).toHaveBeenCalledTimes(2);
    });

    it('should not share requests with different params', async () => {
      const requestSpy = vi.spyOn(instance, 'request').mockResolvedValue({
        data: { code: 200, data: 'result', message: 'success' }
      });

      await Promise.all([
        GET('/test', { versionKey: '1' }, { deduplicate: true }),
        GET('/test', { versionKey: '2' }, { deduplicate: true })
      ]);

      expect(requestSpy).toHaveBeenCalledTimes(2);
    });

    it('should not share requests when deduplication is disabled', async () => {
      const requestSpy = vi.spyOn(instance, 'request').mockResolvedValue({
        data: { code: 200, data: 'result', message: 'success' }
      });

      await Promise.all([GET('/test'), GET('/test')]);

      expect(requestSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('language request header', () => {
    it('uses localStorage language before memory and navigator.language', () => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn().mockReturnValue('zh-CN')
      });
      vi.stubGlobal('navigator', { language: 'en-US' });

      const config = startInterceptors({ headers: {} } as any);

      expect(config.headers?.[FASTGPT_LANGUAGE_HEADER]).toBe('zh-CN');
    });

    it('uses memory language when localStorage is unavailable', () => {
      persistLanguagePreference('zh-Hant', 'NEXT_LOCALE', 'memory');
      vi.stubGlobal('localStorage', undefined);
      vi.stubGlobal('navigator', { language: 'en-US' });

      const config = startInterceptors({ headers: {} } as any);

      expect(config.headers?.[FASTGPT_LANGUAGE_HEADER]).toBe('zh-Hant');
    });

    it('uses navigator.language when browser storage has no language', () => {
      restoreLanguagePreference({ kind: 'memory' });
      vi.stubGlobal('localStorage', {
        getItem: vi.fn().mockReturnValue(null)
      });
      vi.stubGlobal('navigator', { language: 'zh-TW' });

      const config = startInterceptors({ headers: {} } as any);

      expect(config.headers?.[FASTGPT_LANGUAGE_HEADER]).toBe('zh-Hant');
    });

    it('uses the share language preference on share pages', () => {
      mockLocation.pathname = '/chat/share';
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) => (key === SHARE_LANG_KEY ? 'zh-Hant' : 'en'))
      });
      vi.stubGlobal('navigator', { language: 'en-US' });

      const config = startInterceptors({ headers: {} } as any);

      expect(config.headers?.[FASTGPT_SHARE_LANGUAGE_HEADER]).toBe('zh-Hant');
      expect(config.headers?.[FASTGPT_LANGUAGE_HEADER]).toBeUndefined();
    });

    it('uses share memory language before main-site memory language', () => {
      mockLocation.pathname = '/chat/share';
      persistLanguagePreference('zh-CN', LANG_KEY, 'memory');
      persistLanguagePreference('en', SHARE_LANG_KEY, 'memory');
      vi.stubGlobal('localStorage', undefined);
      vi.stubGlobal('navigator', { language: 'zh-TW' });

      const config = startInterceptors({ headers: {} } as any);

      expect(config.headers?.[FASTGPT_SHARE_LANGUAGE_HEADER]).toBe('en');
      expect(config.headers?.[FASTGPT_LANGUAGE_HEADER]).toBeUndefined();
    });
  });

  describe('web request header', () => {
    it('adds the Web header to requests even without language headers', () => {
      const config = startInterceptors({ headers: {}, method: 'GET' } as any);

      expect(config.headers?.[FASTGPT_WEB_REQUEST_HEADER]).toBe(FASTGPT_WEB_REQUEST_VALUE);
    });
  });
  describe('raw request body', () => {
    it('should send File without mutating its readonly properties', async () => {
      const file = new File(['skill package'], 'skill.zip', { type: 'application/octet-stream' });
      const requestSpy = vi.spyOn(instance, 'request').mockResolvedValue({
        data: { code: 200, data: 'skill-id', message: 'success' }
      });

      await expect(
        POST('/core/ai/skill/import?filename=skill.zip', file, {
          headers: { 'Content-Type': 'application/octet-stream' }
        })
      ).resolves.toBe('skill-id');

      expect(requestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: file,
          method: 'POST'
        })
      );
    });
  });

  describe('checkMaxQuantity', () => {
    it('should return empty object when maxQuantity is not set', () => {
      const result = checkMaxQuantity({ url: 'test', maxQuantity: undefined });
      expect(result).toEqual({});
    });

    it('should handle first request', () => {
      const cancelToken = new AbortController();
      const result = checkMaxQuantity({ url: 'test', maxQuantity: 2, cancelToken });
      expect(result.id).toBeDefined();
      expect(result.abortSignal).toBe(cancelToken.signal);
      expect(maxQuantityMap['test']?.length).toBe(1);
    });

    it('should cancel oldest request when maxQuantity exceeded', () => {
      const result1 = checkMaxQuantity({ url: 'test', maxQuantity: 2 });
      checkMaxQuantity({ url: 'test', maxQuantity: 2 });
      checkMaxQuantity({ url: 'test', maxQuantity: 2 });

      expect(maxQuantityMap['test']?.length).toBe(2);
      expect(maxQuantityMap['test']?.find((item) => item.id === result1.id)).toBeUndefined();
    });
  });

  describe('requestFinish', () => {
    it('should remove finished request', () => {
      const { id } = checkMaxQuantity({ url: 'test', maxQuantity: 2 });
      requestFinish({ signId: id, url: 'test' });
      expect(maxQuantityMap['test']).toBeUndefined();
    });

    it('should handle non-existent request', () => {
      requestFinish({ signId: 'non-existent', url: 'test' });
      expect(maxQuantityMap['test']).toBeUndefined();
    });
  });

  describe('checkRes', () => {
    it('should return data for successful response', () => {
      const response = { code: 200, data: 'test data', message: 'success' };
      expect(checkRes(response)).toBe('test data');
    });

    it('should reject for error response', async () => {
      const response = { code: 400, data: null, message: 'error' };
      await expect(checkRes(response)).rejects.toEqual(response);
    });

    it('should reject for undefined response', async () => {
      // @ts-expect-error 验证运行时收到非法空响应时的处理。
      await expect(checkRes(undefined)).rejects.toBe('服务器异常');
    });
  });

  describe('responseError', () => {
    it('suppresses concurrent token errors during intentional logout', async () => {
      mockLocation.pathname = '/dashboard';
      beginLogout();
      const err = {
        response: {
          data: {
            code: tokenErrorCode
          }
        }
      };

      await expect(responseError(err)).rejects.toBeInstanceOf(ToastHandledError);
      expect(dispatchEventMock).not.toHaveBeenCalled();
      expect(clearToken).not.toHaveBeenCalled();
      expect(mockLocation.replace).not.toHaveBeenCalled();
    });

    it('should handle token error for non-outlink page', async () => {
      mockLocation.pathname = '/dashboard';
      const err = {
        response: {
          data: {
            code: tokenErrorCode
          }
        }
      };
      await expect(responseError(err)).rejects.toEqual({ message: 'common:unauth_token' });
      expect(dispatchEventMock).toHaveBeenCalledWith(expect.any(CustomEvent));
      expect(dispatchEventMock.mock.calls[0]?.[0].type).toBe(AUTH_ERROR_EVENT_NAME);
      expect(clearToken).toHaveBeenCalled();
      expect(mockLocation.replace).toHaveBeenCalledWith('http://test.com');
    });

    it('should allow auth error listeners to skip clearing token', async () => {
      mockLocation.pathname = '/dashboard';
      dispatchEventMock.mockImplementation((event: CustomEvent) => {
        event.detail.skipClearToken = true;
        return true;
      });
      const err = {
        response: {
          data: {
            code: tokenErrorCode
          }
        }
      };

      await expect(responseError(err)).rejects.toEqual({ message: 'common:unauth_token' });

      expect(clearToken).not.toHaveBeenCalled();
      expect(mockLocation.replace).toHaveBeenCalledWith('http://test.com');
    });

    it('should allow auth error listeners to skip redirect', async () => {
      mockLocation.pathname = '/dashboard';
      dispatchEventMock.mockImplementation((event: CustomEvent) => {
        event.detail.skipClearToken = true;
        event.detail.skipRedirect = true;
        return true;
      });
      const err = {
        response: {
          data: {
            code: tokenErrorCode
          }
        }
      };

      await expect(responseError(err)).rejects.toEqual({ message: 'common:unauth_token' });

      expect(clearToken).not.toHaveBeenCalled();
      expect(mockLocation.replace).not.toHaveBeenCalled();
    });

    it('should handle token error for outlink page', async () => {
      mockLocation.pathname = '/test-route/chat/share';
      const err = {
        response: {
          data: {
            code: tokenErrorCode
          }
        }
      };
      await expect(responseError(err)).rejects.toEqual({ message: 'common:unauth_token' });
      expect(clearToken).not.toHaveBeenCalled();
      expect(mockLocation.replace).not.toHaveBeenCalled();
    });

    it('should dispatch auth error without redirecting on chat page', async () => {
      mockLocation.pathname = '/test-route/chat';
      const err = {
        response: {
          data: {
            code: tokenErrorCode
          }
        }
      };

      await expect(responseError(err)).rejects.toEqual({ message: 'common:unauth_token' });

      expect(dispatchEventMock).toHaveBeenCalledWith(expect.any(CustomEvent));
      expect(dispatchEventMock.mock.calls[0]?.[0].type).toBe(AUTH_ERROR_EVENT_NAME);
      expect(clearToken).not.toHaveBeenCalled();
      expect(mockLocation.replace).not.toHaveBeenCalled();
    });

    it('should handle team error', async () => {
      const err = { response: { data: { statusText: TeamErrEnum.aiPointsNotEnough } } };
      await expect(responseError(err)).rejects.toEqual({
        statusText: TeamErrEnum.aiPointsNotEnough
      });
    });

    it('should handle string error', async () => {
      await expect(responseError('error message')).rejects.toEqual({ message: 'error message' });
    });

    it('should handle undefined error', async () => {
      await expect(responseError(undefined)).rejects.toEqual({ message: '出现了点意外~' });
    });

    it('should handle string data error', async () => {
      const err = { response: { data: 'error string' } };
      await expect(responseError(err)).rejects.toBe('error string');
    });
  });
});

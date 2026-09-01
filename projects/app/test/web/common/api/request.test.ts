import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  maxQuantityMap,
  deduplicatedRequestMap,
  checkMaxQuantity,
  requestFinish,
  checkRes,
  responseError,
  AUTH_ERROR_EVENT_NAME,
  GET,
  POST,
  instance,
  startInterceptors
} from '../../../../src/web/common/api/request';
import {
  FASTGPT_LANGUAGE_HEADER,
  FASTGPT_SHARE_LANGUAGE_HEADER
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
  pathname: '/test',
  replace: vi.fn(),
  search: ''
};
const dispatchEventMock = vi.fn();
const tokenErrorCode = Number(Object.keys(TOKEN_ERROR_CODE)[0]);

vi.stubGlobal('window', {
  location: mockLocation,
  dispatchEvent: dispatchEventMock
});
vi.stubGlobal('location', mockLocation);

describe('request utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(maxQuantityMap).forEach((key) => delete maxQuantityMap[key]);
    deduplicatedRequestMap.clear();
    resetLogoutState();
    mockLocation.pathname = '/test';
    dispatchEventMock.mockReturnValue(true);
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
      expect(requestSpy).toHaveBeenCalledTimes(1);

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

import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  maxQuantityMap,
  checkMaxQuantity,
  requestFinish,
  checkRes,
  responseError,
  clearAuthRedirecting
} from '../../../../src/web/common/api/request';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { TOKEN_ERROR_CODE } from '@fastgpt/global/common/error/errorCode';
import { clearToken } from '@/web/support/user/auth';
import { WORKFLOW_AUTH_INVALID_EVENT } from '@/web/core/workflow/localDraft';

// Mock all required dependencies
vi.mock('@fastgpt/web/common/system/utils', () => ({
  getWebReqUrl: vi.fn((url: string) => url),
  subRoute: '/test-route' // Add subRoute mock
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
const sessionStorageMap = new Map<string, string>();
const mockSessionStorage = {
  getItem: vi.fn((key: string) => sessionStorageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    sessionStorageMap.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    sessionStorageMap.delete(key);
  })
};
const mockHistory = {
  state: {},
  replaceState: vi.fn()
};
const mockDispatchEvent = vi.fn();

vi.stubGlobal('window', {
  location: mockLocation,
  sessionStorage: mockSessionStorage,
  history: mockHistory,
  dispatchEvent: mockDispatchEvent
});

describe('request utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMap.clear();
    clearAuthRedirecting();
    Object.keys(maxQuantityMap).forEach((key) => delete maxQuantityMap[key]);
    mockLocation.pathname = '/test';
    mockLocation.search = '';
  });

  describe('checkMaxQuantity', () => {
    it('should return empty object when maxQuantity is not set', () => {
      const result = checkMaxQuantity({ url: 'test', maxQuantity: undefined });
      expect(result).toEqual({});
    });

    it('should handle first request', () => {
      const result = checkMaxQuantity({ url: 'test', maxQuantity: 2 });
      expect(result.id).toBeDefined();
      expect(result.abortSignal).toBeDefined();
      expect(maxQuantityMap['test']?.length).toBe(1);
    });

    it('should cancel oldest request when maxQuantity exceeded', () => {
      const result1 = checkMaxQuantity({ url: 'test', maxQuantity: 2 });
      const result2 = checkMaxQuantity({ url: 'test', maxQuantity: 2 });
      const result3 = checkMaxQuantity({ url: 'test', maxQuantity: 2 });

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
    it('should handle token error for non-outlink page', async () => {
      mockLocation.pathname = '/dashboard';
      const err = {
        response: {
          data: {
            code: Object.values(TOKEN_ERROR_CODE)[0]
          }
        }
      };
      await expect(responseError(err)).rejects.toEqual({
        code: Object.values(TOKEN_ERROR_CODE)[0]
      });
    });

    it('should handle token error for outlink page', async () => {
      mockLocation.pathname = '/test-route/chat/share';
      const err = {
        response: {
          data: {
            code: Object.values(TOKEN_ERROR_CODE)[0]
          }
        }
      };
      await expect(responseError(err)).rejects.toEqual({
        code: Object.values(TOKEN_ERROR_CODE)[0]
      });
    });

    it('should cache workflow draft event and redirect to login once for real token error', async () => {
      mockLocation.pathname = '/app/detail';
      mockLocation.search = '?appId=app1&currentTab=appEdit';
      const err = {
        response: {
          data: {
            code: 403
          }
        }
      };

      await expect(responseError(err)).rejects.toEqual({
        message: 'Unauthorized token'
      });

      expect(mockDispatchEvent.mock.calls[0]?.[0]?.type).toBe(WORKFLOW_AUTH_INVALID_EVENT);
      expect(clearToken).toHaveBeenCalledTimes(1);
      expect(mockHistory.replaceState).toHaveBeenCalledWith(
        mockHistory.state,
        '',
        '/login?lastRoute=%2Fapp%2Fdetail%3FappId%3Dapp1%26currentTab%3DappEdit'
      );
      expect(mockLocation.replace).toHaveBeenCalledWith(
        '/login?lastRoute=%2Fapp%2Fdetail%3FappId%3Dapp1%26currentTab%3DappEdit'
      );

      await expect(responseError(err)).rejects.toEqual({
        message: 'Unauthorized token'
      });

      expect(clearToken).toHaveBeenCalledTimes(1);
      expect(mockLocation.replace).toHaveBeenCalledTimes(1);
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
      await expect(responseError(undefined)).rejects.toEqual({ message: '未知错误' });
    });

    it('should handle string data error', async () => {
      const err = { response: { data: 'error string' } };
      await expect(responseError(err)).rejects.toBe('error string');
    });
  });
});

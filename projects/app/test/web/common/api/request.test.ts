import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  maxQuantityMap,
  checkMaxQuantity,
  requestFinish,
  checkRes,
  responseError,
  AUTH_ERROR_EVENT_NAME
} from '../../../../src/web/common/api/request';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { TOKEN_ERROR_CODE } from '@fastgpt/global/common/error/errorCode';
import { clearToken } from '@/web/support/user/auth';

// Mock all required dependencies
vi.mock('@fastgpt/web/common/system/utils', () => ({
  getWebReqUrl: vi.fn().mockReturnValue('http://test.com'),
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
    mockLocation.pathname = '/test';
    dispatchEventMock.mockReturnValue(true);
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

import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  maxQuantityMap,
  checkMaxQuantity,
  requestFinish,
  checkRes,
  responseError
} from '../../../../src/web/common/api/request';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { TOKEN_ERROR_CODE } from '@fastgpt/global/common/error/errorCode';

// Mock all required dependencies
vi.mock('@fastgpt/web/common/system/utils', () => ({
  getWebReqUrl: vi.fn().mockReturnValue('http://test.com'),
  subRoute: '/test-route' // Add subRoute mock
}));

vi.mock('@/web/support/user/auth', () => ({
  clearToken: vi.fn()
}));

vi.mock('../system/useSystemStore', () => ({
  useSystemStore: {
    getState: vi.fn().mockReturnValue({
      setNotSufficientModalType: vi.fn()
    })
  }
}));

vi.mock('@fastgpt/web/i18n/utils', () => ({
  i18nT: vi.fn().mockReturnValue('Unauthorized token')
}));

// Mock window.location
const mockLocation = {
  pathname: '/test',
  replace: vi.fn(),
  search: ''
};

vi.stubGlobal('window', {
  location: mockLocation
});

describe('request utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(maxQuantityMap).forEach((key) => delete maxQuantityMap[key]);
    mockLocation.pathname = '/test';
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

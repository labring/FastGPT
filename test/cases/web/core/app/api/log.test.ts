import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the request module BEFORE importing the API module
vi.mock('@/web/common/api/request', () => {
  return {
    POST: vi.fn(),
    GET: vi.fn()
  };
});

import { POST, GET } from '@/web/common/api/request';
// Now import logApi, which will use the mocked POST/GET
import * as logApi from '@/web/core/app/api/log';

describe('logApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateLogKeys', () => {
    it('should call POST with correct url and data', () => {
      const data = { key: 'value' };
      logApi.updateLogKeys(data as any);
      expect(POST).toHaveBeenCalledWith('/core/app/logs/updateLogKeys', data);
    });
  });

  describe('getLogKeys', () => {
    it('should call GET with correct url and data', () => {
      const data = { appId: 'test-app' };
      logApi.getLogKeys(data as any);
      expect(GET).toHaveBeenCalledWith('/core/app/logs/getLogKeys', data);
    });
  });

  describe('getAppChatLogs', () => {
    it('should call POST with correct url, data and options', () => {
      const data = { appId: 'test-app', page: 1, pageSize: 10 };
      logApi.getAppChatLogs(data as any);
      expect(POST).toHaveBeenCalledWith('/core/app/logs/list', data, { maxQuantity: 1 });
    });
  });

  describe('getAppTotalData', () => {
    it('should call GET with correct url and data', () => {
      const data = { appId: 'test-app' };
      logApi.getAppTotalData(data as any);
      expect(GET).toHaveBeenCalledWith('/proApi/core/app/logs/getTotalData', data);
    });
  });

  describe('getAppChartData', () => {
    it('should call POST with correct url and data', () => {
      const data = { appId: 'test-app', range: '7d' };
      logApi.getAppChartData(data as any);
      expect(POST).toHaveBeenCalledWith('/proApi/core/app/logs/getChartData', data);
    });
  });

  describe('getLogUsers', () => {
    it('should call POST with correct url and data', () => {
      const data = { appId: 'test-app', page: 1, pageSize: 10 };
      logApi.getLogUsers(data as any);
      expect(POST).toHaveBeenCalledWith('/core/app/logs/getUsers', data);
    });
  });
});

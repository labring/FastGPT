import { describe, expect, it, vi } from 'vitest';
import {
  getAppChatLogs,
  getAppChartData,
  getAppTotalData,
  getLogKeys,
  updateLogKeys
} from '@/web/core/app/api/log';
import { GET, POST } from '@/web/common/api/request';

vi.mock('@/web/common/api/request', () => ({
  GET: vi.fn(),
  POST: vi.fn()
}));

describe('log api', () => {
  it('should call updateLogKeys correctly', async () => {
    const data = {
      appId: 'test-app',
      logKeys: ['key1', 'key2']
    };

    await updateLogKeys(data);

    expect(POST).toHaveBeenCalledWith('/core/app/logs/updateLogKeys', data);
  });

  it('should call getLogKeys correctly', async () => {
    const data = {
      appId: 'test-app'
    };

    await getLogKeys(data);

    expect(GET).toHaveBeenCalledWith('/core/app/logs/getLogKeys', data);
  });

  it('should call getAppChatLogs correctly', async () => {
    const data = {
      appId: 'test-app',
      pageNum: 1,
      pageSize: 10
    };

    await getAppChatLogs(data);

    expect(POST).toHaveBeenCalledWith('/core/app/getChatLogs', data, { maxQuantity: 1 });
  });

  it('should call getAppTotalData correctly', async () => {
    const data = {
      appId: 'test-app',
      startTime: '2023-01-01',
      endTime: '2023-12-31'
    };

    await getAppTotalData(data);

    expect(GET).toHaveBeenCalledWith('/proApi/core/app/logs/getTotalData', data);
  });

  it('should call getAppChartData correctly', async () => {
    const data = {
      appId: 'test-app',
      startTime: '2023-01-01',
      endTime: '2023-12-31',
      type: 'daily'
    };

    await getAppChartData(data);

    expect(POST).toHaveBeenCalledWith('/proApi/core/app/logs/getChartData', data);
  });
});

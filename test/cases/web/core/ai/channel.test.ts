import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  GET,
  POST,
  PUT,
  DELETE,
  responseSuccess,
  checkRes,
  responseError,
  getChannelList,
  getChannelProviders,
  postCreateChannel,
  putChannelStatus,
  putChannel,
  deleteChannel,
  getChannelLog,
  getLogDetail,
  getDashboardV2,
  instance
} from '@/web/core/ai/channel';
import axios from 'axios';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      request: vi.fn(),
      interceptors: {
        response: {
          use: vi.fn()
        }
      }
    }))
  }
}));

vi.mock('@fastgpt/web/common/system/utils', () => ({
  getWebReqUrl: () => 'http://localhost:3000'
}));

describe('channel api', () => {
  const mockAxiosInstance = axios.create();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle successful response', () => {
    const response = {
      data: {
        success: true,
        data: { test: 'data' }
      }
    };
    expect(responseSuccess(response)).toBe(response);
  });

  it('should check response data', async () => {
    const validData = {
      success: true,
      message: 'ok',
      data: { test: 'data' }
    };
    await expect(Promise.resolve(checkRes(validData))).resolves.toEqual({ test: 'data' });

    const invalidData = {
      success: false,
      message: 'error'
    };
    await expect(Promise.resolve(checkRes(invalidData))).rejects.toEqual(invalidData);

    await expect(Promise.resolve(checkRes(undefined))).rejects.toBe('服务器异常');
  });

  it('should handle response error', async () => {
    await expect(responseError('test error')).rejects.toEqual({
      message: 'test error'
    });

    await expect(responseError({ response: { data: 'error data' } })).rejects.toBe('error data');

    await expect(responseError(undefined)).rejects.toEqual({
      message: '未知错误'
    });
  });

  it('should make GET request', async () => {
    vi.spyOn(instance, 'request').mockResolvedValueOnce({
      data: {
        success: true,
        data: { result: 'test' }
      }
    });

    const result = await GET('/test');
    expect(result).toEqual({ result: 'test' });
  });

  it('should make POST request', async () => {
    vi.spyOn(instance, 'request').mockResolvedValueOnce({
      data: {
        success: true,
        data: { id: 1 }
      }
    });

    const result = await POST('/test', { name: 'test' });
    expect(result).toEqual({ id: 1 });
  });

  it('should get channel list', async () => {
    vi.spyOn(instance, 'request').mockResolvedValueOnce({
      data: {
        success: true,
        data: { channels: [], total: 0 }
      }
    });

    const result = await getChannelList();
    expect(result).toEqual({ channels: [], total: 0 });
  });

  it('should get channel providers', async () => {
    const mockProviders = {
      1: {
        defaultBaseUrl: 'test.com',
        keyHelp: 'help',
        name: 'Test Provider'
      }
    };

    vi.spyOn(instance, 'request').mockResolvedValueOnce({
      data: {
        success: true,
        data: mockProviders
      }
    });

    const result = await getChannelProviders();
    expect(result).toEqual(mockProviders);
  });

  it('should create channel', async () => {
    vi.spyOn(instance, 'request').mockResolvedValueOnce({
      data: {
        success: true,
        data: { id: 1 }
      }
    });

    const result = await postCreateChannel({
      type: 1,
      name: 'test',
      base_url: 'test.com',
      models: [],
      model_mapping: {},
      key: 'key'
    });

    expect(result).toEqual({ id: 1 });
  });

  it('should update channel status', async () => {
    vi.spyOn(instance, 'request').mockResolvedValueOnce({
      data: {
        success: true,
        data: true
      }
    });

    const result = await putChannelStatus(1, 'active');
    expect(result).toBe(true);
  });

  it('should update channel', async () => {
    vi.spyOn(instance, 'request').mockResolvedValueOnce({
      data: {
        success: true,
        data: { id: 1 }
      }
    });

    const result = await putChannel({
      id: 1,
      type: 1,
      name: 'test',
      base_url: 'test.com',
      models: [],
      model_mapping: {},
      key: 'key',
      status: 'active'
    });

    expect(result).toEqual({ id: 1 });
  });

  it('should delete channel', async () => {
    vi.spyOn(instance, 'request').mockResolvedValueOnce({
      data: {
        success: true,
        data: true
      }
    });

    const result = await deleteChannel(1);
    expect(result).toBe(true);
  });

  it('should get channel logs', async () => {
    vi.spyOn(instance, 'request').mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          logs: [],
          total: 0
        }
      }
    });

    const result = await getChannelLog({
      start_timestamp: 0,
      end_timestamp: 1000,
      offset: 0,
      pageSize: 10
    });

    expect(result).toEqual({
      list: [],
      total: 0
    });
  });

  it('should get log detail', async () => {
    vi.spyOn(instance, 'request').mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          request_body: '{}',
          response_body: '{}'
        }
      }
    });

    const result = await getLogDetail(1);
    expect(result).toEqual({
      request_body: '{}',
      response_body: '{}'
    });
  });

  it('should get dashboard data', async () => {
    vi.spyOn(instance, 'request').mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            timestamp: 1000,
            summary: []
          }
        ]
      }
    });

    const result = await getDashboardV2({
      start_timestamp: 0,
      end_timestamp: 1000,
      timespan: 'minute'
    });

    expect(result).toEqual([
      {
        timestamp: 1000,
        summary: []
      }
    ]);
  });
});

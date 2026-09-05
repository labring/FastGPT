import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  useResponseInterceptor: vi.fn()
}));

vi.mock('axios', () => ({
  default: {
    create: () => ({
      interceptors: { response: { use: mocks.useResponseInterceptor } },
      request: mocks.request
    })
  }
}));

vi.mock('@fastgpt/web/common/system/utils', () => ({
  getWebReqUrl: (path: string) => `/base${path}`
}));

vi.mock('@fastgpt/global/common/i18n/utils', () => ({
  i18nT: (key: string) => key
}));

import { postCreateChannel, putChannel } from '@/web/core/ai/channel';

const channelInput = {
  type: 1,
  name: ' Existing channel ',
  base_url: 'https://example.com/v1',
  key: 'secret',
  models: ['model-a'],
  model_mapping: {}
};

describe('postCreateChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a duplicate trimmed channel name before creating anything', async () => {
    mocks.request.mockResolvedValueOnce({
      data: {
        success: true,
        data: [{ id: 1, name: 'Existing channel', created_at: 1 }]
      }
    });

    await expect(postCreateChannel(channelInput)).rejects.toBe(
      'config_model:channel_name_duplicate'
    );

    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledWith({
      baseURL: '/base/api/aiproxy/api',
      url: '/channels/all',
      method: 'GET',
      data: undefined,
      params: {}
    });
  });

  it('trims a unique name and submits the canonical create payload', async () => {
    mocks.request
      .mockResolvedValueOnce({ data: { success: true, data: [] } })
      .mockResolvedValueOnce({ data: { success: true, data: { id: 2 } } });

    await expect(postCreateChannel(channelInput)).resolves.toEqual({ id: 2 });

    expect(mocks.request).toHaveBeenNthCalledWith(2, {
      baseURL: '/base/api/aiproxy/api',
      url: '/createChannel',
      method: 'POST',
      data: {
        type: 1,
        name: 'Existing channel',
        base_url: 'https://example.com/v1',
        models: ['model-a'],
        model_mapping: {},
        key: 'secret',
        priority: 1
      },
      params: undefined
    });
  });

  it('preserves advanced channel fields during a full channel update', async () => {
    mocks.request.mockResolvedValueOnce({ data: { success: true } });

    await putChannel({
      id: 7,
      type: 1,
      name: 'Advanced channel',
      base_url: 'https://example.com/v1',
      proxy_url: 'https://proxy.example.com',
      models: ['model-a'],
      model_mapping: { alias: 'model-a' },
      configs: { region: 'us-west' },
      key: 'secret',
      status: 1,
      priority: 0,
      sets: ['production'],
      enabled_auto_balance_check: true,
      balance_threshold: 0,
      skip_tls_verify: true,
      enabled_no_permission_ban: true,
      warn_error_rate: 0.2,
      max_error_rate: 0.5,
      created_at: 1
    });

    expect(mocks.request).toHaveBeenCalledWith({
      baseURL: '/base/api/aiproxy/api',
      url: '/channel/7',
      method: 'PUT',
      data: {
        type: 1,
        name: 'Advanced channel',
        base_url: 'https://example.com/v1',
        proxy_url: 'https://proxy.example.com',
        models: ['model-a'],
        model_mapping: { alias: 'model-a' },
        configs: { region: 'us-west' },
        key: 'secret',
        status: 1,
        priority: 1,
        sets: ['production'],
        enabled_auto_balance_check: true,
        skip_tls_verify: true,
        enabled_no_permission_ban: true,
        warn_error_rate: 0.2,
        max_error_rate: 0.5
      },
      params: undefined
    });
  });

  it('rejects a full update when balance threshold cannot be preserved', async () => {
    await expect(
      putChannel({
        id: 8,
        type: 1,
        name: 'Threshold channel',
        base_url: '',
        models: [],
        model_mapping: {},
        key: '',
        status: 1,
        priority: 1,
        balance_threshold: 10,
        created_at: 1
      })
    ).rejects.toThrow('cannot preserve balance_threshold for channel: 8');
    expect(mocks.request).not.toHaveBeenCalled();
  });
});

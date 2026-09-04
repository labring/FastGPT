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

import { postCreateChannel } from '@/web/core/ai/channel';

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
      params: { page: 1, perPage: 1000 }
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
});

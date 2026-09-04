import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  getAIProxyAdminConfig: vi.fn()
}));

vi.mock('../../../common/api/axios', () => ({
  axiosWithoutSSRF: { get: mocks.get, put: mocks.put }
}));
vi.mock('../../../thirdProvider/aiproxy/config', () => ({
  getAIProxyAdminConfig: mocks.getAIProxyAdminConfig
}));

import {
  appendModelsToAIProxyChannels,
  getAdminAIProxyChannelItems,
  getAIProxyChannelList,
  removeModelsFromAIProxyChannels,
  replaceModelInAIProxyChannels
} from '../../../thirdProvider/aiproxy/channel';

const channels = [
  {
    id: 1,
    type: 1,
    name: 'channel-1',
    base_url: 'https://example.com/v1',
    key: 'secret',
    status: 1,
    priority: 2,
    model_mapping: {},
    models: ['existing-model']
  },
  {
    id: 2,
    type: 1,
    name: 'channel-2',
    models: []
  }
];

describe('appendModelsToAIProxyChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAIProxyAdminConfig.mockReturnValue({
      baseUrl: 'https://aiproxy.example.com',
      token: 'admin-token'
    });
    mocks.get.mockResolvedValue({ data: { success: true, data: channels } });
    mocks.put.mockResolvedValue({ data: { success: true } });
    global.aiproxyChannelsCache = [
      {
        channelId: 1,
        name: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
        avatar: 'model/openai'
      }
    ];
  });

  it('returns the validated channel snapshot for server-side aggregation', async () => {
    await expect(getAIProxyChannelList()).resolves.toEqual(channels);
    expect(mocks.get).toHaveBeenCalledWith('https://aiproxy.example.com/api/channels/all', {
      headers: { Authorization: 'Bearer admin-token' },
      params: { page: 1, perPage: 1000 }
    });
  });

  it('formats and sorts channels for administrator model views', async () => {
    mocks.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { ...channels[0], id: 3, status: 2, priority: 10, created_at: 100 },
          { ...channels[0], id: 2, status: 1, priority: 1, created_at: 300 },
          { ...channels[0], id: 1, type: 9, status: 1, priority: 5, created_at: 200 }
        ]
      }
    });

    const result = await getAdminAIProxyChannelItems();

    expect(result.map((item) => item.summary.id)).toEqual([2, 1, 3]);
    expect(result[0].summary.protocol).toEqual({
      name: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
      avatar: 'model/openai'
    });
    expect(result[1].summary.protocol).toEqual({
      name: { en: '9', 'zh-CN': '9', 'zh-Hant': '9' },
      avatar: ''
    });
  });

  it('replaces the complete association set for an immutable model identifier', async () => {
    await replaceModelInAIProxyChannels({
      model: 'existing-model',
      channelIds: [2]
    });

    expect(mocks.put).toHaveBeenNthCalledWith(
      1,
      'https://aiproxy.example.com/api/channel/1',
      expect.objectContaining({ models: [] }),
      { headers: { Authorization: 'Bearer admin-token' } }
    );
    expect(mocks.put).toHaveBeenNthCalledWith(
      2,
      'https://aiproxy.example.com/api/channel/2',
      expect.objectContaining({ models: ['existing-model'] }),
      { headers: { Authorization: 'Bearer admin-token' } }
    );
  });

  it('validates every selected channel before replacing any association', async () => {
    await expect(
      replaceModelInAIProxyChannels({
        model: 'existing-model',
        channelIds: [1, 9]
      })
    ).rejects.toThrow('AI Proxy channel does not exist: 9');

    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('does not rewrite channels when the submitted association set is unchanged', async () => {
    await replaceModelInAIProxyChannels({
      model: 'existing-model',
      channelIds: [1]
    });

    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('accepts the null model mapping returned by AI Proxy', async () => {
    mocks.get.mockResolvedValue({
      data: {
        success: true,
        data: [{ ...channels[0], model_mapping: null }]
      }
    });

    await replaceModelInAIProxyChannels({
      model: 'existing-model',
      channelIds: [1]
    });

    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('deduplicates models and updates requested channels in order', async () => {
    await appendModelsToAIProxyChannels({
      channelIds: [1, 1, 2],
      models: ['new-model', 'new-model']
    });

    expect(mocks.get).toHaveBeenCalledWith('https://aiproxy.example.com/api/channels/all', {
      headers: { Authorization: 'Bearer admin-token' },
      params: { page: 1, perPage: 1000 }
    });
    expect(mocks.put).toHaveBeenNthCalledWith(
      1,
      'https://aiproxy.example.com/api/channel/1',
      expect.objectContaining({ models: ['existing-model', 'new-model'] }),
      { headers: { Authorization: 'Bearer admin-token' } }
    );
    expect(mocks.put).toHaveBeenNthCalledWith(
      2,
      'https://aiproxy.example.com/api/channel/2',
      expect.objectContaining({ models: ['new-model'] }),
      { headers: { Authorization: 'Bearer admin-token' } }
    );
  });

  it('does not require AI Proxy configuration when no association is requested', async () => {
    await appendModelsToAIProxyChannels({ channelIds: [], models: ['new-model'] });

    expect(mocks.getAIProxyAdminConfig).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('validates every requested channel before writing any channel', async () => {
    await expect(
      appendModelsToAIProxyChannels({ channelIds: [1, 9], models: ['new-model'] })
    ).rejects.toThrow('AI Proxy channel does not exist: 9');

    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('stops after the first failed channel update without compensating it', async () => {
    mocks.put.mockRejectedValueOnce(new Error('update failed'));

    await expect(
      appendModelsToAIProxyChannels({ channelIds: [1, 2], models: ['new-model'] })
    ).rejects.toThrow('update failed');

    expect(mocks.put).toHaveBeenCalledTimes(1);
  });
});

describe('removeModelsFromAIProxyChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAIProxyAdminConfig.mockReturnValue({
      baseUrl: 'https://aiproxy.example.com',
      token: 'admin-token'
    });
    mocks.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { ...channels[0], models: ['delete-a', 'keep', 'delete-b', 'delete-a'] },
          { ...channels[1], models: ['keep'] }
        ]
      }
    });
    mocks.put.mockResolvedValue({ data: { success: true } });
  });

  it('removes every requested model occurrence and only updates affected channels', async () => {
    await removeModelsFromAIProxyChannels({ models: ['delete-a', 'delete-b', 'delete-a'] });

    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.put).toHaveBeenCalledWith(
      'https://aiproxy.example.com/api/channel/1',
      expect.objectContaining({ models: ['keep'] }),
      { headers: { Authorization: 'Bearer admin-token' } }
    );
  });

  it('does not require AI Proxy configuration for an empty model set', async () => {
    await removeModelsFromAIProxyChannels({ models: [] });

    expect(mocks.getAIProxyAdminConfig).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('stops on the first failed channel update without compensation', async () => {
    mocks.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { ...channels[0], id: 1, models: ['delete-a'] },
          { ...channels[0], id: 2, models: ['delete-a'] }
        ]
      }
    });
    mocks.put.mockRejectedValueOnce(new Error('update failed'));

    await expect(removeModelsFromAIProxyChannels({ models: ['delete-a'] })).rejects.toThrow(
      'update failed'
    );

    expect(mocks.put).toHaveBeenCalledTimes(1);
  });
});

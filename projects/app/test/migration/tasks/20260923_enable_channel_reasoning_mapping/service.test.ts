import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  getAIProxyAdminConfig: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axiosWithoutSSRF: { get: mocks.get, put: mocks.put }
}));
vi.mock('@fastgpt/service/thirdProvider/aiproxy/config', () => ({
  getAIProxyAdminConfig: mocks.getAIProxyAdminConfig
}));

import { mergeAIProxyChannelConfigs } from '@/migration/tasks/20260923_enable_channel_reasoning_mapping/service';

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
    proxy_url: 'https://proxy.example.com',
    configs: { region: 'us-west' },
    sets: ['default'],
    enabled_auto_balance_check: true,
    balance_threshold: 0,
    skip_tls_verify: true,
    enabled_no_permission_ban: true,
    warn_error_rate: 0.2,
    max_error_rate: 0.5,
    models: ['existing-model']
  },
  {
    id: 2,
    type: 1,
    name: 'channel-2',
    models: []
  }
];

describe('mergeAIProxyChannelConfigs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAIProxyAdminConfig.mockReturnValue({
      baseUrl: 'https://aiproxy.example.com',
      token: 'admin-token'
    });
    mocks.put.mockResolvedValue({ data: { success: true } });
  });

  it('merges config into only the selected channel type and verifies the result', async () => {
    const openAIWithoutConfig = { ...channels[1], type: 1 };
    const otherChannel = { ...channels[0], id: 3, type: 14 };
    const sourceChannels = [channels[0], openAIWithoutConfig, otherChannel];
    const verifiedChannels = [
      {
        ...channels[0],
        configs: { region: 'us-west', map_reasoning_to_reasoning_content: true }
      },
      {
        ...openAIWithoutConfig,
        configs: { map_reasoning_to_reasoning_content: true }
      },
      otherChannel
    ];
    mocks.get
      .mockResolvedValueOnce({ data: { success: true, data: sourceChannels } })
      .mockResolvedValueOnce({ data: { success: true, data: verifiedChannels } });
    const beforeUpdate = vi.fn(async () => undefined);

    await expect(
      mergeAIProxyChannelConfigs({
        channelTypes: [1],
        configPatch: { map_reasoning_to_reasoning_content: true },
        beforeUpdate
      })
    ).resolves.toEqual({ channelCount: 2, updatedCount: 2 });

    expect(mocks.put).toHaveBeenCalledTimes(2);
    expect(mocks.put).toHaveBeenNthCalledWith(
      1,
      'https://aiproxy.example.com/api/channel/1',
      expect.objectContaining({
        configs: { region: 'us-west', map_reasoning_to_reasoning_content: true },
        models: ['existing-model']
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(mocks.put).toHaveBeenNthCalledWith(
      2,
      'https://aiproxy.example.com/api/channel/2',
      expect.objectContaining({ configs: { map_reasoning_to_reasoning_content: true } }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(beforeUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it('is idempotent when every matching channel already has the requested config', async () => {
    const configuredChannels = [
      {
        ...channels[0],
        configs: { region: 'us-west', map_reasoning_to_reasoning_content: true }
      },
      {
        ...channels[1],
        configs: { map_reasoning_to_reasoning_content: true }
      }
    ];
    mocks.get.mockResolvedValue({ data: { success: true, data: configuredChannels } });

    await expect(
      mergeAIProxyChannelConfigs({
        channelTypes: [1],
        configPatch: { map_reasoning_to_reasoning_content: true },
        beforeUpdate: vi.fn(async () => undefined)
      })
    ).resolves.toEqual({ channelCount: 2, updatedCount: 0 });

    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('validates every target channel before writing any config', async () => {
    mocks.get.mockResolvedValue({
      data: {
        success: true,
        data: [channels[0], { ...channels[1], balance_threshold: 10 }]
      }
    });

    await expect(
      mergeAIProxyChannelConfigs({
        channelTypes: [1],
        configPatch: { map_reasoning_to_reasoning_content: true },
        beforeUpdate: vi.fn(async () => undefined)
      })
    ).rejects.toThrow('cannot preserve balance_threshold for channel: 2');

    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('fails completion validation when any matching channel remains unconfigured', async () => {
    mocks.get.mockResolvedValue({ data: { success: true, data: [channels[0]] } });

    await expect(
      mergeAIProxyChannelConfigs({
        channelTypes: 1,
        configPatch: { map_reasoning_to_reasoning_content: true },
        beforeUpdate: vi.fn(async () => undefined)
      })
    ).rejects.toThrow('1 AI Proxy channels of type 1 still require config updates');
  });
});

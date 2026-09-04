import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  getAdminAIProxyChannelItems: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));
vi.mock('@fastgpt/service/thirdProvider/aiproxy/channel', () => ({
  getAdminAIProxyChannelItems: mocks.getAdminAIProxyChannelItems
}));

import handler from '@/pages/api/admin/settings/model/list';

describe('GET /api/admin/settings/model/list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.systemModelList = [
      {
        modelId: '68ad85a7463006c963799a05',
        model: 'gpt-test',
        name: 'GPT Test',
        provider: 'OpenAI',
        scope: ModelScopeEnum.system,
        type: ModelTypeEnum.llm,
        isActive: true,
        requestAuth: 'secret',
        config: { maxContext: 128000, maxResponse: 16000, quoteMaxToken: 30000 }
      }
    ];
    global.ModelProviderRawCache = [
      {
        provider: 'OpenAI',
        value: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
        avatar: 'model/openai'
      }
    ];
    global.aiproxyChannelsCache = [
      {
        channelId: 1,
        name: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
        avatar: 'model/openai'
      }
    ];
    global.systemConfiguredDefaultModelIds = {};
    mocks.getAdminAIProxyChannelItems.mockResolvedValue([
      {
        models: ['other-model'],
        summary: {
          id: 2,
          name: 'disabled-channel',
          protocol: {
            name: { en: '9', 'zh-CN': '9', 'zh-Hant': '9' },
            avatar: ''
          },
          status: 2
        }
      },
      {
        models: ['gpt-test'],
        summary: {
          id: 1,
          name: 'enabled-channel',
          protocol: {
            name: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
            avatar: 'model/openai'
          },
          status: 1
        }
      }
    ]);
  });

  it('returns one channel snapshot enriched at model and list levels', async () => {
    const result = await handler({} as never);

    expect(mocks.authSystemAdmin).toHaveBeenCalledOnce();
    expect(mocks.getAdminAIProxyChannelItems).toHaveBeenCalledOnce();
    expect(result.channels.map((channel) => channel.name)).toEqual([
      'disabled-channel',
      'enabled-channel'
    ]);
    expect(result.models[0].channels).toEqual([result.channels[1]]);
    expect(result.models[0].requestAuth).toBeUndefined();
    expect(result.channels[1]).toEqual({
      id: 1,
      name: 'enabled-channel',
      protocol: {
        name: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
        avatar: 'model/openai'
      },
      status: 1
    });
    expect(result.channels[0].protocol).toEqual({
      name: { en: '9', 'zh-CN': '9', 'zh-Hant': '9' },
      avatar: ''
    });
  });

  it('returns an empty model and channel snapshot when neither is configured', async () => {
    global.systemModelList = [];
    mocks.getAdminAIProxyChannelItems.mockResolvedValue([]);

    const result = await handler({} as never);

    expect(result.models).toEqual([]);
    expect(result.channels).toEqual([]);
    expect(result.providers).toEqual(global.ModelProviderRawCache);
    expect(result.aiproxyChannels).toEqual(global.aiproxyChannelsCache);
  });

  it('does not hide an AIProxy channel query failure behind a partial model list', async () => {
    const error = new Error('aiproxy unavailable');
    mocks.getAdminAIProxyChannelItems.mockRejectedValue(error);

    await expect(handler({} as never)).rejects.toBe(error);
  });
});

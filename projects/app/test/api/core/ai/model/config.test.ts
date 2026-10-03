import { setModelTestSnapshot } from '@test/modelCache';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiproxyMocks = vi.hoisted(() => {
  const listAll = vi.fn();
  const group = vi.fn((_groupId: string) => ({
    channels: {
      listAll
    }
  }));

  return {
    listAll,
    group
  };
});

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  authUserPer: vi.fn(),
  findMongoAIModel: vi.fn(),
  getSystemChannelSummaryItems: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin,
  authUserPer: mocks.authUserPer
}));
vi.mock('@fastgpt/service/core/ai/channel/summary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/channel/summary')>();
  return {
    ...actual,
    getSystemChannelSummaryItems: mocks.getSystemChannelSummaryItems
  };
});
vi.mock('@fastgpt/service/thirdProvider/aiproxy/client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/thirdProvider/aiproxy/client')>();
  return {
    ...actual,
    aiProxyClient: {
      group: aiproxyMocks.group
    }
  };
});
vi.mock('@fastgpt/service/core/ai/model/schema', () => ({
  MongoAIModel: {
    find: mocks.findMongoAIModel
  }
}));

import handler from '@/pages/api/core/ai/model/config';

describe('GET /api/core/ai/model/config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  describe('channelType=system', () => {
    beforeEach(() => {
      mocks.authSystemAdmin.mockResolvedValue(undefined);
      mocks.authUserPer.mockResolvedValue({ isRoot: true, tmb: { permission: {} } });
      setModelTestSnapshot({
        models: [
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
        ],
        configuredDefaultModelIds: {}
      });
      mocks.getSystemChannelSummaryItems.mockResolvedValue([
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
      const result = (await handler({
        query: { channelType: 'system' }
      } as never)) as any;

      expect(mocks.getSystemChannelSummaryItems).toHaveBeenCalledOnce();
      expect(result.channels.map((channel: any) => channel.name)).toEqual([
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
    });

    it('returns an empty model and channel snapshot when neither is configured', async () => {
      setModelTestSnapshot({ models: [] });
      mocks.getSystemChannelSummaryItems.mockResolvedValue([]);

      const result = (await handler({
        query: { channelType: 'system' }
      } as never)) as any;

      expect(result.models).toEqual([]);
      expect(result.channels).toEqual([]);
      expect(result.providers).toEqual(global.ModelProviderRawCache);
      expect(result.aiproxyChannels).toEqual(global.aiproxyChannelsCache);
    });

    it('does not hide an AIProxy channel query failure behind a partial model list', async () => {
      const error = new Error('aiproxy unavailable');
      mocks.getSystemChannelSummaryItems.mockRejectedValue(error);

      await expect(
        handler({
          query: { channelType: 'system' }
        } as never)
      ).rejects.toBe(error);
    });
  });

  describe('channelType=team', () => {
    beforeEach(() => {
      mocks.authUserPer.mockResolvedValue({
        tmbId: 'tmb_123',
        isRoot: false
      });
      mocks.findMongoAIModel.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              _id: 'team_model_1',
              model: 'qwen-plus',
              name: 'Qwen Plus',
              provider: 'OpenAI',
              scope: ModelScopeEnum.team,
              type: ModelTypeEnum.llm,
              isActive: true,
              tmbId: 'tmb_123',
              config: { maxContext: 32000, maxResponse: 4000, quoteMaxToken: 8000 }
            }
          ])
        })
      });
      aiproxyMocks.listAll.mockResolvedValue([
        {
          id: 10,
          name: 'My Team Channel',
          models: ['qwen-plus'],
          status: 1
        }
      ]);
    });

    it('returns only the models and channels belonging to the current member', async () => {
      const result = (await handler({
        query: { channelType: 'team' }
      } as never)) as any;

      expect(mocks.authUserPer).toHaveBeenCalledOnce();
      expect(aiproxyMocks.group).toHaveBeenCalledWith('fastgpt:tmb:tmb_123');

      expect(result.models.map((m: any) => m.modelId)).toEqual(['team_model_1']);
      expect(result.models[0].model).toBe('qwen-plus');
      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].name).toBe('My Team Channel');
      expect(result.models[0].channels).toEqual([result.channels[0]]);
    });
  });
});

import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  listAllGroupChannels: vi.fn(),
  findMongoAIModel: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));
vi.mock('@fastgpt/service/core/ai/channel', () => ({
  getSystemGroupId: (tmbId: string) => `fastgpt:tmb:${tmbId}`,
  listAllGroupChannels: mocks.listAllGroupChannels
}));
vi.mock('@fastgpt/service/core/ai/config/schema', () => ({
  MongoAIModel: {
    find: mocks.findMongoAIModel
  }
}));

import handler from '@/pages/api/core/ai/model/teamModels';

describe('GET /api/core/ai/model/teamModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    global.ModelProviderRawCache = [
      {
        provider: 'OpenAI',
        value: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
        avatar: 'model/openai'
      }
    ];
    mocks.listAllGroupChannels.mockResolvedValue([
      {
        id: 10,
        name: 'My Team Channel',
        models: ['qwen-plus'],
        status: 1
      }
    ]);
  });

  it('returns only the models and channels belonging to the current member', async () => {
    const result = await handler({} as never);

    expect(mocks.authUserPer).toHaveBeenCalledOnce();
    expect(mocks.listAllGroupChannels).toHaveBeenCalledWith('fastgpt:tmb:tmb_123');

    // Only returns the model matching tmb_123, not system models or other team models
    expect(result.models.map((m) => m.modelId)).toEqual(['team_model_1']);
    expect(result.models[0].model).toBe('qwen-plus');

    expect(result.channels).toHaveLength(1);
    expect(result.channels[0].name).toBe('My Team Channel');
    expect(result.models[0].channels).toEqual([result.channels[0]]);
  });
});

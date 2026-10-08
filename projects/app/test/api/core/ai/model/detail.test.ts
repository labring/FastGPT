import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  authSystemAdmin: vi.fn(),
  findModelData: vi.fn(),
  getMemberChannelSummaryItems: vi.fn(),
  getSystemChannelSummaryItems: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer,
  authSystemAdmin: mocks.authSystemAdmin
}));
vi.mock('@fastgpt/service/core/ai/model', () => ({
  getModelHandle: async () => ({ findModelData: mocks.findModelData })
}));
vi.mock('@fastgpt/service/core/ai/channel/summary', () => ({
  getMemberChannelSummaryItems: mocks.getMemberChannelSummaryItems,
  getSystemChannelSummaryItems: mocks.getSystemChannelSummaryItems
}));

import handler from '@/pages/api/core/ai/model/detail';

const teamModel = {
  modelId: '68ad85a7463006c963799a05',
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'private-model',
  name: 'Private model',
  scope: ModelScopeEnum.team,
  tmbId: 'other-tmb',
  teamId: 'team-id',
  isActive: true,
  config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
};

const systemModel = {
  ...teamModel,
  model: 'system-model',
  name: 'System model',
  scope: ModelScopeEnum.system,
  tmbId: undefined,
  teamId: undefined,
  requestUrl: 'https://model.example.com/v1/chat/completions',
  requestAuth: 'system-secret'
};

describe('GET /api/core/ai/model/detail team ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.feConfigs = { isPlus: true } as typeof global.feConfigs;
    mocks.findModelData.mockReturnValue(teamModel);
    mocks.authUserPer.mockResolvedValue({
      tmbId: 'root-tmb',
      isRoot: true,
      tmb: { permission: {} }
    });
  });

  it('rejects root reading another member team model', async () => {
    await expect(
      handler(
        {
          query: {
            modelId: teamModel.modelId,
            channelType: 'team'
          }
        } as any,
        {} as any
      )
    ).rejects.toBe('modelUnExist');
    expect(mocks.getMemberChannelSummaryItems).not.toHaveBeenCalled();
  });

  it('rejects using team scope to read a system model before returning secret config', async () => {
    mocks.findModelData.mockReturnValue(systemModel);
    mocks.authUserPer.mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'member-tmb',
      isRoot: false,
      tmb: { permission: { hasModelCreatePer: true } }
    });

    await expect(
      handler(
        {
          query: {
            modelId: systemModel.modelId,
            channelType: 'team'
          }
        } as any,
        {} as any
      )
    ).rejects.toBe('modelUnExist');

    expect(mocks.authUserPer).toHaveBeenCalledTimes(1);
    expect(mocks.authSystemAdmin).not.toHaveBeenCalled();
    expect(mocks.getMemberChannelSummaryItems).not.toHaveBeenCalled();
    expect(mocks.getSystemChannelSummaryItems).not.toHaveBeenCalled();
  });
});

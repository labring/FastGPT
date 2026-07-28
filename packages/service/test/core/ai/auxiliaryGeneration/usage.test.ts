import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkTeamAIPoints: vi.fn(),
  createChatUsageRecord: vi.fn(),
  pushChatItemUsage: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamAIPoints: mocks.checkTeamAIPoints
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createChatUsageRecord: mocks.createChatUsageRecord,
  pushChatItemUsage: mocks.pushChatItemUsage
}));

import { createAuxiliaryGenerationUsage } from '@fastgpt/service/core/ai/auxiliaryGeneration/usage';

describe('createAuxiliaryGenerationUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkTeamAIPoints.mockResolvedValue(undefined);
    mocks.createChatUsageRecord.mockResolvedValue('new-usage-id');
  });

  it('creates a usage record associated with the edited skill', async () => {
    const result = await createAuxiliaryGenerationUsage({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      appName: 'Skill',
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill-id',
      usageSource: UsageSourceEnum.fastgpt
    });

    expect(mocks.createChatUsageRecord).toHaveBeenCalledWith({
      appName: 'Skill',
      appId: undefined,
      skillId: 'skill-id',
      teamId: 'team-id',
      tmbId: 'tmb-id',
      source: UsageSourceEnum.fastgpt
    });
    expect(result.usageId).toBe('new-usage-id');
  });

  it('reuses an ask usage id for subsequent node usage', async () => {
    const result = await createAuxiliaryGenerationUsage({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      appName: 'Skill',
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill-id',
      usageSource: UsageSourceEnum.fastgpt,
      usageId: 'existing-usage-id'
    });
    const usages = [
      {
        moduleName: 'Agent',
        model: 'gpt-4o',
        inputTokens: 10,
        outputTokens: 2,
        totalPoints: 1
      }
    ];
    result.pushUsage(usages);

    expect(mocks.createChatUsageRecord).not.toHaveBeenCalled();
    expect(mocks.pushChatItemUsage).toHaveBeenCalledWith({
      teamId: 'team-id',
      usageId: 'existing-usage-id',
      nodeUsages: usages
    });
  });
});

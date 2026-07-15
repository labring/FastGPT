import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const usageMocks = vi.hoisted(() => ({
  checkTeamAIPoints: vi.fn(),
  createChatUsageRecord: vi.fn(),
  pushChatItemUsage: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamAIPoints: usageMocks.checkTeamAIPoints
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createChatUsageRecord: usageMocks.createChatUsageRecord,
  pushChatItemUsage: usageMocks.pushChatItemUsage
}));

import { createAuxiliaryGenerationUsage } from '@fastgpt/service/core/ai/auxiliaryGeneration/usage';

describe('createAuxiliaryGenerationUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usageMocks.checkTeamAIPoints.mockResolvedValue(undefined);
    usageMocks.createChatUsageRecord.mockResolvedValue('new-usage-id');
  });

  it('creates a skill usage record for a new auxiliary generation', async () => {
    const result = await createAuxiliaryGenerationUsage({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      appName: 'Skill',
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill-id',
      usageSource: UsageSourceEnum.fastgpt
    });

    expect(usageMocks.createChatUsageRecord).toHaveBeenCalledWith({
      appName: 'Skill',
      appId: undefined,
      skillId: 'skill-id',
      teamId: 'team-id',
      tmbId: 'tmb-id',
      source: UsageSourceEnum.fastgpt
    });
    expect(result.usageId).toBe('new-usage-id');
  });

  it('reuses an interactive usage id and records later node usage against it', async () => {
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
    ] as any;
    result.pushUsage(usages);

    expect(usageMocks.createChatUsageRecord).not.toHaveBeenCalled();
    expect(result.usageId).toBe('existing-usage-id');
    expect(usageMocks.pushChatItemUsage).toHaveBeenCalledWith({
      teamId: 'team-id',
      usageId: 'existing-usage-id',
      nodeUsages: usages
    });
  });
});

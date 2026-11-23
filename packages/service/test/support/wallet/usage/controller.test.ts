import { pushChatItemUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { describe, expect, it, vi } from 'vitest';

describe('pushChatItemUsage', () => {
  it('preserves PDF page counts when workflow usage is persisted', () => {
    const pushUsageItemsHandler = vi.fn();
    global.pushUsageItemsHandler = pushUsageItemsHandler;

    pushChatItemUsage({
      teamId: 'team_1',
      usageId: 'usage_1',
      nodeUsages: [
        {
          moduleName: 'PDF enhanced parse',
          totalPoints: 12,
          pages: 3
        }
      ]
    });

    expect(pushUsageItemsHandler).toHaveBeenCalledWith({
      teamId: 'team_1',
      usageId: 'usage_1',
      list: [
        {
          moduleName: 'PDF enhanced parse',
          amount: 12,
          model: undefined,
          inputTokens: undefined,
          outputTokens: undefined,
          pages: 3
        }
      ]
    });
  });

  it('returns the underlying pushUsageItems promise so callers can await settlement dispatch', async () => {
    let resolved = false;
    global.pushUsageItemsHandler = vi.fn().mockImplementation(async () => {
      await Promise.resolve();
      resolved = true;
    });

    await pushChatItemUsage({
      teamId: 'team_1',
      usageId: 'usage_2',
      nodeUsages: [
        {
          moduleName: 'Plugin model invoke',
          modelId: 'model_1',
          totalPoints: 1.5,
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 20,
          cacheCreationTokens: 10
        }
      ]
    });

    expect(resolved).toBe(true);
    expect(global.pushUsageItemsHandler).toHaveBeenCalledWith({
      teamId: 'team_1',
      usageId: 'usage_2',
      list: [
        {
          moduleName: 'Plugin model invoke',
          amount: 1.5,
          modelId: 'model_1',
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 20,
          cacheCreationTokens: 10,
          pages: undefined
        }
      ]
    });
  });
});

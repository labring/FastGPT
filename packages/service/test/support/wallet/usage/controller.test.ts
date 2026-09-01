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
});

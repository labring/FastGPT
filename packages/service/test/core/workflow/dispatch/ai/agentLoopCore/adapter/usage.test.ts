import { agentLoopUsagesToChatNodeUsages } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/usage';
import { describe, expect, it } from 'vitest';

describe('agentLoopUsagesToChatNodeUsages', () => {
  it('preserves PDF page usage when adapting read_files billing', () => {
    expect(
      agentLoopUsagesToChatNodeUsages([
        {
          moduleName: 'read_files',
          totalPoints: 12,
          pages: 6
        }
      ])
    ).toEqual([
      {
        moduleName: 'read_files',
        totalPoints: 12,
        pages: 6
      }
    ]);
  });

  it('filters empty usage records and preserves model token fields', () => {
    expect(
      agentLoopUsagesToChatNodeUsages([
        undefined as never,
        {
          moduleName: 'agent',
          totalPoints: 2,
          modelId: 'model-id',
          inputTokens: 10,
          outputTokens: 5
        }
      ])
    ).toEqual([
      {
        moduleName: 'agent',
        totalPoints: 2,
        modelId: 'model-id',
        inputTokens: 10,
        outputTokens: 5
      }
    ]);
  });
});

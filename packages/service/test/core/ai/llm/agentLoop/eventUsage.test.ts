import { describe, expect, it } from 'vitest';
import { normalizeAgentLoopUsages } from '@fastgpt/service/core/ai/llm/agentLoop/interface';

describe('agent loop event usage helpers', () => {
  it('normalizes optional usage lists', () => {
    const usage = {
      moduleName: 'account_usage:agent_call',
      model: 'GPT-4',
      totalPoints: 1
    };
    const compressedUsage = {
      moduleName: 'account_usage:tool_response_compress',
      model: 'GPT-4',
      totalPoints: 0.2
    };

    expect(normalizeAgentLoopUsages([usage, undefined, compressedUsage])).toEqual([
      usage,
      compressedUsage
    ]);
    expect(normalizeAgentLoopUsages()).toEqual([]);
  });
});

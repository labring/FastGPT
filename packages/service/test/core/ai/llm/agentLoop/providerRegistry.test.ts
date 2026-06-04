import { describe, expect, it } from 'vitest';
import { getAgentLoopProvider } from '@fastgpt/service/core/ai/llm/agentLoop/providers/registry';

describe('agent loop provider registry', () => {
  it('resolves fastAgent as the default provider', () => {
    expect(getAgentLoopProvider().name).toBe('fastAgent');
    expect(getAgentLoopProvider('fastAgent').name).toBe('fastAgent');
  });

  it('resolves piAgent by the new provider name', () => {
    expect(getAgentLoopProvider('piAgent').name).toBe('piAgent');
  });

  it('throws for unknown providers', () => {
    expect(() => getAgentLoopProvider('unknown' as any)).toThrow('Unknown agent loop provider');
  });
});

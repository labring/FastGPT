import { replaceAgentPromptToolReferences } from '@fastgpt/service/core/workflow/dispatch/ai/agent/adapter/prompt';
import { describe, expect, it } from 'vitest';

describe('replaceAgentPromptToolReferences', () => {
  it('resolves PromptEditor combined tool ids to readable names', () => {
    expect(
      replaceAgentPromptToolReferences({
        text: 'Use {{@mcp-app_1/search@}} first, keep {{@missing@}} unchanged.',
        resolveName: (id) => (id === 'app_1/search' ? 'Search documentation' : undefined)
      })
    ).toBe('Use {{Search documentation}} first, keep {{@missing@}} unchanged.');
  });
});

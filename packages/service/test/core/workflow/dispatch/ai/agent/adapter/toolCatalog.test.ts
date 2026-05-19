import { describe, expect, it } from 'vitest';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { createWorkflowAgentLoopToolCatalog } from '@fastgpt/service/core/workflow/dispatch/ai/agent/adapter/toolCatalog';

const tool = (name: string): ChatCompletionTool => ({
  type: 'function',
  function: {
    name,
    description: `${name} description`,
    parameters: {
      type: 'object',
      properties: {}
    }
  }
});

describe('createWorkflowAgentLoopToolCatalog', () => {
  it('keeps workflow runtime tools and injects unified loop internal tools', () => {
    const catalog = createWorkflowAgentLoopToolCatalog({
      completionTools: [tool('search'), tool('dataset_search')]
    });

    expect(catalog.runtimeTools.map((item) => item.function.name)).toEqual([
      'search',
      'dataset_search'
    ]);
    expect(catalog.askTool?.function.name).toBe('ask_agent');
    expect(catalog.updatePlanTool?.function.name).toBe('update_plan');
  });

  it('supports agents without runtime tools', () => {
    const catalog = createWorkflowAgentLoopToolCatalog({
      completionTools: []
    });

    expect(catalog.runtimeTools).toEqual([]);
    expect(catalog.updatePlanTool?.function.name).toBe('update_plan');
  });
});

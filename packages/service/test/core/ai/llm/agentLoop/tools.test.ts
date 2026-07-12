import { describe, expect, it } from 'vitest';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import {
  getToolsForFastAgentLoop,
  normalizeToolCatalog
} from '@fastgpt/service/core/ai/llm/agentLoop/provider/fastAgent/tools';

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

const createCatalog = () => ({
  runtimeTools: [tool('search'), tool('read_file')],
  askTool: tool('ask_agent'),
  updatePlanTool: tool('update_plan'),
  sandboxTools: [tool('sandbox_shell')],
  datasetSearchTool: tool('dataset_search')
});

describe('agent loop tool catalog', () => {
  it('returns runtime tools plus fastAgent loop internal tools', () => {
    const tools = getToolsForFastAgentLoop({
      catalog: createCatalog()
    });

    expect(tools.map((item) => item.function.name)).toEqual([
      'search',
      'read_file',
      'ask_agent',
      'update_plan',
      'sandbox_shell',
      'dataset_search'
    ]);
  });

  it('removes runtime tools that conflict with internal tool names', () => {
    const normalized = normalizeToolCatalog({
      ...createCatalog(),
      runtimeTools: [
        tool('search'),
        tool('ask_agent'),
        tool('update_plan'),
        tool('sandbox_shell'),
        tool('dataset_search')
      ]
    });

    expect(normalized.runtimeTools.map((item) => item.function.name)).toEqual(['search']);
  });
});

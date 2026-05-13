import { describe, expect, it } from 'vitest';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import {
  getToolsForUnifiedLoop,
  normalizeToolCatalog
} from '@fastgpt/service/core/ai/llm/agentLoop/tools';

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
  updatePlanTool: tool('update_plan')
});

describe('agent loop tool catalog', () => {
  it('returns runtime tools plus unified loop internal tools', () => {
    const tools = getToolsForUnifiedLoop({
      catalog: createCatalog()
    });

    expect(tools.map((item) => item.function.name)).toEqual([
      'search',
      'read_file',
      'ask_agent',
      'update_plan'
    ]);
  });

  it('removes runtime tools that conflict with internal tool names', () => {
    const normalized = normalizeToolCatalog({
      ...createCatalog(),
      runtimeTools: [tool('search'), tool('ask_agent'), tool('update_plan')]
    });

    expect(normalized.runtimeTools.map((item) => item.function.name)).toEqual(['search']);
  });
});

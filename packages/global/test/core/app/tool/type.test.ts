import { describe, expect, it } from 'vitest';
import { AgentToolSchema } from '@fastgpt/global/core/app/tool/type';
import { AgentToolInputModeEnum } from '@fastgpt/global/core/app/tool/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

describe('AgentToolSchema', () => {
  it('keeps the dedicated key and mode input snapshot', () => {
    const result = AgentToolSchema.parse({
      id: 'systemTool-search',
      inputs: [{ key: 'query', mode: AgentToolInputModeEnum.agentGenerated }],
      config: {}
    });

    expect(result.inputs).toEqual([{ key: 'query', mode: AgentToolInputModeEnum.agentGenerated }]);
  });

  it('normalizes the transitional workflow input snapshot', () => {
    const result = AgentToolSchema.parse({
      id: 'systemTool-search',
      inputs: [
        {
          key: 'query',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
          selectedTypeIndex: 1,
          toolDescription: 'Search query'
        }
      ],
      config: {}
    });

    expect(result.inputs).toEqual([{ key: 'query', mode: AgentToolInputModeEnum.agentGenerated }]);
  });

  it('preserves a transitional manual workflow input snapshot', () => {
    const result = AgentToolSchema.parse({
      id: 'workflow-tool',
      inputs: [
        {
          key: 'query',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
          selectedTypeIndex: 0,
          toolDescription: 'Search query'
        }
      ],
      config: { query: 'fixed query' }
    });

    expect(result.inputs).toEqual([{ key: 'query', mode: AgentToolInputModeEnum.manual }]);
  });

  it('preserves missing inputs as the legacy Agent marker', () => {
    const result = AgentToolSchema.parse({
      id: 'systemTool-search',
      config: {}
    });

    expect(result.inputs).toBeUndefined();
  });

  it('preserves an empty version as keep-latest', () => {
    const result = AgentToolSchema.parse({
      id: 'systemTool-search',
      version: '',
      config: {}
    });

    expect(result.version).toBe('');
  });
});

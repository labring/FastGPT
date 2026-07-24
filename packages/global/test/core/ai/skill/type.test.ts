import { describe, expect, it } from 'vitest';
import { SkillToolSchema } from '@fastgpt/global/core/ai/skill/type';
import { AgentToolInputModeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

describe('SkillToolSchema', () => {
  it('keeps the dedicated key and mode input snapshot', () => {
    const result = SkillToolSchema.parse({
      id: 'systemTool-search',
      inputs: [{ key: 'query', mode: AgentToolInputModeEnum.agentGenerated }],
      config: {}
    });

    expect(result.inputs).toEqual([{ key: 'query', mode: AgentToolInputModeEnum.agentGenerated }]);
  });

  it('normalizes the transitional workflow input snapshot', () => {
    const result = SkillToolSchema.parse({
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

  it('preserves missing inputs as the legacy Agent marker', () => {
    const result = SkillToolSchema.parse({
      id: 'systemTool-search',
      config: {}
    });

    expect(result.inputs).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { AgentToolSchema } from '@fastgpt/global/core/app/tool/type';
import { AgentToolInputModeEnum } from '@fastgpt/global/core/app/tool/constants';

describe('AgentToolSchema', () => {
  it('keeps the dedicated key and mode input snapshot', () => {
    const result = AgentToolSchema.parse({
      id: 'systemTool-search',
      inputs: [{ key: 'query', mode: AgentToolInputModeEnum.agentGenerated }],
      config: {}
    });

    expect(result.inputs).toEqual([{ key: 'query', mode: AgentToolInputModeEnum.agentGenerated }]);
  });

  it('rejects a historical workflow input snapshot', () => {
    expect(() =>
      AgentToolSchema.parse({
        id: 'systemTool-search',
        inputs: [
          {
            key: 'query',
            renderTypeList: ['input', 'agentGenerated'],
            selectedType: 'agentGenerated',
            toolDescription: 'Search query'
          }
        ],
        config: {}
      })
    ).toThrow();
  });

  it('requires an explicit mode for every current input', () => {
    expect(() =>
      AgentToolSchema.parse({
        id: 'workflow-tool',
        inputs: [
          {
            key: 'query',
            mode: undefined
          }
        ],
        config: { query: 'fixed query' }
      })
    ).toThrow();
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

  it('accepts unavailable tools only through the dedicated branch', () => {
    const result = AgentToolSchema.parse({
      id: 'missing-tool',
      config: {},
      isUnavailable: true,
      inputs: [{ key: 'query', mode: AgentToolInputModeEnum.agentGenerated }]
    });

    expect(result).toMatchObject({ id: 'missing-tool', isUnavailable: true });
    expect(result.inputs).toEqual([{ key: 'query', mode: AgentToolInputModeEnum.agentGenerated }]);
  });

  it('rejects unavailable input snapshots on a regular tool', () => {
    expect(() =>
      AgentToolSchema.parse({
        id: 'tool-1',
        config: {},
        inputs: [{ key: 'query', selectedTypeIndex: 1 }]
      })
    ).toThrow();
  });

  it('preserves canonical inputs on an unavailable tool', () => {
    const result = AgentToolSchema.parse({
      id: 'missing-tool',
      config: {},
      isUnavailable: true,
      inputs: []
    });

    expect(result.inputs).toEqual([]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  hasAgentLoopExecutableTools,
  type AgentLoopRuntime
} from '@fastgpt/service/core/ai/llm/agentLoop/interface';

const createRuntime = (
  overrides?: Pick<AgentLoopRuntime, 'toolCatalog' | 'systemTools'>
): Pick<AgentLoopRuntime, 'toolCatalog' | 'systemTools'> => ({
  toolCatalog: {
    runtimeTools: []
  },
  ...overrides
});

describe('hasAgentLoopExecutableTools', () => {
  it('recognizes business and executable system tools', () => {
    expect(
      hasAgentLoopExecutableTools(
        createRuntime({
          toolCatalog: {
            runtimeTools: [
              {
                type: 'function',
                function: {
                  name: 'search',
                  description: 'Search',
                  parameters: {}
                }
              }
            ]
          }
        })
      )
    ).toBe(true);
    expect(
      hasAgentLoopExecutableTools(
        createRuntime({
          toolCatalog: { runtimeTools: [] },
          systemTools: { sandbox: { enabled: true, client: {} as any } }
        })
      )
    ).toBe(true);
    expect(
      hasAgentLoopExecutableTools(
        createRuntime({
          toolCatalog: { runtimeTools: [] },
          systemTools: { readFile: { enabled: true, execute: vi.fn() } }
        })
      )
    ).toBe(true);
    expect(
      hasAgentLoopExecutableTools(
        createRuntime({
          toolCatalog: { runtimeTools: [] },
          systemTools: { datasetSearch: { enabled: true, execute: vi.fn() } }
        })
      )
    ).toBe(true);
  });

  it('does not treat plan and ask controls as executable tools', () => {
    expect(
      hasAgentLoopExecutableTools(
        createRuntime({
          toolCatalog: { runtimeTools: [] },
          systemTools: {
            plan: { enabled: true },
            ask: { enabled: true }
          }
        })
      )
    ).toBe(false);
    expect(hasAgentLoopExecutableTools(createRuntime())).toBe(false);
  });
});

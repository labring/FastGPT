import { normalizeAgentLoopCoreToolRunResult } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/domain/toolProvider';
import { describe, expect, it } from 'vitest';

describe('normalizeAgentLoopCoreToolRunResult', () => {
  it('fills agent-loop tool result defaults', () => {
    expect(
      normalizeAgentLoopCoreToolRunResult({
        response: 'tool result'
      })
    ).toEqual({
      response: 'tool result',
      assistantMessages: [],
      usages: [],
      interactive: undefined,
      stop: false,
      errorMessage: undefined,
      metadata: undefined
    });
  });

  it('preserves optional tool execution fields', () => {
    const nodeResponse = {
      id: 'node_1',
      nodeId: 'node_1',
      moduleName: 'Tool'
    } as any;

    expect(
      normalizeAgentLoopCoreToolRunResult({
        response: 'tool result',
        assistantMessages: [{ role: 'assistant', content: 'assistant text' }],
        usages: [{ moduleName: 'tool', totalPoints: 1 }],
        interactive: {
          type: 'userInput'
        },
        stop: true,
        errorMessage: 'tool error',
        nodeResponse
      })
    ).toEqual({
      response: 'tool result',
      assistantMessages: [{ role: 'assistant', content: 'assistant text' }],
      usages: [{ moduleName: 'tool', totalPoints: 1 }],
      interactive: {
        type: 'userInput'
      },
      stop: true,
      errorMessage: 'tool error',
      metadata: nodeResponse
    });
  });
});

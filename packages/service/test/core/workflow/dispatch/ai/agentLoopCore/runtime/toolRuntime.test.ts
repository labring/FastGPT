import { createAgentLoopCoreToolRuntime } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';
import { describe, expect, it, vi } from 'vitest';

const createCall = (overrides: Record<string, any> = {}) =>
  ({
    id: 'call_search',
    type: 'function',
    function: {
      name: 'search',
      arguments: '{}'
    },
    ...overrides
  }) as any;

describe('createAgentLoopCoreToolRuntime', () => {
  it('adapts a core tool provider into agent-loop runtime tool fields', async () => {
    const onToolResult = vi.fn();
    const provider = {
      buildRuntimeTools: () => [
        {
          type: 'function',
          function: {
            name: 'search',
            description: 'Search',
            parameters: {
              type: 'object',
              properties: {}
            }
          }
        }
      ],
      getToolInfo: vi.fn(),
      executeTool: vi.fn().mockResolvedValue({
        response: 'tool result',
        usages: [{ moduleName: 'tool', totalPoints: 1 }],
        stop: true
      })
    };

    const runtime = createAgentLoopCoreToolRuntime({
      toolProvider: provider,
      batchToolSize: 3,
      onToolResult
    });

    expect(runtime.toolCatalog).toEqual({
      runtimeTools: [
        expect.objectContaining({
          function: expect.objectContaining({
            name: 'search'
          })
        })
      ],
      batchToolSize: 3
    });
    await expect(
      runtime.executeTool({
        call: createCall(),
        messages: [{ role: 'user', content: 'hello' }]
      })
    ).resolves.toEqual({
      response: 'tool result',
      assistantMessages: [],
      usages: [{ moduleName: 'tool', totalPoints: 1 }],
      interactive: undefined,
      stop: true,
      errorMessage: undefined,
      metadata: undefined
    });
    expect(provider.executeTool).toHaveBeenCalledWith({
      call: expect.objectContaining({
        id: 'call_search'
      }),
      messages: [{ role: 'user', content: 'hello' }]
    });
    expect(onToolResult).toHaveBeenCalledWith({
      callId: 'call_search',
      result: {
        response: 'tool result',
        usages: [{ moduleName: 'tool', totalPoints: 1 }],
        stop: true
      }
    });
    expect(runtime.executeInteractiveTool).toBeUndefined();
  });

  it('adapts optional interactive tool execution', async () => {
    const provider = {
      buildRuntimeTools: () => [],
      getToolInfo: vi.fn(),
      executeTool: vi.fn(),
      executeInteractiveTool: vi.fn().mockResolvedValue({
        response: 'interactive result',
        usages: [undefined, { moduleName: 'tool', totalPoints: 2 }],
        interactive: {
          type: 'userInput'
        }
      })
    };
    const runtime = createAgentLoopCoreToolRuntime({
      toolProvider: provider as any,
      normalizeInteractiveUsages: (usages = []) => usages.filter(Boolean) as any
    });

    await expect(
      runtime.executeInteractiveTool?.({
        childrenResponse: {
          entryNodeIds: ['search']
        },
        toolParams: {
          memoryRequestMessages: [],
          toolCallId: 'call_search'
        }
      } as any)
    ).resolves.toEqual({
      response: 'interactive result',
      assistantMessages: [],
      usages: [{ moduleName: 'tool', totalPoints: 2 }],
      interactive: {
        type: 'userInput'
      },
      stop: false,
      errorMessage: undefined,
      metadata: undefined
    });
  });
});

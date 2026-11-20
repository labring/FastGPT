import { createAgentLoopCoreToolRuntime } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/application/runtime/toolRuntime';
import { describe, expect, it, vi } from 'vitest';
import * as modelInput from '@fastgpt/service/core/plugin/moderation/modelInput';
import { MODERATION_BLOCKED_REPLACE_TEXT } from '@fastgpt/global/core/plugin/moderation/constants';

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
    const onToolResult = vi.fn();
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
      onToolResult,
      normalizeInteractiveUsages: (usages = []) => usages.filter(Boolean) as any
    });

    await expect(
      runtime.executeInteractiveTool?.({
        call: createCall(),
        childrenResponse: {
          entryNodeIds: ['search']
        },
        toolCallId: 'call_search'
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
    expect(onToolResult).toHaveBeenCalledWith({
      callId: 'call_search',
      result: expect.objectContaining({ response: 'interactive result' })
    });
  });
  it.each(['ordinary', 'interactive'])(
    'removes blocked image content for %s results before collection',
    async (entry) => {
      const spy = vi
        .spyOn(modelInput, 'checkToolResultModeration')
        .mockResolvedValue(MODERATION_BLOCKED_REPLACE_TEXT);
      const onToolResult = vi.fn();
      const makeResult = () => ({
        response: 'blocked text',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aN8AAAAASUVORK5CYII='
            }
          }
        ]
      });
      const runtime = createAgentLoopCoreToolRuntime({
        toolProvider: {
          buildRuntimeTools: () => [],
          getToolInfo: vi.fn(),
          executeTool: vi.fn(async () => makeResult()),
          executeInteractiveTool: vi.fn(async () => makeResult())
        } as any,
        onToolResult
      });
      const result =
        entry === 'ordinary'
          ? await runtime.executeTool({ call: createCall(), messages: [] })
          : await runtime.executeInteractiveTool?.({
              call: createCall(),
              toolCallId: 'call_search',
              childrenResponse: {}
            } as any);
      expect(result?.response).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
      expect(result?.content).toBeUndefined();
      expect(onToolResult.mock.calls[0][0].result.content).toBeUndefined();
      spy.mockRestore();
    }
  );
});

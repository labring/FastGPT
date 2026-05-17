import { describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import {
  buildAgentTools,
  createPiAgentToolEventHandler
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent/toolAdapter';

const tool = (name: string): ChatCompletionTool => ({
  type: 'function',
  function: {
    name,
    description: `${name} description`,
    parameters: {
      type: 'object',
      properties: {
        q: {
          type: 'string'
        }
      }
    }
  }
});

const createContext = (overrides = {}) =>
  ({
    completionTools: [tool('search')],
    getSubAppInfo: (id: string) => ({
      name: id === 'search' ? 'Search' : id,
      avatar: 'search.png',
      toolDescription: ''
    }),
    streamResponseFn: vi.fn(),
    ...overrides
  }) as any;

describe('PiAgent tool adapter', () => {
  it('emits tool params and creates a fallback flat node response', async () => {
    const executeTool = vi.fn(async () => ({
      response: 'tool result',
      usages: [
        {
          moduleName: 'tool',
          model: 'tool',
          totalPoints: 2
        }
      ]
    }));
    const ctx = createContext();
    const assistantResponses: any[] = [];
    const appendChildNodeResponse = vi.fn();
    const usagePush = vi.fn();

    const tools = await buildAgentTools({
      ctx,
      assistantResponses,
      appendChildNodeResponse,
      usagePush,
      executeToolFactory: vi.fn(() => executeTool)
    });

    const result = await tools[0].execute('call_search', { q: 'FastGPT' });

    expect(result.content).toEqual([{ type: 'text', text: 'tool result' }]);
    expect(executeTool).toHaveBeenCalledWith({
      callId: 'call_search',
      toolId: 'search',
      args: '{"q":"FastGPT"}'
    });
    expect(assistantResponses).toEqual([
      {
        id: 'call_search',
        tools: [
          expect.objectContaining({
            id: 'call_search',
            functionName: 'search',
            params: '{"q":"FastGPT"}',
            response: 'tool result'
          })
        ]
      }
    ]);
    expect(ctx.streamResponseFn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'call_search',
        event: SseResponseEventEnum.toolCall
      })
    );
    expect(ctx.streamResponseFn).toHaveBeenCalledWith({
      id: 'call_search',
      event: SseResponseEventEnum.toolParams,
      data: {
        tool: {
          id: 'call_search',
          params: '{"q":"FastGPT"}'
        }
      }
    });
    expect(ctx.streamResponseFn).toHaveBeenCalledWith({
      id: 'call_search',
      event: SseResponseEventEnum.toolResponse,
      data: {
        tool: {
          id: 'call_search',
          response: 'tool result'
        }
      }
    });
    expect(appendChildNodeResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'call_search',
        nodeId: 'call_search',
        moduleType: FlowNodeTypeEnum.tool,
        moduleName: 'Search',
        moduleLogo: 'search.png',
        toolInput: {
          q: 'FastGPT'
        },
        toolRes: 'tool result',
        totalPoints: 2
      })
    );
    expect(usagePush).toHaveBeenCalledWith([
      {
        moduleName: 'tool',
        model: 'tool',
        totalPoints: 2
      }
    ]);
  });

  it('records pi-agent-core tool execution errors as a completed tool card', () => {
    const ctx = createContext();
    const assistantResponses: any[] = [];
    const appendChildNodeResponse = vi.fn();
    const handler = createPiAgentToolEventHandler({
      ctx,
      assistantResponses,
      appendChildNodeResponse,
      nodeResponses: []
    });

    handler({
      type: 'tool_execution_start',
      toolCallId: 'call_search',
      toolName: 'search',
      args: {
        q: 'FastGPT'
      }
    } as any);
    handler({
      type: 'tool_execution_end',
      toolCallId: 'call_search',
      toolName: 'search',
      result: {
        content: [{ type: 'text', text: 'Validation failed' }],
        details: {}
      },
      isError: true
    } as any);

    expect(assistantResponses).toEqual([
      {
        id: 'call_search',
        tools: [
          expect.objectContaining({
            id: 'call_search',
            functionName: 'search',
            params: '{"q":"FastGPT"}',
            response: 'Validation failed'
          })
        ]
      }
    ]);
    expect(ctx.streamResponseFn).toHaveBeenCalledWith({
      id: 'call_search',
      event: SseResponseEventEnum.toolResponse,
      data: {
        tool: {
          id: 'call_search',
          response: 'Validation failed'
        }
      }
    });
    expect(appendChildNodeResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'call_search',
        nodeId: 'call_search',
        moduleType: FlowNodeTypeEnum.tool,
        moduleName: 'Search',
        toolInput: {
          q: 'FastGPT'
        },
        toolRes: 'Validation failed',
        errorText: 'Validation failed'
      })
    );
  });

  it('does not duplicate toolCall and toolParams when execution start was already mapped', async () => {
    const executeTool = vi.fn(async () => ({
      response: 'tool result',
      usages: []
    }));
    const ctx = createContext();
    const assistantResponses: any[] = [];
    const handler = createPiAgentToolEventHandler({
      ctx,
      assistantResponses,
      appendChildNodeResponse: vi.fn(),
      nodeResponses: []
    });

    handler({
      type: 'tool_execution_start',
      toolCallId: 'call_search',
      toolName: 'search',
      args: {
        q: 'FastGPT'
      }
    } as any);

    const tools = await buildAgentTools({
      ctx,
      assistantResponses,
      appendChildNodeResponse: vi.fn(),
      usagePush: vi.fn(),
      executeToolFactory: vi.fn(() => executeTool)
    });

    await tools[0].execute('call_search', { q: 'FastGPT' });

    const events = vi.mocked(ctx.streamResponseFn).mock.calls.map(([payload]) => payload.event);
    expect(events.filter((event) => event === SseResponseEventEnum.toolCall)).toHaveLength(1);
    expect(events.filter((event) => event === SseResponseEventEnum.toolParams)).toHaveLength(1);
    expect(events.filter((event) => event === SseResponseEventEnum.toolResponse)).toHaveLength(1);
    expect(assistantResponses[0].tools[0]).toEqual(
      expect.objectContaining({
        params: '{"q":"FastGPT"}',
        response: 'tool result'
      })
    );
  });
});

import { createAgentLoopCoreRuntime } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';
import { describe, expect, it, vi } from 'vitest';

const createProvider = () => ({
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
    usages: [{ moduleName: 'tool', totalPoints: 1 }]
  })
});

describe('createAgentLoopCoreRuntime', () => {
  it('builds a complete runtime from system tools and tool provider', async () => {
    const usagePush = vi.fn();
    const emitEvent = vi.fn();
    const readFileExecute = vi.fn();
    const provider = createProvider();

    const runtime = createAgentLoopCoreRuntime({
      llmParams: {
        model: 'gpt-4',
        stream: true
      },
      lang: 'zh',
      systemTools: {
        planEnabled: true,
        askEnabled: false,
        readFile: {
          enabled: true,
          execute: readFileExecute as any
        }
      },
      toolRuntime: {
        toolProvider: provider,
        batchToolSize: 2
      },
      usagePush,
      emitEvent
    });

    expect(runtime.llmParams).toEqual({
      model: 'gpt-4',
      stream: true
    });
    expect(runtime.lang).toBe('zh');
    expect(runtime.systemTools).toEqual({
      plan: {
        enabled: true
      },
      ask: {
        enabled: false
      },
      readFile: {
        enabled: true,
        execute: readFileExecute
      }
    });
    expect(runtime.toolCatalog.batchToolSize).toBe(2);
    expect(runtime.toolCatalog.runtimeTools[0].function.name).toBe('search');

    await expect(
      runtime.executeTool({
        call: {
          id: 'call_search',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{}'
          }
        },
        messages: []
      })
    ).resolves.toEqual(
      expect.objectContaining({
        response: 'tool result',
        usages: [{ moduleName: 'tool', totalPoints: 1 }]
      })
    );

    runtime.usagePush?.([
      undefined as any,
      {
        moduleName: 'tool',
        totalPoints: 2,
        model: 'gpt-4',
        inputTokens: 10,
        outputTokens: 5
      }
    ]);
    expect(usagePush).toHaveBeenCalledWith([
      {
        moduleName: 'tool',
        totalPoints: 2,
        model: 'gpt-4',
        inputTokens: 10,
        outputTokens: 5
      }
    ]);

    runtime.emitEvent?.({ type: 'answer_delta', text: 'hi' });
    expect(emitEvent).toHaveBeenCalledWith({ type: 'answer_delta', text: 'hi' });
  });
});

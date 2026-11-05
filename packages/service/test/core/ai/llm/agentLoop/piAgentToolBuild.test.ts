import { describe, expect, it, vi } from 'vitest';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { buildPiAgentTools } from '@fastgpt/service/core/ai/llm/agentLoop/provider/piAgent/tool/build';

const createRuntime = (runtimeTools: ChatCompletionTool[]) =>
  ({
    toolCatalog: { runtimeTools },
    systemTools: undefined
  }) as any;

const buildTools = (runtimeTools: ChatCompletionTool[]) =>
  buildPiAgentTools({
    runtime: createRuntime(runtimeTools),
    getActivePlan: () => undefined,
    setActivePlan: vi.fn(),
    setPendingAsk: vi.fn(),
    getMessages: () => [],
    onToolCall: vi.fn(),
    onToolResult: vi.fn()
  });

describe('piAgent tool schema normalization', () => {
  it('normalizes legacy required flags and removes FastGPT-private fields', async () => {
    const tools = await buildTools([
      {
        type: 'function',
        function: {
          name: 'legacy_tool',
          description: 'legacy tool',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                required: true,
                'x-tool-description': 'internal description',
                isSecret: true
              },
              mode: {
                type: 'string',
                enum: ['fast', 'slow'],
                'x-fastgpt-node-input': true
              }
            }
          }
        }
      }
    ]);

    expect(tools).toHaveLength(1);
    expect(tools[0].parameters).toMatchObject({
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string' },
        mode: { type: 'string', enum: ['fast', 'slow'] }
      }
    });
    expect(tools[0].parameters).not.toHaveProperty('properties.query.required');
    expect(tools[0].parameters).not.toHaveProperty('properties.query.x-tool-description');
    expect(tools[0].parameters).not.toHaveProperty('properties.query.isSecret');
    expect(tools[0].parameters).not.toHaveProperty('properties.mode.x-fastgpt-node-input');
  });
});

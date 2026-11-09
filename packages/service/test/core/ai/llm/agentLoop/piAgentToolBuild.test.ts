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

describe('piAgent plan execution events', () => {
  it.each([
    { name: 'set_plan', args: { name: 'Build', steps: ['Inspect'] }, success: true },
    { name: 'update_plan', args: { add_steps: ['Validate'] }, success: true },
    { name: 'set_plan', args: { name: 'Build', steps: [] }, success: false }
  ])(
    'emits one hidden tool end for $name with success=$success',
    async ({ name, args, success }) => {
      const emitEvent = vi.fn();
      const onToolResult = vi.fn();
      const tools = await buildPiAgentTools({
        runtime: {
          ...createRuntime([]),
          systemTools: { plan: { enabled: true } },
          emitEvent
        },
        getActivePlan: () => ({
          planId: 'plan-1',
          name: 'Build',
          steps: [{ id: 'step-1', name: 'Inspect', status: 'pending' }]
        }),
        setActivePlan: vi.fn(),
        setPendingAsk: vi.fn(),
        getMessages: () => [],
        onToolCall: vi.fn(),
        onToolResult
      });

      await tools.find((tool) => tool.name === name)!.execute('plan-call', args);

      const events = emitEvent.mock.calls.map(([event]) => event);
      expect(events.filter((event) => event.type === 'plan_operation')).toEqual([
        expect.objectContaining({ id: 'plan-call', success })
      ]);
      expect(events.filter((event) => event.type === 'tool_run_end')).toEqual([
        expect.objectContaining({
          call: {
            id: 'plan-call',
            type: 'function',
            function: { name, arguments: JSON.stringify(args) }
          },
          response: onToolResult.mock.calls[0][0].response,
          hideInUI: true
        })
      ]);
      expect(onToolResult).toHaveBeenCalledTimes(1);
    }
  );
});

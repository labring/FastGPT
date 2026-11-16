import { describe, expect, it, vi } from 'vitest';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  MODERATION_BLOCKED_ERROR_MESSAGE,
  MODERATION_BLOCKED_REPLACE_TEXT
} from '@fastgpt/global/core/plugin/moderation/constants';
import { STOPPED_TOOL_RESPONSE_TEXT } from '@fastgpt/service/core/chat/stop';
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
  it.each(['continue', 'stop', 'interactive'] as const)(
    'forwards a hidden tool continuation only when the tool can continue: %s',
    async (outcome) => {
      const emitEvent = vi.fn();
      const onToolResult = vi.fn();
      const tools = await buildPiAgentTools({
        runtime: {
          ...createRuntime([
            { type: 'function', function: { name: 'review', parameters: { type: 'object' } } }
          ]),
          emitEvent,
          executeTool: vi.fn(async () => ({
            response: 'review required',
            assistantMessages: [],
            usages: [],
            hideInUI: true,
            continuationMessage: 'Review the draft.',
            ...(outcome === 'stop' && { stop: true }),
            ...(outcome === 'interactive' && { interactive: { pending: true } })
          }))
        },
        getActivePlan: () => undefined,
        setActivePlan: vi.fn(),
        setPendingAsk: vi.fn(),
        getMessages: () => [],
        onToolCall: vi.fn(),
        onToolResult
      });
      await tools[0].execute('review-call', {});
      expect(onToolResult.mock.calls[0][0].continuationMessage).toBe(
        outcome === 'continue' ? 'Review the draft.' : undefined
      );
      expect(emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'tool_run_end', hideInUI: true })
      );
    }
  );

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

  it('settles a hung runtime tool after toolStopGraceMs when stopSignal aborts', async () => {
    const stopController = new AbortController();
    const onToolResult = vi.fn();
    const tools = await buildPiAgentTools({
      runtime: {
        toolCatalog: {
          runtimeTools: [
            {
              type: 'function',
              function: {
                name: 'hung_tool',
                description: 'hung tool',
                parameters: { type: 'object', properties: {} }
              }
            }
          ]
        },
        stopSignal: stopController.signal,
        checkIsStopping: () => stopController.signal.aborted,
        toolStopGraceMs: 25,
        executeTool: vi.fn(async () => {
          stopController.abort(new Error('Chat stopped'));
          return new Promise<never>(() => {});
        })
      } as any,
      getActivePlan: () => undefined,
      setActivePlan: vi.fn(),
      setPendingAsk: vi.fn(),
      getMessages: () => [],
      onToolCall: vi.fn(),
      onToolResult
    });

    const result = await tools[0].execute('call_pi_hung', {});

    expect(result).toEqual({
      content: [{ type: 'text', text: STOPPED_TOOL_RESPONSE_TEXT }],
      details: {}
    });
    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ id: 'call_pi_hung' }),
        response: STOPPED_TOOL_RESPONSE_TEXT
      })
    );
  });

  it('preserves moderation replacement instead of stopped text when a tool hits moderation while stopping', async () => {
    const stopController = new AbortController();
    const onToolResult = vi.fn();
    const tools = await buildPiAgentTools({
      runtime: {
        ...createRuntime([
          { type: 'function', function: { name: 'search', parameters: { type: 'object' } } }
        ]),
        stopSignal: stopController.signal,
        checkIsStopping: () => stopController.signal.aborted,
        executeTool: vi.fn(async () => {
          stopController.abort(new Error('Chat stopped'));
          throw new UserError(MODERATION_BLOCKED_ERROR_MESSAGE);
        })
      } as any,
      getActivePlan: () => undefined,
      setActivePlan: vi.fn(),
      setPendingAsk: vi.fn(),
      getMessages: () => [],
      onToolCall: vi.fn(),
      onToolResult
    });

    const result = await tools[0].execute('call_pi_mod_stop', {});

    expect(result).toEqual({
      content: [{ type: 'text', text: MODERATION_BLOCKED_REPLACE_TEXT }],
      details: {}
    });
    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ id: 'call_pi_mod_stop' }),
        response: MODERATION_BLOCKED_REPLACE_TEXT
      })
    );
  });

  it('clears interactive and stop when a tool result hits moderation', async () => {
    const emitEvent = vi.fn();
    const onToolResult = vi.fn();
    const modelInputMod = await import('@fastgpt/service/core/plugin/moderation/modelInput');
    const modSpy = vi
      .spyOn(modelInputMod, 'checkToolResultModeration')
      .mockResolvedValue(MODERATION_BLOCKED_REPLACE_TEXT);

    try {
      const tools = await buildPiAgentTools({
        runtime: {
          ...createRuntime([
            { type: 'function', function: { name: 'search', parameters: { type: 'object' } } }
          ]),
          teamId: 'test_team',
          emitEvent,
          executeTool: vi.fn(async () => ({
            response: 'unsafe interactive prompt',
            interactive: { type: 'userSelect', params: { description: 'choose' } } as any,
            stop: true,
            continuationMessage: 'continue after moderation'
          }))
        } as any,
        getActivePlan: () => undefined,
        setActivePlan: vi.fn(),
        setPendingAsk: vi.fn(),
        getMessages: () => [],
        onToolCall: vi.fn(),
        onToolResult
      });

      const result = await tools[0].execute('call_pi_mod_interactive', {});

      expect(result).toEqual({
        content: [{ type: 'text', text: MODERATION_BLOCKED_REPLACE_TEXT }],
        details: {}
      });
      expect(emitEvent).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'tool_interactive' })
      );
      expect(onToolResult).toHaveBeenCalledWith(
        expect.objectContaining({
          call: expect.objectContaining({ id: 'call_pi_mod_interactive' }),
          response: MODERATION_BLOCKED_REPLACE_TEXT,
          continuationMessage: 'continue after moderation'
        })
      );
    } finally {
      modSpy.mockRestore();
    }
  });

  it('short-circuits set_plan and ask_user with stopped text when stopSignal is already aborted', async () => {
    const stopController = new AbortController();
    stopController.abort(new Error('Chat stopped'));
    const setActivePlan = vi.fn();
    const setPendingAsk = vi.fn();
    const onToolResult = vi.fn();
    const emitEvent = vi.fn();

    const tools = await buildPiAgentTools({
      runtime: {
        ...createRuntime([]),
        systemTools: {
          plan: { enabled: true },
          ask: { enabled: true }
        },
        stopSignal: stopController.signal,
        checkIsStopping: () => false,
        emitEvent
      },
      getActivePlan: () => undefined,
      setActivePlan,
      setPendingAsk,
      getMessages: () => [],
      onToolCall: vi.fn(),
      onToolResult
    });

    const planTool = tools.find((tool) => tool.name === 'set_plan')!;
    const askTool = tools.find((tool) => tool.name === 'ask_user')!;

    const planResult = await planTool.execute('call_plan_aborted', {
      name: 'Build',
      steps: ['Inspect']
    });
    const askResult = await askTool.execute(
      'call_ask_aborted',
      {
        reason: 'Need clarification',
        blockerType: 'missing_required_input',
        questions: [
          {
            question: 'Which option?',
            options: [
              { summary: 'A', value: 'A' },
              { summary: 'B', value: 'B' },
              { summary: 'C', value: 'C' }
            ]
          }
        ]
      },
      stopController.signal
    );

    expect(planResult).toEqual({
      content: [{ type: 'text', text: STOPPED_TOOL_RESPONSE_TEXT }],
      details: {}
    });
    expect(askResult).toEqual({
      content: [{ type: 'text', text: STOPPED_TOOL_RESPONSE_TEXT }],
      details: {}
    });
    expect(setActivePlan).not.toHaveBeenCalled();
    expect(setPendingAsk).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'plan_operation' }));
    expect(onToolResult).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        call: expect.objectContaining({ id: 'call_plan_aborted' }),
        response: STOPPED_TOOL_RESPONSE_TEXT
      })
    );
    expect(onToolResult).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        call: expect.objectContaining({ id: 'call_ask_aborted' }),
        response: STOPPED_TOOL_RESPONSE_TEXT
      })
    );
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

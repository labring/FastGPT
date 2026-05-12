import { describe, expect, it, vi } from 'vitest';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { createWorkflowAgentLoopEventMapper } from '@fastgpt/service/core/workflow/dispatch/ai/agent/adapter/eventMapper';

const createPlan = () => ({
  planId: 'plan_1',
  task: 'Investigate',
  description: 'Investigate code',
  steps: [
    {
      id: 's1',
      title: 'Read code',
      description: 'Read code',
      acceptanceCriteria: [],
      status: 'pending' as const,
      evidence: []
    }
  ]
});

describe('createWorkflowAgentLoopEventMapper', () => {
  it('streams main answer deltas', () => {
    const workflowStreamResponse = vi.fn();
    const mapper = createWorkflowAgentLoopEventMapper({
      workflowStreamResponse,
      getSubAppInfo: () => ({
        name: '',
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });

    mapper.emitEvent({
      type: 'answer_delta',
      profile: 'main_agent',
      text: 'main answer'
    });

    expect(workflowStreamResponse).toHaveBeenCalledTimes(1);
    expect(workflowStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        event: SseResponseEventEnum.answer
      })
    );
  });

  it('streams model request lifecycle as workflow node status', () => {
    const workflowStreamResponse = vi.fn();
    const mapper = createWorkflowAgentLoopEventMapper({
      workflowStreamResponse,
      getSubAppInfo: () => ({
        name: '',
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });

    mapper.emitEvent({
      type: 'llm_request_start',
      profile: 'main_agent',
      requestIndex: 2,
      modelName: 'GPT-4'
    });
    mapper.emitEvent({
      type: 'llm_request_end',
      profile: 'main_agent',
      requestIndex: 2,
      modelName: 'GPT-4',
      requestId: 'req_2',
      finishReason: 'stop'
    });

    expect(workflowStreamResponse).toHaveBeenCalledTimes(1);
    expect(workflowStreamResponse).toHaveBeenCalledWith({
      event: SseResponseEventEnum.flowNodeStatus,
      data: {
        status: 'running',
        name: 'GPT-4'
      }
    });
  });

  it('filters internal tool calls and streams runtime tool lifecycle events', () => {
    const workflowStreamResponse = vi.fn();
    const mapper = createWorkflowAgentLoopEventMapper({
      workflowStreamResponse,
      getSubAppInfo: (id) => ({
        name: id === 'search' ? 'Search' : id,
        avatar: 'avatar',
        toolDescription: ''
      }),
      internalToolNames: new Set(['ask_agent', 'update_plan']),
      updatePlanToolName: 'update_plan',
      askToolName: 'ask_agent'
    });

    mapper.emitEvent({
      type: 'tool_call',
      profile: 'main_agent',
      call: {
        id: 'call_update_plan',
        type: 'function',
        function: {
          name: 'update_plan',
          arguments: '{}'
        }
      }
    });
    mapper.emitEvent({
      type: 'tool_params',
      profile: 'main_agent',
      callId: 'call_update_plan',
      argsDelta: '{"action":"create"}'
    });
    mapper.emitEvent({
      type: 'llm_request_end',
      profile: 'main_agent',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_update_plan',
      finishReason: 'tool_calls',
      answerText: 'draft before plan',
      reasoningText: 'planning',
      toolCalls: [
        {
          id: 'call_update_plan',
          type: 'function',
          function: {
            name: 'update_plan',
            arguments: '{}{"action":"create"}'
          }
        }
      ]
    });
    mapper.emitEvent({
      type: 'tool_response',
      profile: 'main_agent',
      callId: 'call_update_plan',
      response: 'ok'
    });
    mapper.emitEvent({
      type: 'tool_call',
      profile: 'main_agent',
      call: {
        id: 'call_search',
        type: 'function',
        function: {
          name: 'search',
          arguments: ''
        }
      }
    });
    mapper.emitEvent({
      type: 'tool_params',
      profile: 'main_agent',
      callId: 'call_search',
      argsDelta: '{"q":'
    });
    mapper.emitEvent({
      type: 'tool_params',
      profile: 'main_agent',
      callId: 'call_search',
      argsDelta: '"FastGPT"}'
    });
    mapper.emitEvent({
      type: 'tool_response',
      profile: 'main_agent',
      callId: 'call_search',
      response: 'Search '
    });
    mapper.emitEvent({
      type: 'tool_response',
      profile: 'main_agent',
      callId: 'call_search',
      response: 'result'
    });

    expect(workflowStreamResponse).toHaveBeenCalledTimes(5);
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'call_search',
        event: SseResponseEventEnum.toolCall,
        data: {
          tool: {
            id: 'call_search',
            toolName: 'Search',
            toolAvatar: 'avatar',
            functionName: 'search',
            params: ''
          }
        }
      })
    );
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        id: 'call_search',
        event: SseResponseEventEnum.toolResponse
      })
    );
    expect(mapper.assistantResponses).toEqual([
      {
        id: 'call_update_plan',
        agentPlanUpdate: {
          id: 'call_update_plan',
          functionName: 'update_plan',
          params: '{}{"action":"create"}',
          response: 'ok',
          assistantText: 'draft before plan',
          reasoningText: 'planning'
        }
      },
      {
        id: 'call_search',
        tools: [
          {
            id: 'call_search',
            toolName: 'Search',
            toolAvatar: 'avatar',
            functionName: 'search',
            params: '{"q":"FastGPT"}',
            response: 'Search result'
          }
        ]
      }
    ]);
  });

  it('streams partial tool call args and later tool params in order', () => {
    const workflowStreamResponse = vi.fn();
    const mapper = createWorkflowAgentLoopEventMapper({
      workflowStreamResponse,
      getSubAppInfo: (id) => ({
        name: id === 'weather' ? 'Weather' : id,
        avatar: 'avatar',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });

    mapper.emitEvent({
      type: 'tool_call',
      profile: 'main_agent',
      call: {
        id: 'call_weather',
        type: 'function',
        function: {
          name: 'weather',
          arguments: '{"city"'
        }
      }
    });
    mapper.emitEvent({
      type: 'tool_params',
      profile: 'main_agent',
      callId: 'call_weather',
      argsDelta: ':"Beijing"}'
    });

    expect(workflowStreamResponse).toHaveBeenCalledTimes(2);
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'call_weather',
        event: SseResponseEventEnum.toolCall,
        data: {
          tool: expect.objectContaining({
            params: '{"city"'
          })
        }
      })
    );
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'call_weather',
        event: SseResponseEventEnum.toolParams,
        data: {
          tool: {
            id: 'call_weather',
            params: ':"Beijing"}'
          }
        }
      })
    );
    expect(mapper.assistantResponses).toEqual([
      {
        id: 'call_weather',
        tools: [
          {
            id: 'call_weather',
            toolName: 'Weather',
            toolAvatar: 'avatar',
            functionName: 'weather',
            params: '{"city":"Beijing"}'
          }
        ]
      }
    ]);
  });

  it('recognizes agent loop control tools from injected tool names', () => {
    const workflowStreamResponse = vi.fn();
    const mapper = createWorkflowAgentLoopEventMapper({
      workflowStreamResponse,
      getSubAppInfo: () => ({
        name: '',
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set(['agent_update_plan', 'agent_ask']),
      updatePlanToolName: 'agent_update_plan',
      askToolName: 'agent_ask'
    });

    mapper.emitEvent({
      type: 'tool_call',
      profile: 'main_agent',
      call: {
        id: 'call_custom_plan',
        type: 'function',
        function: {
          name: 'agent_update_plan',
          arguments: '{"updates":['
        }
      }
    });
    mapper.emitEvent({
      type: 'tool_params',
      profile: 'main_agent',
      callId: 'call_custom_plan',
      argsDelta: ']}'
    });
    mapper.emitEvent({
      type: 'tool_response',
      profile: 'main_agent',
      callId: 'call_custom_plan',
      response: 'ok'
    });

    expect(workflowStreamResponse).not.toHaveBeenCalled();
    expect(mapper.assistantResponses).toEqual([
      {
        id: 'call_custom_plan',
        agentPlanUpdate: {
          id: 'call_custom_plan',
          functionName: 'agent_update_plan',
          params: '{"updates":[]}',
          response: 'ok'
        }
      }
    ]);
  });

  it('stores stop gate feedback as an agent loop control value', () => {
    const mapper = createWorkflowAgentLoopEventMapper({
      getSubAppInfo: () => ({
        name: '',
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });

    mapper.emitEvent({
      type: 'stop_gate_feedback',
      profile: 'main_agent',
      id: 'stop_gate_1',
      reason: 'Active plan is not complete.',
      feedback: '<stop_gate_feedback>\nYou cannot finish yet.\n</stop_gate_feedback>',
      assistantText: 'too early',
      reasoningText: 'checking'
    });

    expect(mapper.assistantResponses).toEqual([
      {
        id: 'stop_gate_1',
        agentStopGate: {
          id: 'stop_gate_1',
          reason: 'Active plan is not complete.',
          feedback: '<stop_gate_feedback>\nYou cannot finish yet.\n</stop_gate_feedback>',
          assistantText: 'too early',
          reasoningText: 'checking'
        }
      }
    ]);
  });

  it('pushes plan updates into assistant responses and plan SSE', () => {
    const workflowStreamResponse = vi.fn();
    const mapper = createWorkflowAgentLoopEventMapper({
      workflowStreamResponse,
      getSubAppInfo: () => ({
        name: '',
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });
    const plan = createPlan();

    mapper.emitEvent({
      type: 'plan_status',
      status: 'generating'
    });
    mapper.emitEvent({
      type: 'plan_update',
      plan
    });
    const updatedPlan = {
      ...plan,
      steps: [
        {
          ...plan.steps[0],
          status: 'done' as const,
          outputSummary: 'Read code'
        }
      ]
    };
    mapper.emitEvent({
      type: 'plan_update',
      plan: updatedPlan
    });

    expect(mapper.assistantResponses).toEqual([{ plan: updatedPlan }]);
    expect(workflowStreamResponse).toHaveBeenCalledTimes(3);
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(1, {
      id: 'agent-plan-stream',
      event: SseResponseEventEnum.planStatus,
      data: {
        planStatus: {
          status: 'generating'
        }
      }
    });
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(2, {
      id: 'agent-plan-stream',
      event: SseResponseEventEnum.plan,
      data: {
        plan
      }
    });
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(3, {
      id: 'agent-plan-stream',
      event: SseResponseEventEnum.plan,
      data: {
        plan: updatedPlan
      }
    });
  });
});

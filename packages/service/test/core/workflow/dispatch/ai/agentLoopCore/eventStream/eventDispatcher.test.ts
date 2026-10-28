import { describe, expect, it, vi } from 'vitest';
import {
  createAgentLoopCoreEventDispatcher,
  createAgentLoopCoreEventStream
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/eventStream';
import { createAgentLoopCoreToolRunResponseCollector } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/nodeResponse';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';

const createCall = ({
  id = 'call_search',
  name = 'search',
  args = '{"q":"FastGPT"}'
}: {
  id?: string;
  name?: string;
  args?: string;
} = {}) =>
  ({
    id,
    type: 'function',
    function: {
      name,
      arguments: args
    }
  }) as any;

describe('createAgentLoopCoreEventDispatcher', () => {
  it.each([true, false])(
    'announces a resumed tool before its result while respecting visibility %s',
    (visible) => {
      const workflowStreamResponse = vi.fn();
      const dispatcher = createAgentLoopCoreEventDispatcher({
        eventStream: createAgentLoopCoreEventStream({
          workflowStreamResponse,
          getToolInfo: () => ({ name: 'Plan preview', avatar: 'preview-avatar' })
        }),
        shouldStreamTool: () => visible
      });
      const call = createCall({ id: 'resumed-preview', name: 'workflow_builder_present_preview' });
      const event = {
        type: 'tool_run_end' as const,
        call,
        response: 'confirmed',
        seconds: 0
      };
      dispatcher.emitEvent(event);
      dispatcher.emitEvent(event);

      const events = workflowStreamResponse.mock.calls.map(([event]) => event);
      expect(events.map((event) => event.event)).toEqual(
        visible ? [SseResponseEventEnum.toolCall, SseResponseEventEnum.toolResponse] : []
      );
      if (visible) {
        expect(events[0].data.tool).toEqual({
          id: call.id,
          toolName: 'Plan preview',
          toolAvatar: 'preview-avatar',
          functionName: call.function.name,
          params: call.function.arguments
        });
        expect(events[1].data.tool.response).toBe('confirmed');
      }
    }
  );

  it('streams internal tool activity once without collecting tool run details', () => {
    const workflowStreamResponse = vi.fn();
    const appendToolNodeResponse = vi.fn();
    const dispatcher = createAgentLoopCoreEventDispatcher({
      eventStream: createAgentLoopCoreEventStream({
        workflowStreamResponse,
        getToolInfo: () => ({ name: 'Read file', avatar: 'file-avatar' })
      }),
      toolRunCollector: {
        appendToolNodeResponse,
        appendContextCompressNodeResponse: vi.fn()
      }
    });

    for (const status of ['running', 'running', 'done', 'done'] as const) {
      dispatcher.emitEvent({
        type: 'tool_activity',
        callId: 'skill-reference',
        toolName: 'sandbox_read_file',
        status
      });
    }

    expect(workflowStreamResponse.mock.calls.map(([event]) => event)).toEqual([
      {
        id: 'skill-reference',
        event: SseResponseEventEnum.toolCall,
        data: {
          tool: {
            id: 'skill-reference',
            toolName: 'Read file',
            toolAvatar: 'file-avatar',
            functionName: 'sandbox_read_file',
            params: '',
            hideDetails: true
          }
        }
      },
      {
        id: 'skill-reference',
        event: SseResponseEventEnum.toolResponse,
        data: {
          tool: {
            id: 'skill-reference',
            toolName: '',
            toolAvatar: '',
            params: '',
            response: ''
          }
        }
      }
    ]);
    expect(appendToolNodeResponse).not.toHaveBeenCalled();
  });

  it('routes model, tool and compression events to stream and tool run collector', () => {
    const workflowStreamResponse = vi.fn();
    const eventStream = createAgentLoopCoreEventStream({
      workflowStreamResponse,
      streamAnswer: true,
      streamReasoning: true,
      getToolInfo: () => ({
        name: 'Search',
        avatar: 'tool-avatar'
      })
    });
    const toolRunCollector = createAgentLoopCoreToolRunResponseCollector({
      moduleType: FlowNodeTypeEnum.toolCall,
      getToolInfo: () => ({
        name: 'Search',
        avatar: 'tool-avatar'
      })
    });
    const dispatcher = createAgentLoopCoreEventDispatcher({
      eventStream,
      toolRunCollector
    });
    const call = createCall();

    dispatcher.emitEvent({
      type: 'reasoning_delta',
      text: 'reason'
    });
    dispatcher.emitEvent({
      type: 'answer_delta',
      text: 'answer'
    });
    dispatcher.emitEvent({
      type: 'llm_request_start',
      requestIndex: 1,
      modelName: 'GPT-4'
    });
    dispatcher.emitEvent({
      type: 'after_message_compress',
      modelName: 'GPT-4',
      usages: [
        {
          moduleName: 'account_usage:compress_llm_messages',
          totalPoints: 0.2
        }
      ],
      requestIds: ['req_compress'],
      seconds: 0.12
    });
    dispatcher.emitEvent({
      type: 'tool_call',
      call
    });
    dispatcher.emitEvent({
      type: 'tool_params',
      callId: call.id,
      argsDelta: '"q"'
    });
    dispatcher.emitEvent({
      type: 'tool_run_end',
      call,
      response: 'tool response',
      seconds: 0.3
    });
    dispatcher.emitEvent({
      type: 'tool_run_end',
      call,
      response: 'duplicate response',
      seconds: 0.4
    });

    expect(workflowStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        event: SseResponseEventEnum.answer
      })
    );
    expect(workflowStreamResponse).toHaveBeenCalledWith({
      event: SseResponseEventEnum.flowNodeStatus,
      data: {
        status: 'running',
        name: 'GPT-4'
      }
    });
    expect(
      workflowStreamResponse.mock.calls.filter(
        ([event]) => event.event === SseResponseEventEnum.toolResponse
      )
    ).toHaveLength(1);
    expect(
      workflowStreamResponse.mock.calls.filter(
        ([event]) => event.event === SseResponseEventEnum.toolCall
      )
    ).toHaveLength(1);
    expect(workflowStreamResponse).toHaveBeenCalledWith({
      id: call.id,
      event: SseResponseEventEnum.toolCall,
      data: {
        tool: {
          id: call.id,
          toolName: 'Search',
          toolAvatar: 'tool-avatar',
          functionName: 'search',
          params: '{"q":"FastGPT"}'
        }
      }
    });
    expect(workflowStreamResponse).toHaveBeenCalledWith({
      id: call.id,
      event: SseResponseEventEnum.toolParams,
      data: {
        tool: {
          id: call.id,
          toolName: '',
          toolAvatar: '',
          params: '"q"'
        }
      }
    });
    expect(workflowStreamResponse).toHaveBeenCalledWith({
      id: call.id,
      event: SseResponseEventEnum.toolResponse,
      data: {
        tool: {
          id: call.id,
          toolName: '',
          toolAvatar: '',
          params: '',
          response: 'tool response'
        }
      }
    });
    expect(toolRunCollector.toolRunResponses).toEqual([
      expect.objectContaining({
        flowResponses: [
          expect.objectContaining({
            moduleName: 'chat:compress_llm_messages',
            totalPoints: 0.2
          })
        ]
      }),
      expect.objectContaining({
        flowResponses: [
          expect.objectContaining({
            id: call.id,
            moduleName: 'Search',
            toolRes: 'tool response'
          })
        ]
      })
    ]);
  });

  it('can hide selected tool stream events while keeping tool run records', () => {
    const workflowStreamResponse = vi.fn();
    const eventStream = createAgentLoopCoreEventStream({
      workflowStreamResponse,
      getToolInfo: () => ({
        name: 'Search'
      })
    });
    const toolRunCollector = createAgentLoopCoreToolRunResponseCollector({
      moduleType: FlowNodeTypeEnum.toolCall,
      getToolInfo: () => ({
        name: 'Search'
      })
    });
    const dispatcher = createAgentLoopCoreEventDispatcher({
      eventStream,
      toolRunCollector,
      shouldStreamTool: (name) => name !== 'hidden_tool'
    });
    const call = createCall({
      name: 'hidden_tool'
    });

    dispatcher.emitEvent({
      type: 'tool_call',
      call
    });
    dispatcher.emitEvent({
      type: 'tool_params',
      callId: call.id,
      argsDelta: '{}'
    });
    dispatcher.emitEvent({
      type: 'tool_run_end',
      call,
      response: 'hidden response',
      seconds: 0.1
    });

    expect(workflowStreamResponse).not.toHaveBeenCalled();
    expect(toolRunCollector.toolRunResponses).toEqual([
      expect.objectContaining({
        flowResponses: [
          expect.objectContaining({
            id: call.id,
            toolRes: 'hidden response'
          })
        ]
      })
    ]);
  });

  it('streams failed tool responses so the client can render them immediately', () => {
    const workflowStreamResponse = vi.fn();
    const eventStream = createAgentLoopCoreEventStream({
      workflowStreamResponse,
      getToolInfo: () => ({ name: 'Search' })
    });
    const dispatcher = createAgentLoopCoreEventDispatcher({ eventStream });
    const call = createCall({ id: 'call_failed' });

    dispatcher.emitEvent({
      type: 'tool_run_end',
      call,
      response: 'upstream unavailable',
      errorMessage: 'upstream unavailable',
      seconds: 0.1
    });

    expect(workflowStreamResponse).toHaveBeenCalledWith({
      id: call.id,
      event: SseResponseEventEnum.toolResponse,
      data: {
        tool: {
          id: call.id,
          toolName: '',
          toolAvatar: '',
          params: '',
          response: 'upstream unavailable'
        }
      }
    });
  });

  it('starts a new SSE answer value after streamed child assistant responses', () => {
    const workflowStreamResponse = vi.fn();
    const eventStream = createAgentLoopCoreEventStream({
      workflowStreamResponse,
      getToolInfo: () => ({ name: 'Search' })
    });
    const dispatcher = createAgentLoopCoreEventDispatcher({ eventStream });
    const call = createCall({ id: 'call_child' });

    dispatcher.emitEvent({
      type: 'llm_request_start',
      requestIndex: 0,
      modelName: 'GPT-4'
    });
    dispatcher.emitEvent({ type: 'answer_delta', text: 'child answer' });
    dispatcher.emitEvent({
      type: 'tool_run_end',
      call,
      response: 'child result',
      seconds: 0.1,
      assistantResponses: [{ text: { content: 'child answer' } }]
    });
    dispatcher.emitEvent({
      type: 'llm_request_start',
      requestIndex: 1,
      modelName: 'GPT-4'
    });
    dispatcher.emitEvent({ type: 'answer_delta', text: 'parent answer' });

    const answerEvents = workflowStreamResponse.mock.calls
      .map(([event]) => event)
      .filter((event) => event.event === SseResponseEventEnum.answer);

    expect(answerEvents).toHaveLength(2);
    expect(answerEvents[0]).not.toHaveProperty('id');
    expect(answerEvents[1]).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^answer-/),
        event: SseResponseEventEnum.answer
      })
    );
  });

  it('keeps the same SSE answer value for a later model request without child assistant responses', () => {
    const workflowStreamResponse = vi.fn();
    const eventStream = createAgentLoopCoreEventStream({
      workflowStreamResponse,
      getToolInfo: () => ({ name: 'Search' })
    });
    const dispatcher = createAgentLoopCoreEventDispatcher({ eventStream });

    dispatcher.emitEvent({
      type: 'llm_request_start',
      requestIndex: 0,
      modelName: 'GPT-4'
    });
    dispatcher.emitEvent({ type: 'answer_delta', text: 'first answer' });
    dispatcher.emitEvent({
      type: 'llm_request_start',
      requestIndex: 1,
      modelName: 'GPT-4'
    });
    dispatcher.emitEvent({ type: 'answer_delta', text: 'second answer' });

    const answerEvents = workflowStreamResponse.mock.calls
      .map(([event]) => event)
      .filter((event) => event.event === SseResponseEventEnum.answer);

    expect(answerEvents).toHaveLength(2);
    expect(answerEvents[0]).not.toHaveProperty('id');
    expect(answerEvents[1]).not.toHaveProperty('id');
  });

  it('passes context checkpoints to compression records when request ids are absent', () => {
    const eventStream = createAgentLoopCoreEventStream({
      workflowStreamResponse: vi.fn(),
      getToolInfo: () => ({ name: 'Search' })
    });
    const toolRunCollector = createAgentLoopCoreToolRunResponseCollector({
      moduleType: FlowNodeTypeEnum.toolCall,
      getToolInfo: () => ({ name: 'Search' })
    });
    const dispatcher = createAgentLoopCoreEventDispatcher({
      eventStream,
      toolRunCollector
    });
    const event = {
      type: 'after_message_compress' as const,
      modelName: 'GPT-4',
      usages: [
        {
          moduleName: 'account_usage:compress_llm_messages',
          totalPoints: 0.2
        }
      ],
      requestIds: [],
      seconds: 0.1,
      contextCheckpoint: '<context_checkpoint>same</context_checkpoint>'
    };

    dispatcher.emitEvent(event);
    dispatcher.emitEvent({ ...event, seconds: 0.2 });

    expect(toolRunCollector.toolRunResponses).toHaveLength(1);
  });

  it('streams a complete plan only for successful plan operations', () => {
    const workflowStreamResponse = vi.fn();
    const eventStream = createAgentLoopCoreEventStream({
      workflowStreamResponse,
      getToolInfo: () => ({ name: 'Search' })
    });
    const dispatcher = createAgentLoopCoreEventDispatcher({ eventStream });
    const plan = {
      planId: 'plan_1',
      name: 'Implementation plan',
      description: null,
      steps: [
        {
          id: 'step_1',
          name: 'Implement event merge',
          status: 'in_progress' as const
        }
      ]
    };

    dispatcher.emitEvent({
      type: 'plan_operation',
      operation: 'set_plan',
      success: true,
      message: 'plan created',
      plan
    });
    dispatcher.emitEvent({
      type: 'plan_operation',
      operation: 'update_steps',
      success: false,
      message: 'plan update failed'
    });

    expect(workflowStreamResponse).toHaveBeenCalledTimes(1);
    expect(workflowStreamResponse).toHaveBeenCalledWith({
      id: 'agent-plan-stream',
      event: SseResponseEventEnum.plan,
      data: { plan }
    });
  });
});

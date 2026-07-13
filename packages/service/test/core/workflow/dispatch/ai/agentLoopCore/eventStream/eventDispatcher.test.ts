import { describe, expect, it, vi } from 'vitest';
import {
  createAgentLoopCoreEventDispatcher,
  createAgentLoopCoreEventStream,
  createAgentLoopCoreToolRunResponseCollector
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';
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
  it('routes model, tool and compression events to stream and tool run collector', () => {
    const workflowStreamResponse = vi.fn();
    const eventStream = createAgentLoopCoreEventStream({
      workflowStreamResponse,
      streamAnswer: true,
      streamReasoning: true,
      sliceToolResponse: true,
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
      usages: [
        {
          moduleName: 'account_usage:compress_llm_messages',
          model: 'GPT-4',
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
      rawResponse: 'raw response',
      response: 'tool response',
      seconds: 0.3
    });
    dispatcher.emitEvent({
      type: 'tool_run_end',
      call,
      rawResponse: 'duplicate response',
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
      rawResponse: 'hidden response',
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

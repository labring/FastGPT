import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { createAgentLoopCoreRuntimeEnvironment } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';
import { describe, expect, it, vi } from 'vitest';

const toolCall = ({ id = 'call_search', name = 'search', args = '{}' } = {}) =>
  ({
    id,
    type: 'function',
    function: {
      name,
      arguments: args
    }
  }) as any;

describe('createAgentLoopCoreRuntimeEnvironment', () => {
  it('collects ordinary tool and plan node responses through their independent events', () => {
    const workflowStreamResponse = vi.fn();
    const nodeResponses: any[] = [];
    const environment = createAgentLoopCoreRuntimeEnvironment({
      node: {
        nodeId: 'agent_node',
        flowNodeType: FlowNodeTypeEnum.agent
      },
      workflowStreamResponse,
      nodeResponses,
      getToolInfo: (name) => ({
        name: name === 'search' ? 'Search' : name,
        avatar: ''
      })
    });

    environment.cacheNodeToolResult({
      callId: 'call_search',
      usages: [{ moduleName: 'tool', totalPoints: 1 }],
      nodeResponse: {
        id: 'call_search',
        nodeId: 'call_search',
        moduleType: FlowNodeTypeEnum.tool,
        moduleName: 'Search',
        llmRequestIds: ['req_tool']
      } as any
    });
    environment.emitEvent({
      type: 'tool_call',
      call: toolCall()
    });
    environment.emitEvent({
      type: 'tool_run_end',
      call: toolCall(),
      response: 'tool response',
      rawResponse: 'tool response',
      usages: [],
      seconds: 0.2
    });
    environment.emitEvent({
      type: 'plan_operation',
      operation: 'set_plan',
      success: true,
      message: 'plan ok',
      id: 'call_plan',
      params: '{"action":"set_plan"}',
      seconds: 0.1
    });

    expect(workflowStreamResponse.mock.calls.map(([event]) => event.id)).toEqual([
      'call_search',
      'call_search'
    ]);
    expect(nodeResponses).toEqual([
      expect.objectContaining({
        id: 'call_search',
        moduleName: 'Search',
        llmRequestIds: ['req_tool']
      }),
      expect.objectContaining({
        id: 'agent_node-plan-call_plan',
        moduleName: 'chat:plan_agent',
        agentPlanStatus: 'set_plan',
        textOutput: 'plan ok'
      })
    ]);
  });

  it('collects ToolCall child flow responses from compression and tool events', () => {
    const environment = createAgentLoopCoreRuntimeEnvironment({
      node: {
        nodeId: 'toolcall_node',
        flowNodeType: FlowNodeTypeEnum.toolCall
      },
      collectToolRunResponses: true,
      getToolInfo: (name) => ({
        name: name === 'search' ? 'Search' : name,
        avatar: ''
      })
    });
    const usage = {
      moduleName: 'compress',
      inputTokens: 10,
      outputTokens: 2,
      totalPoints: 0.1
    };

    environment.emitEvent({
      type: 'after_message_compress',
      usages: [usage],
      requestIds: ['req_compress'],
      seconds: 0.1
    });
    environment.cacheToolFlowResponse({
      callId: toolCall().id,
      flowResponse: {
        flowResponses: [
          {
            id: 'search_node',
            nodeId: 'search_node',
            moduleType: FlowNodeTypeEnum.tool,
            moduleName: 'Search'
          } as any
        ],
        flowUsages: [],
        runTimes: 0.2
      }
    });
    environment.emitEvent({
      type: 'tool_run_end',
      call: toolCall(),
      response: 'tool response',
      rawResponse: 'tool response',
      usages: [],
      seconds: 0.2
    });

    expect(environment.toolRunResponses).toEqual([
      expect.objectContaining({
        flowResponses: [
          expect.objectContaining({
            id: 'req_compress',
            moduleName: 'chat:compress_llm_messages',
            moduleType: FlowNodeTypeEnum.toolCall
          })
        ],
        flowUsages: [usage]
      }),
      expect.objectContaining({
        flowResponses: [
          expect.objectContaining({
            id: 'search_node',
            moduleName: 'Search'
          })
        ]
      })
    ]);
  });
});

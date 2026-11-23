import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { createAgentLoopCoreRuntimeEnvironment } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/application/runtime/environment';
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
      seconds: 0.1,
      plan: {
        planId: 'plan_1',
        name: 'Implementation plan',
        description: null,
        steps: [{ id: 'step_1', name: 'Implement plan events', status: 'pending' }]
      }
    });

    expect(workflowStreamResponse.mock.calls.map(([event]) => event.id)).toEqual([
      'call_search',
      'call_search',
      'agent-plan-stream'
    ]);
    expect(nodeResponses).toEqual([
      expect.objectContaining({
        id: 'call_search',
        moduleName: 'Search',
        llmRequestIds: ['req_tool']
      }),
      expect.objectContaining({
        id: 'agent_node-plan-call_plan',
        moduleName: 'chat:plan_update',
        agentPlanStatus: 'set_plan',
        agentPlanResult: 'plan ok'
      })
    ]);
  });
});

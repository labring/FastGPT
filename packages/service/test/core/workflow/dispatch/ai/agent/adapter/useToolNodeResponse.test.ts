import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useToolNodeResponse } from '@fastgpt/service/core/workflow/dispatch/ai/agent/adapter/useToolNodeResponse';

const createTool = (name: string) =>
  ({
    type: 'function',
    function: {
      name,
      description: `${name} description`,
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }) as any;

const createCall = ({
  id = 'call_search',
  name = 'search',
  args = '{}'
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

const createHook = ({
  nodeResponses = [],
  getSubAppInfo = () => ({
    name: 'Search',
    avatar: 'tool-avatar',
    toolDescription: ''
  }),
  toolCatalog = {
    runtimeTools: [],
    updatePlanTool: createTool('update_plan'),
    askTool: createTool('ask_agent')
  }
}: {
  nodeResponses?: any[];
  getSubAppInfo?: (id: string) => any;
  toolCatalog?: any;
} = {}) => ({
  nodeResponses,
  ...useToolNodeResponse({
    node: {
      nodeId: 'agent_node',
      flowNodeType: FlowNodeTypeEnum.agent
    },
    nodeResponses,
    toolCatalog,
    getSubAppInfo
  })
});

describe('agent adapter useToolNodeResponse', () => {
  it('attaches compression child to cached tool node response and ignores duplicate events', () => {
    const hook = createHook();
    const call = createCall();

    hook.cacheToolResult({
      callId: 'call_search',
      usages: [],
      nodeResponse: {
        id: 'call_search',
        nodeId: 'call_search',
        moduleType: FlowNodeTypeEnum.tool,
        moduleName: 'Search',
        childTotalPoints: 999,
        childrenResponses: [
          {
            id: 'existing_child',
            nodeId: 'existing_child',
            moduleType: FlowNodeTypeEnum.agent,
            moduleName: 'Existing child',
            totalPoints: 0.4
          }
        ]
      }
    });
    hook.appendToolNodeResponse({
      type: 'tool_response',
      call,
      response: 'tool response',
      seconds: 0.8,
      toolResponseCompress: {
        response: 'compressed response',
        usage: {
          moduleName: 'account_usage:tool_response_compress',
          model: 'GPT-4',
          inputTokens: 4,
          outputTokens: 2,
          totalPoints: 0.6
        },
        requestIds: ['', 'req_compress'],
        seconds: 0.5
      }
    } as any);
    hook.appendToolNodeResponse({
      type: 'tool_response',
      call,
      response: 'duplicated response',
      seconds: 0.9
    } as any);

    expect(hook.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'call_search',
        runningTime: 0.8,
        toolRes: 'tool response',
        childTotalPoints: 1,
        childrenResponses: [
          expect.objectContaining({
            id: 'existing_child',
            totalPoints: 0.4
          }),
          expect.objectContaining({
            id: 'req_compress',
            moduleName: 'chat:tool_response_compress',
            llmRequestIds: ['req_compress'],
            textOutput: 'compressed response',
            totalPoints: 0.6
          })
        ]
      })
    ]);
  });

  it('creates fallback tool node response from cached usages when workflow node response is absent', () => {
    const hook = createHook({
      getSubAppInfo: () => ({
        name: '',
        avatar: 'fallback-avatar',
        toolDescription: ''
      })
    });
    const call = createCall({
      id: 'call_unknown',
      name: 'unknown_tool',
      args: ''
    });

    hook.cacheToolResult({
      callId: 'call_unknown',
      usages: [
        {
          moduleName: 'usage_1',
          totalPoints: 0.2
        },
        {
          moduleName: 'usage_2'
        }
      ]
    });
    hook.appendToolNodeResponse({
      type: 'tool_response',
      call,
      response: 'fallback response',
      seconds: 0.7
    } as any);

    expect(hook.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'call_unknown',
        nodeId: 'call_unknown',
        moduleType: FlowNodeTypeEnum.tool,
        moduleName: 'unknown_tool',
        moduleLogo: 'fallback-avatar',
        runningTime: 0.7,
        toolInput: undefined,
        toolRes: 'fallback response',
        totalPoints: 0.2
      })
    ]);
  });

  it('records ask and plan tool responses with plan statuses and compression child', () => {
    const hook = createHook();

    hook.appendToolNodeResponse({
      type: 'tool_response',
      call: createCall({
        id: 'call_ask',
        name: 'ask_agent'
      }),
      response: 'need more info',
      seconds: 0.3,
      toolResponseCompress: {
        response: 'compressed ask',
        usage: {
          moduleName: 'account_usage:tool_response_compress',
          model: 'GPT-4',
          totalPoints: 0.1
        },
        requestIds: [],
        seconds: 0.2
      }
    } as any);
    hook.appendToolNodeResponse({
      type: 'tool_response',
      call: createCall({
        id: 'call_set_plan',
        name: 'update_plan',
        args: '{"updates":[{"action":"set_plan"}]}'
      }),
      response: 'plan set',
      seconds: 0.04
    } as any);
    hook.appendToolNodeResponse({
      type: 'tool_response',
      call: createCall({
        id: 'call_update_plan',
        name: 'update_plan',
        args: '{"updates":[{"action":"finish"}]}'
      }),
      response: 'plan updated',
      seconds: 0.06
    } as any);

    expect(hook.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'agent_node-plan-call_ask',
        moduleName: 'chat:plan_agent',
        runningTime: 0.3,
        agentPlanStatus: 'ask_question',
        textOutput: 'need more info',
        childTotalPoints: 0.1,
        childrenResponses: [
          expect.objectContaining({
            moduleName: 'chat:tool_response_compress',
            llmRequestIds: undefined,
            textOutput: 'compressed ask'
          })
        ]
      }),
      expect.objectContaining({
        id: 'agent_node-plan-call_set_plan',
        runningTime: 0.04,
        agentPlanStatus: 'set_plan',
        textOutput: 'plan set'
      }),
      expect.objectContaining({
        id: 'agent_node-plan-call_update_plan',
        runningTime: 0.06,
        agentPlanStatus: 'update_plan',
        textOutput: 'plan updated'
      })
    ]);
  });
});

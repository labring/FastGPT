import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { createAgentLoopCoreNodeResponseEventCollector } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';
import { describe, expect, it } from 'vitest';

const toolCall = ({ id, name, args = '{}' }: { id: string; name: string; args?: string }) =>
  ({
    id,
    type: 'function',
    function: {
      name,
      arguments: args
    }
  }) as const;

const createCollector = () => {
  const nodeResponses: any[] = [];
  const collector = createAgentLoopCoreNodeResponseEventCollector({
    node: {
      nodeId: 'agent_node',
      flowNodeType: FlowNodeTypeEnum.agent
    },
    nodeResponses,
    getToolInfo: (name) => ({
      name: name === 'search' ? 'Search' : name,
      avatar: 'tool-avatar'
    })
  });

  return {
    collector,
    nodeResponses
  };
};

describe('createAgentLoopCoreNodeResponseEventCollector', () => {
  it('records main agent request node responses', () => {
    const { collector, nodeResponses } = createCollector();

    const event = {
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_1',
      finishReason: 'stop',
      answerText: 'answer',
      reasoningText: 'reason',
      usages: [
        {
          model: 'GPT-4',
          inputTokens: 10,
          outputTokens: 5,
          totalPoints: 1
        }
      ],
      seconds: 0.2
    } as const;
    collector.emitEvent(event);
    collector.emitEvent(event);

    expect(nodeResponses).toEqual([
      expect.objectContaining({
        id: 'agent_node-1-req_1',
        nodeId: 'agent_node-main_agent-1',
        moduleName: 'chat:master_agent_call',
        moduleType: FlowNodeTypeEnum.agent,
        model: 'GPT-4',
        llmRequestIds: ['req_1'],
        inputTokens: 10,
        outputTokens: 5,
        totalPoints: 1,
        finishReason: 'stop',
        textOutput: 'answer',
        reasoningText: 'reason',
        runningTime: 0.2
      })
    ]);
  });

  it('records tool responses with cached nodeResponse and compression child', () => {
    const { collector, nodeResponses } = createCollector();

    collector.cacheToolResult({
      callId: 'call_search',
      usages: [
        {
          totalPoints: 2
        }
      ],
      nodeResponse: {
        id: 'call_search',
        nodeId: 'call_search',
        moduleType: FlowNodeTypeEnum.tool,
        moduleName: 'Search'
      } as any
    });
    collector.emitEvent({
      type: 'tool_run_end',
      call: toolCall({
        id: 'call_search',
        name: 'search'
      }),
      rawResponse: 'raw',
      response: 'compressed',
      seconds: 0.5,
      toolResponseCompress: {
        response: 'compressed',
        usage: {
          model: 'GPT-4',
          inputTokens: 8,
          outputTokens: 2,
          totalPoints: 0.3
        },
        requestIds: ['req_compress'],
        seconds: 0.1
      }
    });

    expect(nodeResponses).toEqual([
      expect.objectContaining({
        id: 'call_search',
        moduleName: 'Search',
        runningTime: 0.5,
        toolRes: 'compressed',
        childTotalPoints: 0.3,
        childrenResponses: [
          expect.objectContaining({
            id: 'req_compress',
            moduleName: 'chat:tool_response_compress',
            totalPoints: 0.3,
            textOutput: 'compressed'
          })
        ]
      })
    ]);
  });

  it('records plan and ask control node responses once', () => {
    const { collector, nodeResponses } = createCollector();

    collector.emitEvent({
      type: 'plan_operation',
      operation: 'set_plan',
      success: true,
      message: 'plan created',
      id: 'call_plan',
      seconds: 0.2
    });
    collector.emitEvent({
      type: 'plan_operation',
      operation: 'set_plan',
      success: true,
      message: 'plan created again',
      id: 'call_plan',
      seconds: 0.3
    });
    collector.emitEvent({
      type: 'ask_start',
      id: 'call_ask',
      seconds: 0.1,
      params: '{}',
      ask: {
        reason: 'Need input',
        blockerType: 'missing_required_input',
        question: 'Confirm?',
        options: ['Yes']
      }
    });

    expect(nodeResponses).toEqual([
      expect.objectContaining({
        id: 'agent_node-plan-call_plan',
        moduleName: 'chat:plan_agent',
        textOutput: 'plan created',
        agentPlanStatus: 'set_plan'
      }),
      expect.objectContaining({
        id: 'agent_node-ask-call_ask',
        moduleName: 'chat:collect_questions',
        textOutput: 'Confirm?'
      })
    ]);
  });
});

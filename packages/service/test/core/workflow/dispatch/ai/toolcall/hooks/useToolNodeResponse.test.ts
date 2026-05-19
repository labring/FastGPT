import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useToolNodeResponse } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/hooks/useToolNodeResponse';

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

describe('useToolNodeResponse', () => {
  it('caches completed tool flow response and attaches compression child', () => {
    const hook = useToolNodeResponse({
      moduleType: FlowNodeTypeEnum.toolCall,
      getToolInfo: () => ({
        name: 'Search',
        avatar: 'tool-avatar'
      })
    });
    const call = createCall();
    const flowResponse = {
      flowResponses: [
        {
          id: 'prepare',
          nodeId: 'prepare',
          moduleType: FlowNodeTypeEnum.tool,
          moduleName: 'Prepare'
        },
        {
          id: 'search',
          nodeId: 'search',
          moduleType: FlowNodeTypeEnum.tool,
          moduleName: 'Search',
          childrenResponses: [
            {
              id: 'existing_child',
              nodeId: 'existing_child',
              moduleType: FlowNodeTypeEnum.toolCall,
              moduleName: 'Existing'
            }
          ]
        }
      ],
      flowUsages: [],
      runTimes: 0
    };

    hook.cacheToolFlowResponse({
      call,
      flowResponse
    });
    hook.appendToolNodeResponse({
      call,
      response: 'raw response',
      seconds: 0.8,
      toolResponseCompress: {
        response: 'compressed response',
        usage: {
          moduleName: 'account_usage:tool_response_compress',
          model: 'GPT-4',
          totalPoints: 0.3
        },
        requestIds: ['req_compress'],
        seconds: 0.4
      }
    });

    expect(hook.toolRunResponses).toEqual([
      expect.objectContaining({
        flowResponses: [
          expect.objectContaining({
            id: 'prepare'
          }),
          expect.objectContaining({
            id: 'search',
            childrenResponses: [
              expect.objectContaining({
                id: 'existing_child'
              }),
              expect.objectContaining({
                id: 'req_compress',
                moduleName: 'chat:tool_response_compress',
                moduleType: FlowNodeTypeEnum.toolCall,
                moduleLogo: 'core/app/agent/child/contextCompress',
                runningTime: 0.4,
                model: 'GPT-4',
                textOutput: 'compressed response',
                llmRequestIds: ['req_compress'],
                totalPoints: 0.3
              })
            ]
          })
        ],
        flowUsages: [
          {
            moduleName: 'account_usage:tool_response_compress',
            model: 'GPT-4',
            totalPoints: 0.3
          }
        ]
      })
    ]);
  });

  it('falls back when no cached flow response exists and supports standalone appends', () => {
    const hook = useToolNodeResponse({
      moduleType: FlowNodeTypeEnum.toolCall,
      getToolInfo: () => undefined
    });
    const call = createCall({
      name: 'unknown'
    });

    hook.cacheToolFlowResponse({
      call,
      flowResponse: undefined
    });
    hook.appendToolNodeResponse({
      call,
      response: 'failed',
      errorMessage: 'failed',
      seconds: 0.6
    });
    hook.appendToolFlowResponse({
      flowResponses: [
        {
          id: 'interactive',
          nodeId: 'interactive',
          moduleType: FlowNodeTypeEnum.tool,
          moduleName: 'Interactive'
        }
      ],
      flowUsages: [],
      runTimes: 0
    });
    hook.appendContextCompressNodeResponse({
      usage: {
        moduleName: 'account_usage:compress_llm_messages',
        model: 'GPT-4',
        totalPoints: 0.2
      },
      requestIds: [],
      seconds: 0.1
    });

    expect(hook.toolRunResponses).toEqual([
      expect.objectContaining({
        flowResponses: [
          expect.objectContaining({
            id: 'call_search',
            nodeId: 'call_search',
            moduleType: FlowNodeTypeEnum.tool,
            moduleName: 'unknown',
            toolId: 'unknown',
            toolInput: {
              q: 'FastGPT'
            },
            toolRes: 'failed',
            errorText: 'failed',
            runningTime: 0.6,
            totalPoints: 0
          })
        ]
      }),
      expect.objectContaining({
        flowResponses: [
          expect.objectContaining({
            id: 'interactive',
            moduleName: 'Interactive'
          })
        ]
      }),
      expect.objectContaining({
        flowResponses: [
          expect.objectContaining({
            id: expect.stringMatching(/^[a-zA-Z0-9]+$/),
            moduleName: 'chat:compress_llm_messages',
            moduleType: FlowNodeTypeEnum.toolCall,
            moduleLogo: 'core/app/agent/child/contextCompress',
            runningTime: 0.1,
            llmRequestIds: undefined,
            totalPoints: 0.2,
            compressTextAgent: {
              inputTokens: 0,
              outputTokens: 0,
              totalPoints: 0.2
            }
          })
        ],
        flowUsages: [
          {
            moduleName: 'account_usage:compress_llm_messages',
            model: 'GPT-4',
            totalPoints: 0.2
          }
        ]
      })
    ]);
  });

  it('falls back with tool info and keeps an empty cached response unchanged', () => {
    const hook = useToolNodeResponse({
      moduleType: FlowNodeTypeEnum.toolCall,
      getToolInfo: () => ({
        name: 'Search',
        avatar: 'tool-avatar'
      })
    });

    hook.appendToolNodeResponse({
      call: createCall(),
      response: 'raw response',
      seconds: 0.7
    });

    const emptyFlowResponse = {
      flowResponses: [],
      flowUsages: [],
      runTimes: 0
    };
    hook.cacheToolFlowResponse({
      call: createCall({ id: 'call_empty' }),
      flowResponse: emptyFlowResponse
    });
    hook.appendToolNodeResponse({
      call: createCall({ id: 'call_empty' }),
      seconds: 0.9,
      toolResponseCompress: {
        response: 'compressed response',
        usage: {
          moduleName: 'account_usage:tool_response_compress',
          model: 'GPT-4',
          totalPoints: 0.1
        },
        requestIds: ['req_empty_compress'],
        seconds: 0.2
      }
    });

    expect(hook.toolRunResponses[0]).toEqual(
      expect.objectContaining({
        flowResponses: [
          expect.objectContaining({
            id: 'call_search',
            moduleName: 'Search',
            moduleLogo: 'tool-avatar',
            toolId: 'search',
            toolRes: 'raw response',
            runningTime: 0.7,
            totalPoints: 0
          })
        ],
        flowUsages: []
      })
    );
    expect(hook.toolRunResponses[1]).toBe(emptyFlowResponse);
  });
});

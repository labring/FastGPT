import { describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useToolNodeResponse } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/hooks/useToolNodeResponse';
import { summarizeRuntimeNodeResponses } from '@fastgpt/service/core/workflow/dispatch/utils';

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
  it('does not write an afterTool wrapper when the child workflow already wrote real nodeResponses', async () => {
    const writer = {
      record: vi.fn(),
      recordWithParent: vi.fn(async (responses = []) => responses)
    };
    const hook = useToolNodeResponse({
      moduleType: FlowNodeTypeEnum.toolCall,
      nodeResponseWriter: writer,
      nodeResponseParentId: 'tool_call_parent'
    });
    const call = createCall();
    const childNodeResponses = [
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
    ];
    const flowResponse = {
      runtimeNodeResponseSummary: summarizeRuntimeNodeResponses(undefined, childNodeResponses),
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
    await Promise.resolve();

    expect(writer.recordWithParent).toHaveBeenCalledWith(
      [
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
      ],
      'tool_call_parent'
    );
    expect(writer.record).not.toHaveBeenCalled();
    expect(hook.toolDispatchSummary).toEqual(
      expect.objectContaining({
        runTimes: 0,
        toolTotalPoints: 0.3,
        runtimeNodeResponseSummary: expect.objectContaining({
          responseIds: ['prepare', 'search', 'existing_child', 'req_compress'],
          childResponseCount: 4,
          childTotalPoints: 0.3
        })
      })
    );
  });

  it('writes built-in tool nodeResponses on afterTool because they do not run child workflow', async () => {
    const writer = {
      record: vi.fn(),
      recordWithParent: vi.fn(async (responses = []) => responses)
    };
    const hook = useToolNodeResponse({
      moduleType: FlowNodeTypeEnum.toolCall,
      nodeResponseWriter: writer,
      nodeResponseParentId: 'tool_call_parent'
    });
    const call = createCall({
      id: 'call_shell',
      name: 'sandbox_shell'
    });
    const builtinNodeResponse = {
      id: 'sandbox_response',
      nodeId: 'sandbox_response',
      moduleType: FlowNodeTypeEnum.tool,
      moduleName: 'Run shell',
      moduleLogo: 'sandbox-avatar',
      toolId: 'sandbox_shell',
      toolInput: {
        cmd: 'ls'
      },
      toolRes: 'sandbox ok',
      totalPoints: 0,
      runningTime: 0.5
    };

    hook.cacheToolFlowResponse({
      call,
      flowResponse: {
        runtimeNodeResponseSummary: summarizeRuntimeNodeResponses(undefined, [builtinNodeResponse]),
        builtinNodeResponses: [builtinNodeResponse],
        flowUsages: [],
        runTimes: 0
      }
    });
    hook.appendToolNodeResponse({
      call,
      response: 'sandbox ok',
      seconds: 0.5
    });
    await Promise.resolve();

    expect(writer.recordWithParent).toHaveBeenCalledTimes(1);
    expect(writer.recordWithParent).toHaveBeenCalledWith([builtinNodeResponse], 'tool_call_parent');
    expect(writer.record).not.toHaveBeenCalled();
    expect(hook.toolDispatchSummary).toEqual(
      expect.objectContaining({
        runTimes: 0,
        toolTotalPoints: 0,
        runtimeNodeResponseSummary: expect.objectContaining({
          responseIds: ['sandbox_response'],
          finishedNodeIds: ['sandbox_response'],
          childResponseCount: 1,
          childTotalPoints: 0
        })
      })
    );
  });

  it('falls back when no cached flow response exists and supports standalone appends', () => {
    const hook = useToolNodeResponse({
      moduleType: FlowNodeTypeEnum.toolCall
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
    hook.appendInteractiveToolSummary({
      runtimeNodeResponseSummary: summarizeRuntimeNodeResponses(undefined, [
        {
          id: 'interactive',
          nodeId: 'interactive',
          moduleType: FlowNodeTypeEnum.tool,
          moduleName: 'Interactive'
        }
      ]),
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

    expect(hook.toolDispatchSummary).toEqual(
      expect.objectContaining({
        runTimes: 0,
        toolTotalPoints: 0.2,
        runtimeNodeResponseSummary: expect.objectContaining({
          responseIds: expect.arrayContaining(['interactive']),
          finishedNodeIds: expect.arrayContaining(['interactive']),
          hasError: false,
          runningTime: 0.1,
          childResponseCount: 2,
          childTotalPoints: 0.2
        })
      })
    );
    expect(hook.toolDispatchSummary.runtimeNodeResponseSummary.responseIds).toHaveLength(2);
  });

  it('ignores empty cached response details and records only compression nodes', () => {
    const hook = useToolNodeResponse({
      moduleType: FlowNodeTypeEnum.toolCall
    });

    hook.appendToolNodeResponse({
      call: createCall(),
      response: 'raw response',
      seconds: 0.7
    });

    const emptyFlowResponse = {
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

    expect(hook.toolDispatchSummary).toEqual(
      expect.objectContaining({
        runTimes: 0,
        toolTotalPoints: 0.1,
        runtimeNodeResponseSummary: expect.objectContaining({
          responseIds: ['req_empty_compress'],
          finishedNodeIds: ['req_empty_compress'],
          childResponseCount: 1,
          childTotalPoints: 0.1,
          runningTime: 0.2
        })
      })
    );
  });

  it('tolerates tool flow responses without flowUsages', () => {
    const hook = useToolNodeResponse({
      moduleType: FlowNodeTypeEnum.toolCall
    });

    expect(() =>
      hook.appendInteractiveToolSummary({
        runtimeNodeResponseSummary: summarizeRuntimeNodeResponses(undefined, [
          {
            id: 'search_without_usage',
            nodeId: 'search_without_usage',
            moduleType: FlowNodeTypeEnum.tool,
            moduleName: 'Search'
          }
        ]),
        runTimes: 1
      })
    ).not.toThrow();

    expect(hook.toolDispatchSummary).toEqual(
      expect.objectContaining({
        runTimes: 1,
        toolTotalPoints: 0,
        runtimeNodeResponseSummary: expect.objectContaining({
          responseIds: ['search_without_usage'],
          childResponseCount: 1
        })
      })
    );
  });

  it('writes tool responses through writer and accumulates runtime summary', async () => {
    const writes: any[][] = [];
    const writer = {
      record: vi.fn(async (responses = []) => {
        writes.push(responses);
        return responses;
      }),
      recordWithParent: vi.fn(async (responses = [], parentId?: string) => {
        const rows = responses.map((response) => ({
          ...response,
          parentId: response.parentId || parentId
        }));
        writes.push(rows);
        return rows;
      })
    };
    const hook = useToolNodeResponse({
      moduleType: FlowNodeTypeEnum.toolCall,
      nodeResponseWriter: writer,
      nodeResponseParentId: 'tool_call_parent'
    });
    const call = createCall();

    hook.cacheToolFlowResponse({
      call,
      flowResponse: {
        runtimeNodeResponseSummary: summarizeRuntimeNodeResponses(undefined, [
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
            moduleName: 'Search'
          }
        ]),
        flowUsages: [],
        runTimes: 1
      }
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
    await Promise.resolve();

    expect(writer.recordWithParent).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'req_compress',
          textOutput: 'compressed response'
        })
      ],
      'tool_call_parent'
    );
    expect(writer.record).not.toHaveBeenCalled();
    expect(writes.map((batch) => batch.map((item) => item.id))).toEqual([['req_compress']]);
    expect(hook.toolDispatchSummary).toEqual(
      expect.objectContaining({
        runTimes: 1,
        toolTotalPoints: 0.3,
        runtimeNodeResponseSummary: expect.objectContaining({
          responseIds: ['prepare', 'search', 'req_compress'],
          childResponseCount: 3,
          childTotalPoints: 0.3
        })
      })
    );
  });
});

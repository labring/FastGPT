import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentLoopCoreWorkflowToolRunner } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';

const createCall = ({
  id = 'call_1',
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

const createRunner = ({
  getToolInfo,
  runtimeNodes = [],
  runtimeEdges = [],
  runWorkflowTool = vi.fn()
}: {
  getToolInfo: (name: string) => any;
  runtimeNodes?: any[];
  runtimeEdges?: any[];
  runWorkflowTool?: ReturnType<typeof vi.fn>;
}) => {
  const cacheToolFlowResponse = vi.fn();
  const runner = createAgentLoopCoreWorkflowToolRunner({
    runtimeNodes,
    runtimeEdges,
    getToolInfo,
    runWorkflowTool,
    cacheToolFlowResponse
  });

  return {
    ...runner,
    cacheToolFlowResponse,
    runWorkflowTool
  };
};

describe('createAgentLoopCoreWorkflowToolRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a stable not-found result without caching flow response', async () => {
    const { runTool, cacheToolFlowResponse } = createRunner({
      getToolInfo: () => undefined
    });

    await expect(
      runTool({
        call: createCall()
      })
    ).resolves.toEqual({
      response: 'Call tool not found',
      assistantMessages: [],
      usages: [],
      interactive: undefined,
      stop: false
    });
    expect(cacheToolFlowResponse).not.toHaveBeenCalled();
  });

  it('does not execute sandbox system tools through the runtime tool runner', async () => {
    const { runTool, cacheToolFlowResponse } = createRunner({
      getToolInfo: () => ({
        type: 'sandbox',
        name: 'Run shell',
        avatar: 'sandbox-avatar'
      })
    });
    const call = createCall({
      id: 'call_shell',
      name: 'sandbox_shell',
      args: '{"cmd":"ls"}'
    });

    const result = await runTool({ call });

    expect(result).toEqual({
      response:
        'sandbox_shell is an agent-loop system tool and cannot be executed as a runtime tool.',
      assistantMessages: [],
      usages: [],
      interactive: undefined,
      stop: false
    });
    expect(cacheToolFlowResponse).not.toHaveBeenCalled();
  });

  it('does not execute read-file system tools through the runtime tool runner', async () => {
    const { runTool, cacheToolFlowResponse } = createRunner({
      getToolInfo: () => ({
        type: 'file',
        name: 'File parse',
        avatar: 'file-avatar'
      })
    });
    const call = createCall({
      id: 'call_read',
      name: 'read_files',
      args: '{"ids":["file_1","missing"]}'
    });

    const result = await runTool({ call });

    expect(result).toEqual({
      response: 'read_files is an agent-loop system tool and cannot be executed as a runtime tool.',
      assistantMessages: [],
      usages: [],
      interactive: undefined,
      stop: false
    });
    expect(cacheToolFlowResponse).not.toHaveBeenCalled();
  });

  it('does not execute dataset search system tools through the runtime tool runner', async () => {
    const { runTool, cacheToolFlowResponse } = createRunner({
      getToolInfo: () => ({
        type: 'datasetSearch',
        name: 'Dataset search',
        avatar: 'dataset-avatar'
      })
    });
    const call = createCall({
      id: 'call_dataset_search',
      name: 'dataset_search',
      args: '{"datasetSearchInput":"red shoes","limit":3}'
    });

    const result = await runTool({ call });

    expect(result).toEqual({
      response:
        'dataset_search is an agent-loop system tool and cannot be executed as a runtime tool.',
      assistantMessages: [],
      usages: [],
      interactive: undefined,
      stop: false
    });
    expect(cacheToolFlowResponse).not.toHaveBeenCalled();
  });

  it('runs user workflow tools and interactive resume paths', async () => {
    const usage = {
      moduleName: 'tool',
      totalPoints: 1
    };
    const runtimeNodes = [
      {
        nodeId: 'search',
        inputs: [
          {
            key: 'q',
            value: 'old'
          }
        ]
      }
    ];
    const runtimeEdges = [
      {
        target: 'search'
      }
    ];
    const runWorkflowTool = vi
      .fn()
      .mockResolvedValueOnce({
        toolResponses: {
          answer: 'workflow ok'
        },
        assistantResponses: [
          { text: { content: 'assistant text' } },
          {
            tools: [
              {
                id: 'call_nested',
                toolName: 'Nested search',
                toolAvatar: 'nested-avatar',
                functionName: 'nested_search',
                params: '{"q":"nested"}',
                response: 'nested result'
              }
            ]
          }
        ],
        flowUsages: [usage],
        workflowInteractiveResponse: {
          type: 'userSelect'
        },
        flowResponses: [
          {
            toolStop: true
          }
        ]
      })
      .mockResolvedValueOnce({
        toolResponses: 'interactive ok',
        assistantResponses: [],
        flowUsages: [],
        workflowInteractiveResponse: undefined,
        flowResponses: [
          {
            toolStop: false
          }
        ]
      });
    const { runTool, runInteractiveTool, cacheToolFlowResponse } = createRunner({
      runtimeNodes,
      runtimeEdges,
      runWorkflowTool,
      getToolInfo: () => ({
        type: 'user',
        name: 'Search',
        avatar: 'tool-avatar',
        rawData: {
          nodeId: 'search'
        }
      })
    });
    const call = createCall({
      id: 'call_search',
      name: 'search',
      args: '{"q":"FastGPT"}'
    });

    const result = await runTool({ call });

    expect(runtimeNodes[0]).toEqual({
      nodeId: 'search',
      isEntry: true,
      inputs: [
        {
          key: 'q',
          value: 'FastGPT'
        }
      ]
    });
    expect(runtimeEdges[0]).toEqual({
      target: 'search',
      status: 'active'
    });
    expect(result.response).toBe(JSON.stringify({ answer: 'workflow ok' }, null, 2));
    expect(result.usages).toEqual([usage]);
    expect(result.interactive).toEqual({
      type: 'userSelect'
    });
    expect(result.stop).toBe(true);
    expect(result.assistantMessages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'assistant text',
        tool_calls: [
          expect.objectContaining({
            id: 'call_nested',
            function: {
              name: 'nested_search',
              arguments: '{"q":"nested"}'
            }
          })
        ]
      }),
      {
        role: 'tool',
        tool_call_id: 'call_nested',
        content: 'nested result'
      }
    ]);
    expect(cacheToolFlowResponse).toHaveBeenCalledWith({
      callId: call.id,
      flowResponse: expect.objectContaining({
        flowUsages: [usage],
        flowResponses: [
          {
            toolStop: true
          }
        ]
      })
    });

    const interactiveResult = await runInteractiveTool({
      childrenResponse: {
        entryNodeIds: ['search']
      },
      toolParams: {
        toolCallId: 'call_interactive'
      }
    } as any);

    expect(cacheToolFlowResponse).toHaveBeenLastCalledWith({
      callId: 'call_interactive',
      flowResponse: expect.objectContaining({
        flowResponses: [
          {
            toolStop: false
          }
        ]
      })
    });
    expect(interactiveResult).toEqual({
      response: 'interactive ok',
      assistantMessages: [],
      usages: [],
      interactive: undefined,
      stop: false
    });
  });
});

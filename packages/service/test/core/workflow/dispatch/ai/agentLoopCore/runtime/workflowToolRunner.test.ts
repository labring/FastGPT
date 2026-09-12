import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentLoopCoreWorkflowToolRunner } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/application/runtime/workflowToolRunner';

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
      args: '{"urls":["https://files.example.com/file_1","https://files.example.com/missing"]}'
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
            value: 'old',
            renderTypeList: ['input', 'agentGenerated'],
            selectedType: 'agentGenerated'
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

    // runTool 使用子图快照，不应污染父流程共享的 runtimeNodes/runtimeEdges。
    expect(runtimeNodes[0]).toEqual({
      nodeId: 'search',
      inputs: [
        {
          key: 'q',
          value: 'old',
          renderTypeList: ['input', 'agentGenerated'],
          selectedType: 'agentGenerated'
        }
      ]
    });
    expect(runtimeEdges[0]).toEqual({
      target: 'search'
    });
    expect(runWorkflowTool).toHaveBeenCalledWith({
      runtimeNodes: [
        {
          nodeId: 'search',
          isEntry: true,
          inputs: [
            {
              key: 'q',
              renderTypeList: ['input', 'agentGenerated'],
              selectedType: 'agentGenerated',
              value: 'FastGPT'
            }
          ]
        }
      ],
      runtimeEdges: [
        {
          target: 'search',
          status: 'active'
        }
      ]
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

  it('does not retain omitted agent-generated params across same-turn tool calls', async () => {
    const runtimeNodes = [
      {
        nodeId: 'mcp_tool',
        inputs: [
          {
            key: 'query',
            value: '',
            renderTypeList: ['input', 'agentGenerated'],
            selectedType: 'agentGenerated'
          },
          {
            key: 'filter',
            value: '',
            renderTypeList: ['input', 'agentGenerated'],
            selectedType: 'agentGenerated'
          }
        ]
      }
    ];
    const runtimeEdges = [{ target: 'mcp_tool' }];
    const runWorkflowTool = vi.fn().mockResolvedValue({
      toolResponses: 'ok',
      assistantResponses: [],
      flowUsages: [],
      flowResponses: []
    });
    const { runTool } = createRunner({
      runtimeNodes,
      runtimeEdges,
      runWorkflowTool,
      getToolInfo: () => ({
        type: 'user',
        name: 'MCP tool',
        avatar: 'tool-avatar',
        rawData: {
          nodeId: 'mcp_tool'
        }
      })
    });

    await runTool({
      call: createCall({
        id: 'call_1',
        name: 'mcp_tool',
        args: '{"query":"A","filter":"x"}'
      })
    });
    await runTool({
      call: createCall({
        id: 'call_2',
        name: 'mcp_tool',
        args: '{"query":"B"}'
      })
    });

    expect(runWorkflowTool).toHaveBeenCalledTimes(2);
    expect(runWorkflowTool.mock.calls[0][0].runtimeNodes[0].inputs).toEqual([
      expect.objectContaining({ key: 'query', value: 'A' }),
      expect.objectContaining({ key: 'filter', value: 'x' })
    ]);
    // 第二次 LLM 未传 filter 时，应回退节点默认值，而不是残留第一次的 "x"。
    expect(runWorkflowTool.mock.calls[1][0].runtimeNodes[0].inputs).toEqual([
      expect.objectContaining({ key: 'query', value: 'B' }),
      expect.objectContaining({ key: 'filter', value: '' })
    ]);
    expect(runtimeNodes[0].inputs).toEqual([
      expect.objectContaining({ key: 'query', value: '' }),
      expect.objectContaining({ key: 'filter', value: '' })
    ]);
  });
});

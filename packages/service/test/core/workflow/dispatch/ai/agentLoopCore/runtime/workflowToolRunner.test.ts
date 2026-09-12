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

    // 入口 agent 参数不得写回父图；isEntry / 边 status 等副作用需要回写。
    expect(runtimeNodes[0].inputs).toEqual([
      {
        key: 'q',
        value: 'old',
        renderTypeList: ['input', 'agentGenerated'],
        selectedType: 'agentGenerated'
      }
    ]);
    expect(runtimeNodes[0].isEntry).toBe(true);
    expect(runtimeEdges[0]).toEqual({
      target: 'search',
      status: 'active'
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
    // 交互恢复同样隔离执行；入口 inputs 仍不得被写回父图。
    expect(runtimeNodes[0].inputs).toEqual([
      {
        key: 'q',
        value: 'old',
        renderTypeList: ['input', 'agentGenerated'],
        selectedType: 'agentGenerated'
      }
    ]);
  });

  it('syncs non-entry side effects from isolated tool run back to parent', async () => {
    const runtimeNodes = [
      {
        nodeId: 'tool_entry',
        inputs: [
          {
            key: 'q',
            value: 'default',
            renderTypeList: ['input', 'agentGenerated'],
            selectedType: 'agentGenerated'
          }
        ],
        outputs: [{ id: 'out1', key: 'out1', value: undefined }]
      },
      {
        nodeId: 'other_node',
        inputs: [{ key: 'x', value: 'keep' }],
        outputs: [{ id: 'var1', key: 'var1', value: 'before' }]
      }
    ];
    const runtimeEdges = [
      {
        source: 'a',
        sourceHandle: 's',
        target: 'tool_entry',
        targetHandle: 't',
        status: 'waiting'
      }
    ];
    const runWorkflowTool = vi.fn(async ({ runtimeNodes: nodes, runtimeEdges: edges }) => {
      // 模拟变量更新节点写非入口节点 output，以及交互相关 runtime 状态变更。
      nodes[1].outputs[0].value = 'after-update';
      nodes[1].inputs[0].value = 'mutated-input';
      nodes[1].isEntry = true;
      edges[0].status = 'active';
      return {
        toolResponses: 'ok',
        assistantResponses: [],
        flowUsages: [],
        flowResponses: []
      };
    });
    const { runTool } = createRunner({
      runtimeNodes,
      runtimeEdges,
      runWorkflowTool,
      getToolInfo: () => ({
        type: 'user',
        name: 'Tool',
        avatar: 'tool-avatar',
        rawData: {
          nodeId: 'tool_entry'
        }
      })
    });

    await runTool({
      call: createCall({
        id: 'call_1',
        name: 'tool_entry',
        args: '{"q":"from-agent"}'
      })
    });

    // 入口 agent 参数不得粘在父图上。
    expect(runtimeNodes[0].inputs).toEqual([
      expect.objectContaining({ key: 'q', value: 'default' })
    ]);
    // 非入口节点的 inputs/outputs/isEntry 与边 status 需要回写。
    expect(runtimeNodes[1].outputs[0].value).toBe('after-update');
    expect(runtimeNodes[1].inputs[0].value).toBe('mutated-input');
    expect(runtimeNodes[1].isEntry).toBe(true);
    expect(runtimeEdges[0].status).toBe('active');
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

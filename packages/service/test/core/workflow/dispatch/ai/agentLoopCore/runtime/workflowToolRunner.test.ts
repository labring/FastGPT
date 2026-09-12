import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentLoopCoreWorkflowToolRunner } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/application/runtime/workflowToolRunner';
import { dispatchUpdateVariable } from '@fastgpt/service/core/workflow/dispatch/tools/runUpdateVar';

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

  it.each(['call', 'resume'] as const)(
    'syncs real variable-update writes to parent outputs during %s without leaking inputs',
    async (mode) => {
      const runtimeNodes = [
        { nodeId: 'search', inputs: [], outputs: [] },
        {
          nodeId: 'parent',
          inputs: [],
          outputs: [
            { id: 'count', value: 10 },
            { id: 'enabled', value: true },
            { id: 'text', value: 'old' }
          ]
        }
      ];
      const runtimeEdges = [{ target: 'search', status: 'waiting' }];
      const originalOutput = runtimeNodes[1].outputs[0];
      const runWorkflowTool = vi.fn(async ({ runtimeNodes: childNodes, runtimeEdges }) => {
        await dispatchUpdateVariable({
          params: {
            updateList: [
              { variable: ['parent', 'count'], value: ['', 0], valueType: 'number' },
              { variable: ['parent', 'enabled'], value: ['', false], valueType: 'boolean' },
              { variable: ['parent', 'text'], value: ['', ''], valueType: 'string' }
            ].map((item) => ({ ...item, renderType: 'input' }))
          },
          runtimeNodesMap: new Map(childNodes.map((node: any) => [node.nodeId, node])),
          variableState: { toRuntimeRecord: () => ({}), toStoreRecord: () => ({}) },
          runningAppInfo: {}
        } as any);
        childNodes[0].inputs.push({ key: 'leaked', value: 'bad' });
        runtimeEdges[0].status = 'skipped';
        return {
          flowResponses: [],
          flowUsages: [],
          assistantResponses: [],
          toolResponses: 'updated',
          workflowInteractiveResponse: { entryNodeIds: ['search'] }
        };
      });
      const runner = createRunner({
        runtimeNodes,
        runtimeEdges,
        runWorkflowTool,
        getToolInfo: () => ({ type: 'user', rawData: { nodeId: 'search' } })
      });
      if (mode === 'call') {
        await runner.runTool({ call: createCall() });
      } else {
        await runner.runInteractiveTool({
          childrenResponse: { entryNodeIds: ['search'] },
          toolParams: { toolCallId: 'resume' }
        } as any);
      }

      expect(runtimeNodes[1].outputs).toEqual([
        { id: 'count', value: 0 },
        { id: 'enabled', value: false },
        { id: 'text', value: '' }
      ]);
      expect(runtimeNodes[1].outputs[0]).toBe(originalOutput);
      expect(runtimeNodes[0].inputs).toEqual([]);
      expect(runtimeNodes[0]).not.toHaveProperty('isEntry');
      expect(runtimeEdges[0].status).toBe('waiting');
    }
  );

  it('retains completed output writes when a later execution step throws', async () => {
    const runtimeNodes = [{ nodeId: 'search', inputs: [], outputs: [{ id: 'value', value: 1 }] }];
    const error = new Error('later step failed');
    const runner = createRunner({
      runtimeNodes,
      getToolInfo: () => ({ type: 'user', rawData: { nodeId: 'search' } }),
      runWorkflowTool: vi.fn(async ({ runtimeNodes }) => {
        runtimeNodes[0].outputs[0].value = 2;
        throw error;
      })
    });
    await expect(runner.runTool({ call: createCall() })).rejects.toBe(error);
    expect(runtimeNodes[0].outputs[0].value).toBe(2);
  });

  it('does not overwrite unrelated output changes from another concurrent call', async () => {
    const runtimeNodes = [
      {
        nodeId: 'search',
        inputs: [],
        outputs: [
          { id: 'first', value: { count: 0 } },
          { id: 'second', value: { count: 0 } }
        ]
      }
    ];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstChild: any;
    const runWorkflowTool = vi
      .fn()
      .mockImplementationOnce(async ({ runtimeNodes }) => {
        firstChild = runtimeNodes;
        runtimeNodes[0].outputs[0].value.count = 1;
        await firstGate;
        return {
          flowResponses: [],
          flowUsages: [],
          assistantResponses: [],
          toolResponses: 'first'
        };
      })
      .mockImplementationOnce(async ({ runtimeNodes }) => {
        runtimeNodes[0].outputs[1].value.count = 2;
        return {
          flowResponses: [],
          flowUsages: [],
          assistantResponses: [],
          toolResponses: 'second'
        };
      });
    const runner = createRunner({
      runtimeNodes,
      runWorkflowTool,
      getToolInfo: () => ({ type: 'user', rawData: { nodeId: 'search' } })
    });
    const first = runner.runTool({ call: createCall() });
    await runner.runTool({ call: createCall({ id: 'second' }) });
    releaseFirst();
    await first;

    expect(runtimeNodes[0].outputs.map((output) => output.value)).toEqual([
      { count: 1 },
      { count: 2 }
    ]);
    firstChild[0].outputs[0].value.count = 99;
    expect(runtimeNodes[0].outputs[0].value.count).toBe(1);
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
        outputs: [],
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

    expect(runtimeNodes[0]).toEqual({
      nodeId: 'search',
      outputs: [],
      inputs: [
        {
          key: 'q',
          renderTypeList: ['input', 'agentGenerated'],
          selectedType: 'agentGenerated',
          value: 'old'
        }
      ]
    });
    expect(runtimeEdges[0]).toEqual({ target: 'search' });
    expect(runWorkflowTool).toHaveBeenCalledWith({
      runtimeNodes: [
        {
          nodeId: 'search',
          outputs: [],
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
      runtimeEdges: [{ target: 'search', status: 'active' }]
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
    expect(runtimeNodes[0].inputs[0].value).toBe('old');
    expect(runtimeNodes[0]).not.toHaveProperty('isEntry');
    expect(runtimeEdges[0]).not.toHaveProperty('status');
  });

  it('isolates input values between repeated calls to the same tool', async () => {
    const runtimeNodes = [
      {
        nodeId: 'search',
        outputs: [],
        inputs: [
          { key: 'query', value: 'default', renderTypeList: ['agentGenerated'] },
          { key: 'filter', value: 'default-filter', renderTypeList: ['agentGenerated'] }
        ]
      }
    ];
    const runtimeEdges = [{ target: 'search' }];
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
      getToolInfo: () => ({ type: 'user', rawData: { nodeId: 'search' } })
    });

    await runTool({ call: createCall({ args: '{"query":"A","filter":"x"}' }) });
    await runTool({ call: createCall({ id: 'call_2', args: '{"query":"B"}' }) });

    expect(runtimeNodes[0].inputs).toEqual([
      { key: 'query', value: 'default', renderTypeList: ['agentGenerated'] },
      { key: 'filter', value: 'default-filter', renderTypeList: ['agentGenerated'] }
    ]);
    expect(runWorkflowTool.mock.calls[1][0].runtimeNodes[0].inputs).toEqual([
      { key: 'query', value: 'B', renderTypeList: ['agentGenerated'] },
      { key: 'filter', value: 'default-filter', renderTypeList: ['agentGenerated'] }
    ]);
  });

  it('restores child interactive output and edge memory before resuming', async () => {
    const runtimeNodes = [
      { nodeId: 'search', inputs: [], outputs: [{ id: 'result', key: 'result', value: 'parent' }] }
    ];
    const runtimeEdges = [{ source: 'before', target: 'search', status: 'waiting' }];
    let received: any;
    const { runInteractiveTool } = createRunner({
      runtimeNodes,
      runtimeEdges,
      getToolInfo: () => ({ type: 'user', rawData: { nodeId: 'search' } }),
      runWorkflowTool: vi.fn(async (params) => {
        received = params;
        return { flowResponses: [], flowUsages: [], assistantResponses: [], toolResponses: 'ok' };
      })
    });

    await runInteractiveTool({
      childrenResponse: {
        entryNodeIds: ['search'],
        memoryEdges: [{ source: 'before', target: 'search', status: 'active' }],
        nodeOutputs: [{ nodeId: 'search', key: 'result', value: false }]
      },
      toolParams: { toolCallId: 'resume' }
    } as any);

    expect(received.runtimeEdges).toEqual([
      { source: 'before', target: 'search', status: 'active' }
    ]);
    expect(received.runtimeNodes[0].outputs[0].value).toBe(false);
    expect(runtimeEdges[0].status).toBe('waiting');
    expect(runtimeNodes[0].outputs[0].value).toBe(false);
  });
});

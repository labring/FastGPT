import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useToolRunner } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/hooks/useToolRunner';

const { runWorkflowMock } = vi.hoisted(() => ({
  runWorkflowMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  runWorkflow: runWorkflowMock
}));

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

const createWorkflowProps = () =>
  ({
    sandboxClient: {
      getContext: vi.fn(() => ({
        appId: 'app_1',
        userId: 'user_1',
        chatId: 'chat_1'
      }))
    },
    runningAppInfo: {
      id: 'app_1'
    },
    uid: 'user_1',
    chatId: 'chat_1',
    runningUserInfo: {
      teamId: 'team_1',
      tmbId: 'tmb_1'
    },
    chatConfig: {
      fileSelectConfig: {
        customPdfParse: true
      }
    },
    usageId: 'usage_1'
  }) as any;

const createRunner = ({
  getToolInfo,
  runtimeNodes = [],
  runtimeEdges = [],
  fileUrls = []
}: {
  getToolInfo: (name: string) => any;
  runtimeNodes?: any[];
  runtimeEdges?: any[];
  fileUrls?: string[];
}) => {
  const cacheToolFlowResponse = vi.fn();
  const appendToolFlowResponse = vi.fn();
  const streamToolResponse = vi.fn();
  const runner = useToolRunner({
    workflowProps: createWorkflowProps(),
    runtimeNodes,
    runtimeEdges,
    fileUrls,
    getToolInfo,
    cacheToolFlowResponse,
    appendToolFlowResponse,
    streamToolResponse
  });

  return {
    ...runner,
    cacheToolFlowResponse,
    appendToolFlowResponse,
    streamToolResponse
  };
};

describe('useToolRunner', () => {
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

  it('does not execute sandbox internal tools through the runtime tool runner', async () => {
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
        'sandbox_shell is an agent-loop internal tool and cannot be executed as a runtime tool.',
      assistantMessages: [],
      usages: [],
      interactive: undefined,
      stop: false
    });
    expect(cacheToolFlowResponse).not.toHaveBeenCalled();
  });

  it('does not execute read-file internal tools through the runtime tool runner', async () => {
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
      response:
        'read_files is an agent-loop internal tool and cannot be executed as a runtime tool.',
      assistantMessages: [],
      usages: [],
      interactive: undefined,
      stop: false
    });
    expect(cacheToolFlowResponse).not.toHaveBeenCalled();
  });

  it('injects parent file urls into dataset search tool calls', async () => {
    const runtimeNodes = [
      {
        nodeId: 'dataset_search',
        inputs: [
          {
            key: NodeInputKeyEnum.userChatInput,
            value: 'legacy default'
          },
          {
            key: NodeInputKeyEnum.datasetSearchInput,
            value: []
          },
          {
            key: 'limit',
            value: 10
          }
        ]
      }
    ];
    const runtimeEdges = [
      {
        target: 'dataset_search'
      }
    ];
    runWorkflowMock.mockResolvedValue({
      toolResponses: 'dataset ok',
      assistantResponses: [],
      flowUsages: [],
      workflowInteractiveResponse: undefined,
      flowResponses: []
    });

    const { runTool } = createRunner({
      runtimeNodes,
      runtimeEdges,
      fileUrls: ['https://files/image.png'],
      getToolInfo: () => ({
        type: 'user',
        name: 'Dataset search',
        avatar: 'dataset-avatar',
        rawData: {
          nodeId: 'dataset_search',
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode
        }
      })
    });
    const call = createCall({
      id: 'call_dataset_search',
      name: 'dataset_search',
      args: '{"datasetSearchInput":"red shoes","limit":3}'
    });

    const result = await runTool({ call });

    expect(runtimeNodes[0]).toEqual({
      nodeId: 'dataset_search',
      isEntry: true,
      inputs: [
        {
          key: NodeInputKeyEnum.userChatInput,
          value: ''
        },
        {
          key: NodeInputKeyEnum.datasetSearchInput,
          value: ['red shoes', 'https://files/image.png']
        },
        {
          key: 'limit',
          value: 3
        }
      ]
    });
    expect(runtimeEdges[0]).toEqual({
      target: 'dataset_search',
      status: 'active'
    });
    expect(result).toEqual({
      response: 'dataset ok',
      assistantMessages: [],
      usages: [],
      interactive: undefined,
      stop: false
    });
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
    runWorkflowMock
      .mockResolvedValueOnce({
        toolResponses: {
          answer: 'workflow ok'
        },
        assistantResponses: [{ text: { content: 'assistant text' } }],
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
    const {
      runTool,
      runInteractiveTool,
      cacheToolFlowResponse,
      appendToolFlowResponse,
      streamToolResponse
    } = createRunner({
      runtimeNodes,
      runtimeEdges,
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
    expect(result.assistantMessages.length).toBeGreaterThan(0);
    expect(cacheToolFlowResponse).toHaveBeenCalledWith({
      call,
      flowResponse: expect.objectContaining({
        toolResponses: {
          answer: 'workflow ok'
        }
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

    expect(streamToolResponse).toHaveBeenCalledWith({
      toolCallId: 'call_interactive',
      response: 'interactive ok'
    });
    expect(appendToolFlowResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        toolResponses: 'interactive ok'
      })
    );
    expect(interactiveResult).toEqual({
      response: 'interactive ok',
      assistantMessages: [],
      usages: [],
      interactive: undefined,
      stop: false
    });
  });
});

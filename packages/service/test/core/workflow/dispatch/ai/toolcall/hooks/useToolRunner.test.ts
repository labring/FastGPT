import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useToolRunner } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/hooks/useToolRunner';
import { summarizeRuntimeNodeResponses } from '@fastgpt/service/core/workflow/dispatch/utils';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { getErrText } from '@fastgpt/global/common/error/utils';

const { dispatchReadFileToolMock, runSandboxToolsMock, runWorkflowMock } = vi.hoisted(() => ({
  dispatchReadFileToolMock: vi.fn(),
  runSandboxToolsMock: vi.fn(),
  runWorkflowMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  runWorkflow: runWorkflowMock
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamSandboxPermission: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/toolCall', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/toolCall')>();

  return {
    ...original,
    runSandboxTools: runSandboxToolsMock
  };
});

vi.mock(
  '@fastgpt/service/core/workflow/dispatch/ai/toolcall/tools/file',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('@fastgpt/service/core/workflow/dispatch/ai/toolcall/tools/file')
      >();

    return {
      ...original,
      dispatchReadFileTool: dispatchReadFileToolMock
    };
  }
);

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
  allFiles = new Map(),
  fileUrls = []
}: {
  getToolInfo: (name: string) => any;
  runtimeNodes?: any[];
  runtimeEdges?: any[];
  allFiles?: Map<string, any>;
  fileUrls?: string[];
}) => {
  const cacheToolFlowResponse = vi.fn();
  const appendInteractiveToolSummary = vi.fn();
  const streamToolResponse = vi.fn();
  const nodeResponseWriter = {
    record: vi.fn(async (responses = []) => responses),
    recordWithParent: vi.fn(async (responses = [], parentId?: string) => {
      return responses.map((response) => ({
        ...response,
        parentId: response.parentId || parentId
      }));
    })
  };
  const runner = useToolRunner({
    workflowProps: {
      ...createWorkflowProps(),
      nodeResponseParentId: 'toolcall_parent',
      nodeResponseWriter
    },
    runtimeNodes,
    runtimeEdges,
    allFiles,
    fileUrls,
    getToolInfo,
    cacheToolFlowResponse,
    appendInteractiveToolSummary,
    streamToolResponse
  });

  return {
    ...runner,
    cacheToolFlowResponse,
    appendInteractiveToolSummary,
    streamToolResponse,
    nodeResponseWriter
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

  it('runs sandbox tools and caches sandbox workflow response', async () => {
    runSandboxToolsMock.mockResolvedValue({
      input: {
        cmd: 'ls'
      },
      response: 'sandbox ok',
      durationSeconds: 0.5
    });
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

    expect(runSandboxToolsMock).toHaveBeenCalledWith({
      toolName: 'sandbox_shell',
      args: '{"cmd":"ls"}',
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1'
    });
    expect(result).toEqual({
      response: 'sandbox ok',
      assistantMessages: [],
      usages: [],
      interactive: undefined,
      stop: undefined
    });
    expect(cacheToolFlowResponse).toHaveBeenCalledWith({
      call,
      flowResponse: expect.objectContaining({
        builtinNodeResponses: [
          expect.objectContaining({
            moduleType: FlowNodeTypeEnum.tool,
            moduleName: 'Run shell',
            moduleLogo: 'sandbox-avatar',
            toolId: 'sandbox_shell',
            toolInput: {
              cmd: 'ls'
            },
            toolRes: 'sandbox ok',
            runningTime: 0.5,
            totalPoints: 0
          })
        ],
        runtimeNodeResponseSummary: expect.objectContaining({
          childResponseCount: 1,
          finishedNodeIds: expect.any(Array)
        })
      })
    });
  });

  it('runs read-file tool with urls from allFiles', async () => {
    const usage = {
      moduleName: 'read_file',
      totalPoints: 0.2
    };
    const fileNodeResponse = {
      id: 'call_read',
      nodeId: 'call_read',
      moduleType: FlowNodeTypeEnum.readFiles,
      moduleName: 'Read file'
    };
    const flowResponse = {
      runtimeNodeResponseSummary: summarizeRuntimeNodeResponses(undefined, [fileNodeResponse]),
      builtinNodeResponses: [fileNodeResponse],
      flowUsages: [usage],
      runTimes: 0
    };
    dispatchReadFileToolMock.mockResolvedValue({
      response: '<file>content</file>',
      usages: [usage],
      flowResponse
    });
    const { runTool, cacheToolFlowResponse } = createRunner({
      allFiles: new Map([['file_1', { id: 'file_1', url: 'https://files/a.pdf' }]]),
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

    expect(dispatchReadFileToolMock).toHaveBeenCalledWith({
      files: [
        {
          id: 'file_1',
          url: 'https://files/a.pdf'
        },
        {
          id: 'missing',
          url: ''
        }
      ],
      toolCallId: 'call_read',
      teamId: 'team_1',
      tmbId: 'tmb_1',
      customPdfParse: true,
      usageId: 'usage_1'
    });
    expect(result).toEqual({
      response: '<file>content</file>',
      assistantMessages: [],
      usages: [usage],
      interactive: undefined,
      stop: undefined
    });
    expect(cacheToolFlowResponse).toHaveBeenCalledWith({
      call,
      flowResponse
    });
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
      toolResponse: 'dataset ok',
      assistantResponses: [],
      flowUsages: [],
      workflowInteractiveResponse: undefined,
      runtimeNodeResponseSummary: summarizeRuntimeNodeResponses(undefined, [])
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
      .mockImplementationOnce(async (props) => {
        const nodeResponses = [
          {
            id: 'workflow_tool_response',
            nodeId: 'workflow_tool_response',
            parentId: 'toolcall_parent',
            moduleType: 'tool' as any,
            moduleName: 'Workflow Tool',
            toolStop: true
          }
        ];
        await props.nodeResponseWriter?.record(nodeResponses);

        return {
          toolResponse: {
            answer: 'workflow ok'
          },
          assistantResponses: [{ text: { content: 'assistant text' } }],
          flowUsages: [usage],
          workflowInteractiveResponse: {
            type: 'userSelect'
          },
          runtimeNodeResponseSummary: summarizeRuntimeNodeResponses(undefined, nodeResponses)
        };
      })
      .mockResolvedValueOnce({
        toolResponse: 'interactive ok',
        assistantResponses: [],
        flowUsages: [],
        workflowInteractiveResponse: undefined,
        runtimeNodeResponseSummary: summarizeRuntimeNodeResponses(undefined, [
          {
            id: 'interactive_tool_response',
            nodeId: 'interactive_tool_response',
            moduleType: 'tool' as any,
            moduleName: 'Interactive Tool',
            toolStop: false
          }
        ])
      });
    const {
      runTool,
      runInteractiveTool,
      cacheToolFlowResponse,
      appendInteractiveToolSummary,
      streamToolResponse,
      nodeResponseWriter
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
    const workflowRunProps = runWorkflowMock.mock.calls[0][0];

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
    expect(workflowRunProps.nodeResponseWriter).toBe(nodeResponseWriter);
    expect(nodeResponseWriter.record).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'workflow_tool_response'
      })
    ]);
    expect(cacheToolFlowResponse).toHaveBeenCalledWith({
      call,
      flowResponse: expect.objectContaining({
        flowUsages: [usage],
        runtimeNodeResponseSummary: expect.objectContaining({
          responseIds: ['workflow_tool_response'],
          hasToolStop: true
        })
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
    expect(appendInteractiveToolSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeNodeResponseSummary: expect.objectContaining({
          responseIds: ['interactive_tool_response']
        })
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

  it('should throw error when checkTeamSandboxPermission fails for sandbox tool', async () => {
    const { checkTeamSandboxPermission } =
      await import('@fastgpt/service/support/permission/teamLimit');
    vi.mocked(checkTeamSandboxPermission).mockRejectedValueOnce(new Error('no permission'));

    const { runTool } = createRunner({
      getToolInfo: () => ({
        type: 'sandbox',
        name: 'shell',
        avatar: 'avatar'
      })
    });

    const promise = runTool({ call: createCall({ name: 'shell' }) });
    await expect(promise).rejects.toMatchObject({
      message: SandboxErrEnum.agentSandboxPermissionDenied
    });
    await expect(promise.catch((error) => getErrText(error))).resolves.toBe(
      'common:code_error.sandbox_error.agent_sandbox_permission_denied'
    );
  });
});

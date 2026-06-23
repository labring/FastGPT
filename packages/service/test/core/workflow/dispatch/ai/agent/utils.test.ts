import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import {
  getAgentDatasetParams,
  getSubapps,
  getExecuteTool,
  replaceAgentFileIdsWithUrls
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/utils';
import { readFileTool } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/file/utils';
import { datasetSearchTool } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/dataset/utils';

const {
  dispatchAgentDatasetSearchMock,
  dispatchAppMock,
  dispatchFileReadMock,
  dispatchToolMock,
  getAgentRuntimeToolsMock
} = vi.hoisted(() => ({
  dispatchAgentDatasetSearchMock: vi.fn(),
  dispatchAppMock: vi.fn(),
  dispatchFileReadMock: vi.fn(),
  dispatchToolMock: vi.fn(),
  getAgentRuntimeToolsMock: vi.fn(async () => [])
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/file', () => ({
  dispatchFileRead: dispatchFileReadMock
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool/utils', () => ({
  getAgentRuntimeTools: getAgentRuntimeToolsMock
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool', () => ({
  dispatchTool: dispatchToolMock
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/dataset', () => ({
  dispatchAgentDatasetSearch: dispatchAgentDatasetSearchMock
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/app', () => ({
  dispatchApp: dispatchAppMock,
  dispatchPlugin: vi.fn()
}));

describe('Agent read_files tool protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAgentRuntimeToolsMock.mockResolvedValue([]);
  });

  it('replaces exact agent file ids in user tool params with urls', () => {
    const result = replaceAgentFileIdsWithUrls(
      {
        fileUrl: 'current-0',
        nested: {
          urls: ['current-0', 'current-1', 'keep']
        },
        text: 'please use current-0'
      },
      {
        'current-0': 'https://files/current.pdf',
        'current-1': 'https://files/image.png'
      }
    );

    expect(result).toEqual({
      fileUrl: 'https://files/current.pdf',
      nested: {
        urls: ['https://files/current.pdf', 'https://files/image.png', 'keep']
      },
      text: 'please use current-0'
    });
  });

  it('exposes read_files with ids parameter', async () => {
    const { completionTools } = await getSubapps({
      tmbId: 'tmb_1',
      tools: [],
      hasFiles: true,
      hasDataset: false
    });

    expect(completionTools).toContain(readFileTool);
    expect(readFileTool.function.name).toBe(SubAppIds.readFiles);
    expect(readFileTool.function.parameters).toEqual({
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: '文件 ID'
        }
      },
      required: ['ids']
    });
  });

  it('dispatches read_files by ids', async () => {
    dispatchFileReadMock.mockResolvedValue({
      response: 'file content',
      usages: [],
      nodeResponse: {
        moduleName: '文件解析'
      }
    });
    const executeTool = getExecuteTool({
      checkIsStopping: vi.fn(),
      chatConfig: {},
      runningUserInfo: {
        teamId: 'team_1',
        tmbId: 'tmb_1'
      },
      runningAppInfo: {
        id: 'app_1'
      },
      chatId: 'chat_1',
      uid: 'user_1',
      variableState: {} as any,
      externalProvider: {
        openaiAccount: undefined
      } as any,
      lang: 'zh-CN',
      requestOrigin: '',
      mode: 'chat',
      timezone: 'Asia/Shanghai',
      retainDatasetCite: false,
      maxRunTimes: 10,
      workflowDispatchDeep: 0,
      params: {
        model: 'gpt-4'
      },
      stream: false,
      getSubAppInfo: () => ({
        name: '文件解析',
        avatar: '',
        toolDescription: ''
      }),
      getSubApp: () => undefined,
      completionTools: [readFileTool],
      filesMap: {
        'current-0': '/current.pdf'
      }
    } as any);

    await executeTool({
      callId: 'call_read_files',
      toolId: SubAppIds.readFiles,
      args: '{"ids":["current-0"]}'
    });

    expect(dispatchFileReadMock).toHaveBeenCalledTimes(1);
    expect(dispatchFileReadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [{ id: 'current-0', url: '/current.pdf' }]
      })
    );
  });

  it('replaces agent file ids before dispatching user tools', async () => {
    dispatchToolMock.mockResolvedValue({
      response: 'tool response',
      usages: [],
      nodeResponse: {
        moduleName: 'HTTP Tool'
      }
    });
    const executeTool = getExecuteTool({
      checkIsStopping: vi.fn(),
      chatConfig: {},
      runningUserInfo: {
        teamId: 'team_1',
        tmbId: 'tmb_1'
      },
      runningAppInfo: {
        id: 'app_1'
      },
      chatId: 'chat_1',
      uid: 'user_1',
      variableState: {} as any,
      externalProvider: {
        openaiAccount: undefined
      } as any,
      lang: 'zh-CN',
      requestOrigin: '',
      mode: 'chat',
      timezone: 'Asia/Shanghai',
      retainDatasetCite: false,
      maxRunTimes: 10,
      workflowDispatchDeep: 0,
      params: {
        model: 'gpt-4'
      },
      stream: false,
      getSubAppInfo: () => ({
        name: 'HTTP Tool',
        avatar: '',
        toolDescription: ''
      }),
      getSubApp: () => ({
        type: 'tool',
        id: 'http-tool',
        name: 'HTTP Tool',
        avatar: '',
        version: '1.0.0',
        toolConfig: {},
        params: {
          fixedFile: 'current-0'
        }
      }),
      completionTools: [],
      fileUrlMap: {
        'current-0': 'https://files/current.pdf',
        'current-1': 'https://files/image.png'
      },
      filesMap: {}
    } as any);

    await executeTool({
      callId: 'call_http_tool',
      toolId: 'http-tool',
      args: JSON.stringify({
        fileUrl: 'current-1',
        nested: {
          list: ['current-0', 'keep']
        },
        text: 'please use current-0'
      })
    });

    expect(dispatchToolMock).toHaveBeenCalledTimes(1);
    expect(dispatchToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          fixedFile: 'https://files/current.pdf',
          fileUrl: 'https://files/image.png',
          nested: {
            list: ['https://files/current.pdf', 'keep']
          },
          text: 'please use current-0'
        }
      })
    );
  });

  it('exposes dataset search with query array parameter', async () => {
    const { completionTools } = await getSubapps({
      tmbId: 'tmb_1',
      tools: [],
      hasFiles: false,
      hasDataset: true
    });

    expect(completionTools).toContain(datasetSearchTool);
    expect(datasetSearchTool.function.name).toBe(SubAppIds.datasetSearch);
    expect(datasetSearchTool.function.parameters).toEqual({
      type: 'object',
      properties: {
        query: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: '要搜索的查询文本数组，描述需要查找的信息'
        }
      },
      required: ['query']
    });
  });

  it('uses loaded toolset names for prompt references when selected tools only include ids', async () => {
    getAgentRuntimeToolsMock.mockResolvedValue([
      {
        type: 'tool',
        id: 'metaso0',
        name: '搜索网页',
        params: {},
        requestSchema: {
          type: 'function',
          function: {
            name: 'metaso0',
            description: '',
            parameters: {
              type: 'object',
              properties: {}
            }
          }
        },
        promptReference: {
          id: 'systemTool-metaso',
          name: '秘塔搜索'
        }
      },
      {
        type: 'tool',
        id: '697342badc35c2fc3f90ac3a0',
        name: 'HTTP 搜索',
        params: {},
        requestSchema: {
          type: 'function',
          function: {
            name: 'httpTool0',
            description: '',
            parameters: {
              type: 'object',
              properties: {}
            }
          }
        },
        promptReference: {
          id: '697342badc35c2fc3f90ac3a',
          name: 'HTTP 工具集'
        }
      },
      {
        type: 'tool',
        id: '69e20f48dbec7c6ece77556b0',
        name: 'MCP 搜索',
        params: {},
        requestSchema: {
          type: 'function',
          function: {
            name: 'mcpTool0',
            description: '',
            parameters: {
              type: 'object',
              properties: {}
            }
          }
        },
        promptReference: {
          id: '69e20f48dbec7c6ece77556b',
          name: 'MCP 工具集'
        }
      }
    ]);

    const { promptToolReferenceInfoMap } = await getSubapps({
      tmbId: 'tmb_1',
      tools: [
        { id: 'systemTool-metaso', config: {} },
        { id: '697342badc35c2fc3f90ac3a', config: {} },
        { id: '69e20f48dbec7c6ece77556b', config: {} }
      ],
      hasFiles: false,
      hasDataset: false
    });

    expect(promptToolReferenceInfoMap.get('systemTool-metaso')).toBe('秘塔搜索');
    expect(promptToolReferenceInfoMap.get('697342badc35c2fc3f90ac3a')).toBe('HTTP 工具集');
    expect(promptToolReferenceInfoMap.get('69e20f48dbec7c6ece77556b')).toBe('MCP 工具集');
  });

  it('passes external OpenAI account to dataset search tool', async () => {
    const userKey = {
      key: 'user-key',
      baseUrl: 'https://llm.example.com/v1'
    };
    dispatchAgentDatasetSearchMock.mockResolvedValue({
      response: 'dataset content',
      usages: [],
      nodeResponse: {
        moduleName: 'Dataset Search'
      }
    });

    const executeTool = getExecuteTool({
      checkIsStopping: vi.fn(),
      chatConfig: {},
      runningUserInfo: {
        teamId: 'team_1',
        tmbId: 'tmb_1'
      },
      runningAppInfo: {
        id: 'app_1'
      },
      chatId: 'chat_1',
      uid: 'user_1',
      variableState: {} as any,
      externalProvider: {
        openaiAccount: userKey
      } as any,
      lang: 'zh-CN',
      requestOrigin: '',
      mode: 'chat',
      timezone: 'Asia/Shanghai',
      retainDatasetCite: false,
      maxRunTimes: 10,
      workflowDispatchDeep: 0,
      params: {
        model: 'gpt-4',
        agent_datasetParams: {
          datasets: [{ datasetId: 'dataset_1' }]
        }
      },
      stream: false,
      getSubAppInfo: () => ({
        name: 'Dataset Search',
        avatar: '',
        toolDescription: ''
      }),
      getSubApp: () => undefined,
      completionTools: [],
      filesMap: {}
    } as any);

    await executeTool({
      callId: 'call_dataset_search',
      toolId: SubAppIds.datasetSearch,
      args: '{"query":["FastGPT"]}'
    });

    expect(dispatchAgentDatasetSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userKey,
        datasetParams: {
          datasets: [{ datasetId: 'dataset_1' }]
        }
      })
    );
  });

  it('normalizes workflow agent dataset inputs for dataset search tool', async () => {
    dispatchAgentDatasetSearchMock.mockResolvedValue({
      response: 'dataset content',
      usages: [],
      nodeResponse: {
        moduleName: 'Dataset Search'
      }
    });

    const params = {
      model: 'gpt-4',
      datasets: [{ datasetId: 'dataset_1' }],
      similarity: 0.55,
      limit: 1800,
      searchMode: 'mixedRecall',
      embeddingWeight: 0.65,
      usingReRank: true,
      rerankModel: 'rerank-model',
      rerankWeight: 0.4,
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModel: 'query-model',
      datasetSearchExtensionBg: 'query bg',
      authTmbId: true
    };

    expect(getAgentDatasetParams(params as any)).toEqual({
      datasets: [{ datasetId: 'dataset_1' }],
      similarity: 0.55,
      limit: 1800,
      searchMode: 'mixedRecall',
      embeddingWeight: 0.65,
      usingReRank: true,
      rerankModel: 'rerank-model',
      rerankWeight: 0.4,
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModel: 'query-model',
      datasetSearchExtensionBg: 'query bg',
      authTmbId: true
    });

    const executeTool = getExecuteTool({
      checkIsStopping: vi.fn(),
      chatConfig: {},
      runningUserInfo: {
        teamId: 'team_1',
        tmbId: 'tmb_1'
      },
      runningAppInfo: {
        id: 'app_1'
      },
      chatId: 'chat_1',
      uid: 'user_1',
      variableState: {} as any,
      externalProvider: {
        openaiAccount: undefined
      } as any,
      lang: 'zh-CN',
      requestOrigin: '',
      mode: 'chat',
      timezone: 'Asia/Shanghai',
      retainDatasetCite: false,
      maxRunTimes: 10,
      workflowDispatchDeep: 0,
      params,
      stream: false,
      getSubAppInfo: () => ({
        name: 'Dataset Search',
        avatar: '',
        toolDescription: ''
      }),
      getSubApp: () => undefined,
      completionTools: [],
      filesMap: {}
    } as any);

    await executeTool({
      callId: 'call_dataset_search',
      toolId: SubAppIds.datasetSearch,
      args: '{"query":["FastGPT"]}'
    });

    expect(dispatchAgentDatasetSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team_1',
        tmbId: 'tmb_1',
        datasetParams: expect.objectContaining({
          datasets: [{ datasetId: 'dataset_1' }],
          authTmbId: true
        })
      })
    );
  });

  it('passes shared nodeResponseWriter and callId parent to workflow sub apps', async () => {
    const nodeResponseWriter = { record: vi.fn() } as any;
    dispatchAppMock.mockResolvedValue({
      response: 'workflow result',
      usages: [],
      nodeResponse: {
        moduleName: 'Sub Workflow'
      }
    });

    const executeTool = getExecuteTool({
      checkIsStopping: vi.fn(),
      chatConfig: {},
      runningUserInfo: {
        teamId: 'team_1',
        tmbId: 'tmb_1'
      },
      runningAppInfo: {
        id: 'app_1'
      },
      chatId: 'chat_1',
      uid: 'user_1',
      variableState: {} as any,
      externalProvider: {
        openaiAccount: undefined
      } as any,
      lang: 'zh-CN',
      requestOrigin: '',
      mode: 'chat',
      timezone: 'Asia/Shanghai',
      retainDatasetCite: false,
      maxRunTimes: 10,
      workflowDispatchDeep: 1,
      nodeResponseWriter,
      nodeResponseParentId: 'agent-parent',
      params: {
        model: 'gpt-4'
      },
      stream: false,
      getSubAppInfo: () => ({
        name: 'Sub Workflow',
        avatar: '',
        toolDescription: ''
      }),
      getSubApp: () => ({
        type: 'workflow',
        id: 'workflow-tool',
        name: 'Sub Workflow',
        avatar: '',
        params: {}
      }),
      completionTools: [],
      filesMap: {}
    } as any);

    await executeTool({
      callId: 'call_workflow',
      toolId: 'workflow-tool',
      args: '{"userChatInput":"hello"}'
    });

    expect(dispatchAppMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeResponseWriter,
        nodeResponseParentId: 'call_workflow'
      })
    );
  });
});

import { describe, expect, it, vi } from 'vitest';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { getSubapps, getExecuteTool } from '@fastgpt/service/core/workflow/dispatch/ai/agent/utils';
import { readFileTool } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/file/utils';
import { datasetSearchTool } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/dataset/utils';

const { dispatchAgentDatasetSearchMock, dispatchFileReadMock } = vi.hoisted(() => ({
  dispatchAgentDatasetSearchMock: vi.fn(),
  dispatchFileReadMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/file', () => ({
  dispatchFileRead: dispatchFileReadMock
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool/utils', () => ({
  getAgentRuntimeTools: vi.fn(async () => [])
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/dataset', () => ({
  dispatchAgentDatasetSearch: dispatchAgentDatasetSearchMock
}));

describe('Agent read_files tool protocol', () => {
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
        userKey
      })
    );
  });
});

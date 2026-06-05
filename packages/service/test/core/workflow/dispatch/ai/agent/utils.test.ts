import { describe, expect, it, vi } from 'vitest';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import {
  getSubapps,
  getExecuteTool
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/utils';
import { datasetSearchTool } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/dataset/utils';
import {
  createReadFilesTool,
  READ_FILES_TOOL_NAME
} from '@fastgpt/service/core/ai/llm/agentLoop/systemTools/readFile';

const { dispatchAgentDatasetSearchMock } = vi.hoisted(() => ({
  dispatchAgentDatasetSearchMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool/utils', () => ({
  getAgentRuntimeTools: vi.fn(async () => [])
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/dataset', () => ({
  dispatchAgentDatasetSearch: dispatchAgentDatasetSearchMock
}));

describe('Agent read_files tool protocol', () => {
  it('defines read_files with ids parameter', async () => {
    const readFileTool = createReadFilesTool();

    expect(readFileTool.function.name).toBe(READ_FILES_TOOL_NAME);
    expect(readFileTool.function.parameters).toEqual({
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'File IDs'
        }
      },
      required: ['ids']
    });
  });

  it('does not expose read file as a runtime subapp tool', async () => {
    const { completionTools } = await getSubapps({
      tmbId: 'tmb_1',
      tools: [],
      hasDataset: false
    });

    expect(completionTools).toEqual([]);
  });

  it('exposes dataset search with query array parameter', async () => {
    const { completionTools } = await getSubapps({
      tmbId: 'tmb_1',
      tools: [],
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

  it('does not expose sandbox tools from subapp collection', async () => {
    const { completionTools } = await getSubapps({
      tmbId: 'tmb_1',
      tools: [],
      hasDataset: false
    });

    expect(completionTools.map((tool) => tool.function.name)).toEqual([]);
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
      completionTools: []
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

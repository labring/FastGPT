import { describe, expect, it, vi } from 'vitest';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import {
  getSubapps,
  getExecuteTool
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/utils';
import { READ_FILES_TOOL_NAME } from '@fastgpt/service/core/ai/llm/agentLoop/interface';
import { createReadFilesTool } from '@fastgpt/service/core/ai/llm/agentLoop/domain/systemTool/readFile';

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
  it('defines read_files with urls parameter', async () => {
    const readFileTool = createReadFilesTool();

    expect(readFileTool.function.name).toBe(READ_FILES_TOOL_NAME);
    expect(readFileTool.function.parameters).toEqual({
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Absolute HTTP(S) file URLs'
        }
      },
      required: ['urls']
    });
  });

  it('does not expose read file as a runtime subapp tool', async () => {
    const { completionTools } = await getSubapps({
      tmbId: 'tmb_1',
      tools: []
    });

    expect(completionTools).toEqual([]);
  });

  it('does not expose dataset search as a runtime subapp tool', async () => {
    const { completionTools } = await getSubapps({
      tmbId: 'tmb_1',
      tools: []
    });

    expect(completionTools.map((tool) => tool.function.name)).not.toContain(
      SubAppIds.datasetSearch
    );
  });

  it('does not expose sandbox tools from subapp collection', async () => {
    const { completionTools } = await getSubapps({
      tmbId: 'tmb_1',
      tools: []
    });

    expect(completionTools.map((tool) => tool.function.name)).toEqual([]);
  });

  it('does not dispatch dataset search through runtime subapp executor', async () => {
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

    expect(dispatchAgentDatasetSearchMock).not.toHaveBeenCalled();
  });
});

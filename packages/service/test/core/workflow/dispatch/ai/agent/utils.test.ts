import { describe, expect, it, vi } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import {
  getSubapps,
  getExecuteTool
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/utils';
import { READ_FILES_TOOL_NAME } from '@fastgpt/service/core/ai/llm/agentLoop/interface';
import { createReadFilesTool } from '@fastgpt/service/core/ai/llm/agentLoop/domain/systemTool/readFile';

const { dispatchAgentDatasetSearchMock, dispatchToolMock, dispatchAppMock, dispatchPluginMock } =
  vi.hoisted(() => ({
    dispatchAgentDatasetSearchMock: vi.fn(),
    dispatchToolMock: vi.fn(),
    dispatchAppMock: vi.fn(),
    dispatchPluginMock: vi.fn()
  }));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool/utils', () => ({
  getAgentRuntimeTools: vi.fn(async () => [])
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/dataset', () => ({
  dispatchAgentDatasetSearch: dispatchAgentDatasetSearchMock
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool', () => ({
  dispatchTool: dispatchToolMock
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/app', () => ({
  dispatchApp: dispatchAppMock,
  dispatchPlugin: dispatchPluginMock
}));

describe('Agent read_files tool protocol', () => {
  const createExecuteToolForTest = (overrides: Record<string, any> = {}) =>
    getExecuteTool({
      checkIsStopping: vi.fn(),
      chatConfig: {},
      runningUserInfo: { teamId: 'team_1', tmbId: 'tmb_1' },
      runningAppInfo: { id: 'app_1' },
      chatId: 'chat_1',
      uid: 'user_1',
      variableState: {} as any,
      externalProvider: {} as any,
      lang: 'zh-CN',
      requestOrigin: '',
      mode: 'chat',
      timezone: 'Asia/Shanghai',
      retainDatasetCite: false,
      maxRunTimes: 10,
      workflowDispatchDeep: 0,
      params: { model: 'gpt-4' },
      stream: false,
      getSubAppInfo: () => ({ name: 'Sub', avatar: '' }),
      getSubApp: () => undefined,
      completionTools: [],
      ...overrides
    } as any);

  it('defines read_files with urls parameter', async () => {
    const readFileTool = createReadFilesTool({ maxFileAmount: 3 });

    expect(readFileTool.function.name).toBe(READ_FILES_TOOL_NAME);
    expect(readFileTool.function.parameters).toEqual({
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'string'
          },
          description: 'Absolute HTTP(S) file URLs'
        }
      },
      required: ['urls']
    });
  });

  it('does not expose system tools from runtime subapp collection', async () => {
    const { completionTools } = await getSubapps({
      tmbId: 'tmb_1',
      tools: []
    });

    expect(completionTools).toEqual([]);
  });

  it('does not dispatch dataset search through runtime subapp executor', async () => {
    dispatchAgentDatasetSearchMock.mockResolvedValue({
      response: 'dataset content',
      usages: [],
      nodeResponse: { moduleName: 'Dataset Search' }
    });

    const executeTool = createExecuteToolForTest({
      externalProvider: {
        openaiAccount: { key: 'user-key', baseUrl: 'https://llm.example.com/v1' }
      },
      params: {
        model: 'gpt-4',
        agent_datasetParams: { datasets: [{ datasetId: 'dataset_1' }] }
      }
    });

    await executeTool({
      callId: 'call_dataset_search',
      toolId: SubAppIds.datasetSearch,
      args: '{"query":["FastGPT"]}'
    });

    expect(dispatchAgentDatasetSearchMock).not.toHaveBeenCalled();
  });

  it('does not forward child tool streams from Agent', async () => {
    const streamResponseFn = vi.fn();
    dispatchToolMock.mockResolvedValue({ response: 'ok' });
    const executeTool = createExecuteToolForTest({
      stream: true,
      streamResponseFn,
      getSubApp: () => ({
        type: 'tool',
        id: 'system-tool',
        name: 'System Tool',
        avatar: '',
        toolConfig: { systemTool: { toolId: 'systemTool-test' } },
        params: {}
      })
    });

    await executeTool({
      callId: 'call_system_tool',
      toolId: 'system-tool',
      args: '{}'
    });

    expect(dispatchToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowStreamResponse: undefined
      })
    );
    expect(streamResponseFn).not.toHaveBeenCalled();
  });

  it('omits built-in history for workflow sub-apps while preserving history business inputs for plugins', async () => {
    dispatchAppMock.mockResolvedValue({ response: 'app ok' });
    dispatchPluginMock.mockResolvedValue({ response: 'plugin ok' });

    const subApps = new Map<string, any>([
      [
        'child-app',
        {
          type: 'workflow',
          id: 'child-app',
          name: 'Child App',
          avatar: '',
          agentGeneratedInputKeys: ['userChatInput', 'topic'],
          params: { [NodeInputKeyEnum.forbidStream]: true, [NodeInputKeyEnum.history]: 6 }
        }
      ],
      [
        'plugin-tool',
        {
          type: 'toolWorkflow',
          id: 'plugin-tool',
          name: 'Plugin Tool',
          avatar: '',
          agentGeneratedInputKeys: [NodeInputKeyEnum.history],
          params: { [NodeInputKeyEnum.forbidStream]: true }
        }
      ]
    ]);
    const executeTool = createExecuteToolForTest({
      getSubApp: (id: string) => subApps.get(id)
    });

    await executeTool({
      callId: 'call_child_app',
      toolId: 'child-app',
      args: JSON.stringify({ userChatInput: 'hello', history: 10, topic: 'sales' })
    });
    await executeTool({
      callId: 'call_plugin_tool',
      toolId: 'plugin-tool',
      args: JSON.stringify({ history: 'order audit history' })
    });

    expect(dispatchAppMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userChatInput: 'hello',
        customAppVariables: { topic: 'sales' }
      })
    );
    expect(dispatchPluginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customAppVariables: { history: 'order audit history' }
      })
    );
  });

  it('passes structured tool content from dispatchTool to the agent loop result', async () => {
    const content = [
      { type: 'text', text: '{"files":["chart.png"]}' },
      { type: 'image_url', image_url: { url: 'https://files.example.com/chart.png' } }
    ];
    dispatchToolMock.mockResolvedValue({
      response: '{"files":["chart.png"]}',
      content
    });

    const executeTool = getExecuteTool({
      checkIsStopping: vi.fn(),
      chatConfig: {},
      runningUserInfo: { teamId: 'team_1', tmbId: 'tmb_1' },
      runningAppInfo: { id: 'app_1' },
      chatId: 'chat_1',
      uid: 'user_1',
      variableState: {} as any,
      externalProvider: {} as any,
      lang: 'zh-CN',
      requestOrigin: '',
      mode: 'chat',
      timezone: 'Asia/Shanghai',
      retainDatasetCite: false,
      maxRunTimes: 10,
      workflowDispatchDeep: 0,
      params: { model: 'gpt-4' },
      stream: true,
      streamResponseFn: vi.fn(),
      getSubApp: () => ({
        type: 'tool',
        id: 'system-tool',
        name: 'System Tool',
        avatar: '',
        toolConfig: { systemTool: { toolId: 'systemTool-test' } },
        params: {}
      }),
      completionTools: []
    } as any);

    const result = await executeTool({
      callId: 'call_plugin',
      toolId: 'system-tool',
      args: '{}'
    });

    // 业务输出保持原样，结构化 content 单独透传给 agent-loop。
    expect(result.response).toBe('{"files":["chart.png"]}');
    expect(result.content).toEqual(content);
  });

  it('omits content when the tool returns plain text', async () => {
    dispatchToolMock.mockResolvedValue({ response: 'plain result' });

    const executeTool = getExecuteTool({
      checkIsStopping: vi.fn(),
      chatConfig: {},
      runningUserInfo: { teamId: 'team_1', tmbId: 'tmb_1' },
      runningAppInfo: { id: 'app_1' },
      chatId: 'chat_1',
      uid: 'user_1',
      variableState: {} as any,
      externalProvider: {} as any,
      lang: 'zh-CN',
      requestOrigin: '',
      mode: 'chat',
      timezone: 'Asia/Shanghai',
      retainDatasetCite: false,
      maxRunTimes: 10,
      workflowDispatchDeep: 0,
      params: { model: 'gpt-4' },
      stream: true,
      streamResponseFn: vi.fn(),
      getSubApp: () => ({
        type: 'tool',
        id: 'system-tool',
        name: 'System Tool',
        avatar: '',
        toolConfig: { systemTool: { toolId: 'systemTool-test' } },
        params: {}
      }),
      completionTools: []
    } as any);

    const result = await executeTool({
      callId: 'call_plain',
      toolId: 'system-tool',
      args: '{}'
    });

    expect(result.response).toBe('plain result');
    expect(result.content).toBeUndefined();
  });
});

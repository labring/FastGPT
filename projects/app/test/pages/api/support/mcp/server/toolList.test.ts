import { describe, it, expect, vi } from 'vitest';
import {
  callMcpServerTool,
  pluginNodes2InputSchema,
  workflow2InputSchema
} from '@/service/support/mcp/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { failChatRound, finalizeChatRound } from '@fastgpt/service/core/chat/saveChat';
import { preChatRound } from '@fastgpt/service/core/chat/utils/prepare';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';

vi.mock('@fastgpt/service/support/mcp/schema', () => ({
  MongoMcpKey: {
    findOne: vi.fn().mockReturnValue({
      lean: vi.fn()
    })
  }
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    find: vi.fn().mockReturnValue({
      lean: vi.fn()
    })
  },
  AppCollectionName: 'apps',
  chatConfigType: {
    welcomeText: String,
    variables: Array,
    questionGuide: Object,
    ttsConfig: Object,
    whisperConfig: Object,
    scheduledTriggerConfig: Object,
    chatInputGuide: Object,
    fileSelectConfig: Object,
    instruction: String,
    autoExecute: Object
  }
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getRunningUserInfoByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/saveChat', () => ({
  finalizeChatRound: vi.fn(),
  failChatRound: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/utils/prepare', () => ({
  preChatRound: vi.fn()
}));

describe('toolList', () => {
  describe('pluginNodes2InputSchema', () => {
    it('should generate input schema for plugin nodes', () => {
      const nodes = [
        {
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          inputs: [
            {
              key: 'test',
              label: 'test',
              renderTypeList: [],
              valueType: WorkflowIOValueTypeEnum.string,
              description: 'test desc',
              required: true
            }
          ]
        }
      ];

      const schema = pluginNodes2InputSchema(nodes);

      expect(schema).toEqual({
        type: 'object',
        properties: {
          test: {
            type: 'string',
            description: 'test desc'
          }
        },
        required: ['test']
      });
    });
  });

  describe('workflow2InputSchema', () => {
    it('should generate input schema with file config', () => {
      const chatConfig = {
        fileSelectConfig: {
          canSelectFile: true,
          canSelectImg: true,
          maxFiles: 10
        },
        variables: []
      };

      const schema = workflow2InputSchema(chatConfig);

      expect(schema).toEqual({
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'Question from user'
          },
          fileUrlList: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'File linkage'
          }
        },
        required: ['question']
      });
    });

    it('should generate input schema with variables', () => {
      const chatConfig = {
        variables: [
          {
            key: 'var1',
            description: 'test var',
            required: true,
            id: 'var1',
            label: 'var1',
            type: VariableInputEnum.input,
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      };

      const schema = workflow2InputSchema(chatConfig);

      expect(schema).toEqual({
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'Question from user'
          },
          var1: {
            type: 'string',
            description: 'test var'
          }
        },
        required: ['question', 'var1']
      });
    });
  });
});

describe('callMcpServerTool', () => {
  it('returns workflowTool pluginOutput using the same value source as main', async () => {
    vi.mocked(MongoMcpKey.findOne).mockReturnValue({
      lean: () => ({
        apps: [
          {
            appId: 'app-id',
            toolName: 'plugin_tool',
            description: 'plugin tool'
          }
        ]
      })
    } as any);
    vi.mocked(MongoApp.find).mockReturnValue({
      lean: () => [
        {
          _id: 'app-id',
          name: 'Plugin App',
          type: AppTypeEnum.workflowTool,
          teamId: 'team-id',
          tmbId: 'tmb-id',
          modules: []
        }
      ]
    } as any);
    vi.mocked(getAppLatestVersion).mockResolvedValue({
      versionId: 'version-id',
      nodes: [
        {
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          inputs: []
        }
      ],
      edges: [],
      chatConfig: {}
    } as any);
    vi.mocked(getRunningUserInfoByTmbId).mockResolvedValue({
      username: 'user',
      teamName: 'team',
      memberName: 'member',
      contact: '',
      teamId: 'team-id',
      tmbId: 'tmb-id'
    });
    vi.mocked(dispatchWorkFlow).mockResolvedValue({
      assistantResponses: [],
      newVariables: {},
      toolResponse: { result: 'tool response should not be the plugin source' },
      durationSeconds: 1,
      runtimeNodeResponseSummary: {
        responseIds: ['plugin-output-response-id'],
        finishedNodeIds: [],
        hasError: false,
        hasLoopRunBreak: false,
        hasToolStop: false,
        hasNestedEnd: false,
        runningTime: 0,
        pluginOutput: {
          result: 'plugin output value'
        }
      }
    } as any);
    vi.mocked(preChatRound).mockResolvedValue({
      chatId: 'prepared-mcp-chat-id',
      responseChatItemId: 'prepared-mcp-response-id',
      shouldPersistChatRound: true,
      shouldFinalizePreparedRound: true
    });
    vi.mocked(finalizeChatRound).mockResolvedValue(undefined as any);
    vi.mocked(failChatRound).mockResolvedValue(undefined as any);

    await expect(
      callMcpServerTool({
        key: 'mcp-key',
        toolName: 'plugin_tool',
        inputs: {}
      })
    ).resolves.toBe(JSON.stringify({ result: 'plugin output value' }));

    expect(dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'prepared-mcp-chat-id',
        responseChatItemId: 'prepared-mcp-response-id'
      })
    );
    expect(finalizeChatRound).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'prepared-mcp-chat-id',
        aiContent: expect.objectContaining({
          dataId: 'prepared-mcp-response-id'
        })
      })
    );
  });
});

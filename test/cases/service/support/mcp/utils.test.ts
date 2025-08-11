import { describe, expect, it, vi } from 'vitest';
import {
  pluginNodes2InputSchema,
  workflow2InputSchema,
  getMcpServerTools,
  callMcpServerTool
} from '../../../../../projects/app/src/service/support/mcp/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import * as authModule from '@fastgpt/service/support/permission/app/auth';
import * as versionController from '@fastgpt/service/core/app/version/controller';
import * as teamAuth from '@fastgpt/service/support/permission/auth/team';
import * as teamUtils from '@fastgpt/service/support/user/team/utils';
import * as workflowDispatch from '@fastgpt/service/core/workflow/dispatch';
import * as chatController from '@fastgpt/service/core/chat/saveChat';
import * as usageController from '@fastgpt/service/support/wallet/usage/controller';

vi.mock('@fastgpt/service/support/mcp/schema', () => ({
  MongoMcpKey: {
    findOne: vi.fn().mockReturnValue({
      lean: vi.fn()
    })
  }
}));

vi.mock('@fastgpt/service/core/app/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/app/schema')>();
  return {
    ...actual,
    MongoApp: {
      find: vi.fn().mockReturnValue({
        lean: vi.fn()
      })
    }
  };
});

vi.mock('@fastgpt/service/support/permission/app/auth');
vi.mock('@fastgpt/service/core/app/version/controller');
vi.mock('@fastgpt/service/support/permission/auth/team');
vi.mock('@fastgpt/service/support/user/team/utils');
vi.mock('@fastgpt/service/core/workflow/dispatch');
vi.mock('@fastgpt/service/core/chat/saveChat');
vi.mock('@fastgpt/service/support/wallet/usage/controller');

describe('MCP Utils', () => {
  describe('pluginNodes2InputSchema', () => {
    it('should convert plugin nodes to input schema', () => {
      const nodes = [
        {
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          inputs: [
            {
              key: 'test',
              valueType: 'string',
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
    it('should create input schema for workflow', () => {
      const chatConfig = {
        fileSelectConfig: {
          canSelectFile: true
        },
        variables: [
          {
            key: 'var1',
            valueType: 'string',
            description: 'var desc',
            required: true
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
          fileUrlList: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'File linkage'
          },
          var1: {
            type: 'string',
            description: 'var desc'
          }
        },
        required: ['question', 'var1']
      });
    });
  });

  describe('getMcpServerTools', () => {
    it('should get mcp server tools', async () => {
      const mockMcp = {
        apps: [
          {
            appId: '1',
            toolName: 'tool1',
            description: 'desc1'
          }
        ],
        tmbId: 'tmb1'
      };

      const mockApp = {
        _id: '1',
        name: 'app1',
        intro: 'intro1',
        type: AppTypeEnum.plugin
      };

      const mockVersion = {
        nodes: [
          {
            flowNodeType: FlowNodeTypeEnum.pluginInput,
            inputs: []
          }
        ]
      };

      vi.mocked(MongoMcpKey.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockMcp)
      } as any);

      vi.mocked(MongoApp.find).mockReturnValue({
        lean: vi.fn().mockResolvedValue([mockApp])
      } as any);

      vi.mocked(authModule.authAppByTmbId).mockResolvedValue(undefined);
      vi.mocked(versionController.getAppLatestVersion).mockResolvedValue(mockVersion);

      const tools = await getMcpServerTools('key1');

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('tool1');
    });
  });

  describe('callMcpServerTool', () => {
    it('should call mcp server tool successfully', async () => {
      const mockMcp = {
        apps: [
          {
            appId: '1',
            toolName: 'tool1'
          }
        ]
      };

      const mockApp = {
        _id: '1',
        type: AppTypeEnum.plugin,
        teamId: 'team1',
        tmbId: 'tmb1',
        name: 'app1',
        modules: []
      };

      const mockVersion = {
        nodes: [
          {
            flowNodeType: FlowNodeTypeEnum.pluginInput,
            inputs: []
          }
        ],
        edges: []
      };

      const mockDispatchResult = {
        flowUsages: [],
        assistantResponses: [],
        newVariables: {},
        flowResponses: [
          {
            moduleType: FlowNodeTypeEnum.pluginOutput,
            pluginOutput: { result: 'success' }
          }
        ],
        durationSeconds: 1,
        system_memories: []
      };

      vi.mocked(MongoMcpKey.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockMcp)
      } as any);

      vi.mocked(MongoApp.find).mockReturnValue({
        lean: vi.fn().mockResolvedValue([mockApp])
      } as any);

      vi.mocked(teamAuth.getUserChatInfoAndAuthTeamPoints).mockResolvedValue({
        timezone: 'UTC',
        externalProvider: {}
      });
      vi.mocked(versionController.getAppLatestVersion).mockResolvedValue(mockVersion);
      vi.mocked(teamUtils.getRunningUserInfoByTmbId).mockResolvedValue({});
      vi.mocked(workflowDispatch.dispatchWorkFlow).mockResolvedValue(mockDispatchResult);
      vi.mocked(chatController.saveChat).mockResolvedValue(undefined);
      vi.mocked(usageController.createChatUsage).mockResolvedValue(undefined);

      const result = await callMcpServerTool({
        key: 'key1',
        toolName: 'tool1',
        inputs: {}
      });

      expect(result).toBe('{"result":"success"}');
    });
  });
});

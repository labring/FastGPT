import { describe, it, expect, vi } from 'vitest';
import {
  pluginNodes2InputSchema,
  workflow2InputSchema,
  handler
} from '@/pages/api/support/mcp/server/toolList';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

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
  }
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: vi.fn()
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
    it('should generate input schema with file config', () => {
      const chatConfig = {
        fileSelectConfig: {
          canSelectFile: true
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
            valueType: 'string',
            description: 'test var',
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
          var1: {
            type: 'string',
            description: 'test var'
          }
        },
        required: ['question', 'var1']
      });
    });
  });

  describe('handler', () => {
    it('should return tools list', async () => {
      const mockMcp = {
        tmbId: 'test-tmb',
        apps: [
          {
            appId: 'app1',
            toolName: 'tool1',
            toolAlias: 'alias1',
            description: 'desc1'
          }
        ]
      };

      const mockApp = {
        _id: 'app1',
        name: 'app1'
      };

      const mockVersion = {
        nodes: [],
        chatConfig: {}
      };

      vi.mocked(MongoMcpKey.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockMcp)
      });

      vi.mocked(MongoApp.find).mockReturnValue({
        lean: () => Promise.resolve([mockApp])
      });

      vi.mocked(authAppByTmbId).mockResolvedValue(undefined);
      vi.mocked(getAppLatestVersion).mockResolvedValue(mockVersion);

      const result = await handler(
        {
          query: { key: 'test-key' },
          body: {}
        },
        {} as any
      );

      expect(result).toEqual([
        {
          name: 'alias1',
          description: 'desc1',
          inputSchema: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: 'Question from user'
              }
            },
            required: ['question']
          }
        }
      ]);
    });

    it('should throw error if mcp key not found', async () => {
      vi.mocked(MongoMcpKey.findOne).mockReturnValue({
        lean: () => Promise.resolve(null)
      });

      await expect(
        handler(
          {
            query: { key: 'invalid-key' },
            body: {}
          },
          {} as any
        )
      ).rejects.toBe(CommonErrEnum.invalidResource);
    });
  });
});

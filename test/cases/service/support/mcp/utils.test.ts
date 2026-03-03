import { describe, expect, it, vi } from 'vitest';
import {
  pluginNodes2InputSchema,
  workflow2InputSchema,
  getMcpServerTools
} from '@/service/support/mcp/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';

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

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/auth/team', () => ({
  getUserChatInfo: vi.fn(),
  getRunningUserInfoByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/saveChat', () => ({
  saveChat: vi.fn()
}));

describe('pluginNodes2InputSchema', () => {
  it('should generate input schema from plugin nodes', () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.pluginInput,
        inputs: [
          {
            key: 'testKey',
            valueType: 'string',
            description: 'test description',
            required: true,
            enum: 'a\nb\nc'
          }
        ]
      }
    ];

    const schema = pluginNodes2InputSchema(nodes);

    expect(schema).toEqual({
      type: 'object',
      properties: {
        testKey: {
          type: 'string',
          description: 'test description',
          enum: ['a', 'b', 'c']
        }
      },
      required: ['testKey']
    });
  });

  it('should handle empty plugin input nodes', () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.pluginInput,
        inputs: []
      }
    ];

    const schema = pluginNodes2InputSchema(nodes);

    expect(schema).toEqual({
      type: 'object',
      properties: {},
      required: []
    });
  });
});

describe('workflow2InputSchema', () => {
  it('should generate input schema with file config', () => {
    const chatConfig = {
      fileSelectConfig: {
        canSelectFile: true,
        canSelectImg: true
      },
      variables: [
        {
          key: 'var1',
          valueType: 'string',
          description: 'test var',
          required: true,
          enums: [{ value: 'a' }, { value: 'b' }]
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
          description: 'test var',
          enum: ['a', 'b']
        }
      },
      required: ['question', 'var1']
    });
  });
});

describe('getMcpServerTools', () => {
  it('should return tools list', async () => {
    const mockMcp = {
      tmbId: 'test-tmb',
      apps: [
        {
          appId: 'test-app',
          toolName: 'test-tool',
          description: 'test description'
        }
      ]
    };

    vi.mocked(MongoMcpKey.findOne).mockReturnValue({
      lean: () => mockMcp
    });

    vi.mocked(MongoApp.find).mockReturnValue({
      lean: () => [
        {
          _id: 'test-app',
          name: 'Test App',
          type: AppTypeEnum.workflowTool
        }
      ]
    });

    vi.mocked(authAppByTmbId).mockResolvedValue(undefined);

    vi.mocked(getAppLatestVersion).mockResolvedValue({
      nodes: [
        {
          flowNodeType: FlowNodeTypeEnum.pluginInput,
          inputs: []
        }
      ],
      edges: [],
      chatConfig: {}
    });

    const tools = await getMcpServerTools('test-key');

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('test-tool');
  });

  it('should reject if key not found', async () => {
    vi.mocked(MongoMcpKey.findOne).mockReturnValue({
      lean: () => null
    });

    await expect(getMcpServerTools('invalid-key')).rejects.toBe(CommonErrEnum.invalidResource);
  });
});

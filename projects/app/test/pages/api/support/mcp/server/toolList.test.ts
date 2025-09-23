import { describe, it, expect, vi } from 'vitest';
import { pluginNodes2InputSchema, workflow2InputSchema } from '@/service/support/mcp/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';

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

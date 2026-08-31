import {
  CreateAppBodySchema,
  CreateAppRequestBodySchema,
  UpdateAppBodySchema
} from '@fastgpt/global/openapi/core/app/common/api';
import { PublishAppBodySchema } from '@fastgpt/global/openapi/core/app/version/api';
import { describe, expect, it } from 'vitest';

const currentNode = {
  nodeId: 'start-1',
  flowNodeType: 'workflowStart',
  name: 'Start',
  inputs: [
    {
      key: 'query',
      label: 'Query',
      renderTypeList: ['input'],
      defaultToAgentGenerated: true
    }
  ],
  outputs: []
};

describe('UpdateAppBodySchema', () => {
  it('rejects workflow fields', () => {
    expect(UpdateAppBodySchema.safeParse({ nodes: [] }).success).toBe(false);
  });
});

describe('CreateAppBodySchema', () => {
  it('accepts canonical workflow payload', () => {
    expect(
      CreateAppBodySchema.safeParse({
        name: 'canonical app',
        type: 'simple',
        modules: [currentNode],
        edges: [],
        chatConfig: {}
      }).success
    ).toBe(true);
  });

  it('migrates legacy workflow before validation', () => {
    const result = CreateAppRequestBodySchema.parse({
      name: 'legacy app',
      type: 'simple',
      modules: [
        {
          ...currentNode,
          inputs: [
            {
              ...currentNode.inputs[0],
              llmModelType: 'chat'
            }
          ]
        },
        {
          nodeId: 'legacy-system-config',
          flowNodeType: 'userGuide',
          name: 'Legacy system config',
          inputs: [],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: { _id: 'legacy-chat-config' }
    });

    expect(result.modules).toHaveLength(1);
    expect(result.modules?.[0].inputs[0]).not.toHaveProperty('llmModelType');
    expect(result.chatConfig).not.toHaveProperty('_id');
  });

  it('strips unsupported request fields after migration', () => {
    const result = CreateAppRequestBodySchema.parse({
      name: 'app with extra field',
      type: 'simple',
      modules: [currentNode],
      edges: [],
      chatConfig: {},
      unsupported: true
    });

    expect(result).not.toHaveProperty('unsupported');
  });
});

describe('PublishAppBodySchema', () => {
  it('accepts current NodeIO and strips unknown workflow fields', () => {
    expect(
      PublishAppBodySchema.safeParse({ nodes: [currentNode], edges: [], chatConfig: {} }).success
    ).toBe(true);

    const result = PublishAppBodySchema.parse({
      nodes: [
        {
          ...currentNode,
          unsupportedNodeField: true,
          inputs: [{ ...currentNode.inputs[0], unsupportedInputField: true }]
        }
      ],
      edges: [],
      chatConfig: {}
    });

    expect(result).not.toHaveProperty('nodes.0.unsupportedNodeField');
    expect(result).not.toHaveProperty('nodes.0.inputs.0.unsupportedInputField');
  });
});

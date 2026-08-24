import {
  CreateAppBodySchema,
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

  it('accepts known legacy workflow fields for server migration', () => {
    const result = CreateAppBodySchema.safeParse({
      name: 'legacy app',
      type: 'simple',
      modules: [
        {
          ...currentNode,
          inputs: [
            {
              ...currentNode.inputs[0],
              selectedTypeIndex: 0,
              isToolParam: true
            }
          ]
        }
      ],
      edges: [],
      chatConfig: {}
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.modules?.[0].inputs[0]).toMatchObject({
      selectedTypeIndex: 0,
      isToolParam: true
    });
  });

  it('rejects unsupported workflow fields at the API boundary', () => {
    expect(
      CreateAppBodySchema.safeParse({
        name: 'legacy app',
        type: 'simple',
        modules: [
          {
            ...currentNode,
            userGuide: 'legacy guide',
            inputs: [{ ...currentNode.inputs[0], isToolParam: true }]
          }
        ],
        edges: [
          {
            source: 'start-1',
            sourceHandle: 'output',
            target: 'end-1',
            targetHandle: 'input',
            legacy: true
          }
        ],
        chatConfig: { pluginConfig: {} }
      }).success
    ).toBe(false);
  });
});

describe('PublishAppBodySchema', () => {
  it('accepts current NodeIO and rejects the old default field', () => {
    expect(
      PublishAppBodySchema.safeParse({ nodes: [currentNode], edges: [], chatConfig: {} }).success
    ).toBe(true);
    expect(
      PublishAppBodySchema.safeParse({
        nodes: [
          {
            ...currentNode,
            inputs: [{ ...currentNode.inputs[0], isToolParam: true }]
          }
        ],
        edges: [],
        chatConfig: {}
      }).success
    ).toBe(false);
  });
});

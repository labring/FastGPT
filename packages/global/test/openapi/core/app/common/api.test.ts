import {
  CreateAppBodySchema,
  UpdateAppBodySchema
} from '@fastgpt/global/openapi/core/app/common/api';
import { describe, expect, it } from 'vitest';

describe('UpdateAppBodySchema', () => {
  it('rejects workflow fields', () => {
    expect(UpdateAppBodySchema.safeParse({ nodes: [] }).success).toBe(false);
  });
});

describe('CreateAppBodySchema', () => {
  const currentNode = {
    nodeId: 'start-1',
    flowNodeType: 'workflowStart',
    name: 'Start',
    inputs: [
      {
        key: 'query',
        label: 'Query',
        renderTypeList: ['input']
      }
    ],
    outputs: []
  };

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

  it('rejects legacy workflow fields instead of stripping them', () => {
    expect(
      CreateAppBodySchema.safeParse({
        name: 'legacy app',
        type: 'simple',
        modules: [
          {
            ...currentNode,
            userGuide: 'legacy guide',
            inputs: [{ ...currentNode.inputs[0], selectedTypeIndex: 0 }]
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

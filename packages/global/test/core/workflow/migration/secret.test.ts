import { describe, expect, it } from 'vitest';
import {
  migrateSecretStoreToCurrent,
  migrateSecretValueToCurrent,
  migrateWorkflowSecretValues
} from '@fastgpt/global/core/workflow/migration/secret';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';

const legacy = { value: '', secret: 'cipher' };
const current = { secret: 'cipher' };

describe('migrateSecretValueToCurrent', () => {
  it('delegates credential normalization and preserves unrelated values', () => {
    expect(migrateSecretValueToCurrent(legacy)).toEqual(current);
    const business = { ref: 'main', repository: 'example' };
    expect(migrateSecretValueToCurrent(business)).toBe(business);
  });
});

describe('migrateSecretStoreToCurrent', () => {
  it('normalizes map entries and preserves invalid containers', () => {
    const reference = { ref: ['node', 'token'] };
    expect(migrateSecretStoreToCurrent({ token: legacy, reference, count: 1 })).toEqual({
      token: current,
      reference,
      count: 1
    });
    for (const value of [undefined, null, [], 'plain']) {
      expect(migrateSecretStoreToCurrent(value)).toBe(value);
    }
  });
});

describe('migrateWorkflowSecretValues', () => {
  it('migrates explicit password declarations and HTTP auth without rewriting business JSON', () => {
    const workflow = {
      nodes: [
        {
          flowNodeType: FlowNodeTypeEnum.httpRequest468,
          inputs: [
            {
              inputList: [
                null,
                { inputType: 'input', value: legacy },
                { inputType: 'secret' },
                { inputType: 'secret', value: legacy }
              ]
            },
            { renderTypeList: [FlowNodeInputTypeEnum.password], value: legacy },
            { key: NodeInputKeyEnum.headerSecret, value: { Authorization: legacy } },
            {
              key: 'payload',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              value: { headerSecret: legacy }
            }
          ]
        }
      ]
    };
    const before = structuredClone(workflow);
    const result = migrateWorkflowSecretValues(workflow);
    expect(result.nodes[0].inputs).toEqual([
      {
        inputList: [
          null,
          { inputType: 'input', value: legacy },
          { inputType: 'secret' },
          { inputType: 'secret', value: current }
        ]
      },
      { renderTypeList: [FlowNodeInputTypeEnum.password], value: current },
      { key: NodeInputKeyEnum.headerSecret, value: { Authorization: current } },
      before.nodes[0].inputs[3]
    ]);
    expect(workflow).toEqual(before);
    expect(migrateWorkflowSecretValues(result)).toEqual(result);
  });

  it('limits system config migration to tool nodes, including historical inactive values', () => {
    const inputs = ['manual', 'system'].map((type) => ({
      key: NodeInputKeyEnum.systemInputConfig,
      value: { type, value: { token: legacy } }
    }));
    const workflow = {
      nodes: [
        { flowNodeType: FlowNodeTypeEnum.tool, inputs },
        {
          flowNodeType: FlowNodeTypeEnum.code,
          inputs: [
            ...inputs,
            { key: NodeInputKeyEnum.headerSecret, value: { Authorization: legacy } }
          ]
        }
      ]
    };
    const result = migrateWorkflowSecretValues(workflow);
    expect(result.nodes[0].inputs).toEqual(
      ['manual', 'system'].map((type) => ({
        key: NodeInputKeyEnum.systemInputConfig,
        value: { type, value: { token: current } }
      }))
    );
    expect(result.nodes[1]).toEqual(workflow.nodes[1]);
  });

  it.each(['mcpToolSet', 'httpToolSet'] as const)(
    'migrates parent and child %s headers only in toolSet or Agent tool configuration',
    (toolSetKey) => {
      const toolConfig = {
        [toolSetKey]: {
          headerSecret: { Authorization: legacy },
          toolList: [null, {}, { headerSecret: { 'X-Token': { value: 'plain', secret: 'old' } } }]
        }
      };
      const config = {
        payload: { ref: 'main', repository: 'example' },
        apiKey: { value: 'business', secret: 'business-cipher' }
      };
      const selected = [{ config, toolConfig }];
      const workflow = {
        nodes: [
          {
            flowNodeType: FlowNodeTypeEnum.toolSet,
            toolConfig,
            inputs: [{ key: 'payload', value: { toolConfig } }]
          },
          {
            flowNodeType: FlowNodeTypeEnum.agent,
            inputs: [{ key: NodeInputKeyEnum.selectedTools, value: selected }]
          },
          {
            flowNodeType: FlowNodeTypeEnum.code,
            toolConfig,
            inputs: [{ key: NodeInputKeyEnum.selectedTools, value: selected }]
          }
        ]
      };
      const before = structuredClone(workflow);
      const result = migrateWorkflowSecretValues(workflow);
      const expected = {
        [toolSetKey]: {
          headerSecret: { Authorization: current },
          toolList: [null, {}, { headerSecret: { 'X-Token': { value: 'plain' } } }]
        }
      };
      expect(result.nodes[0]).toMatchObject({ toolConfig: expected });
      expect(result.nodes[1]).toMatchObject({
        inputs: [{ value: [{ config, toolConfig: expected }] }]
      });
      expect(result.nodes[0]).toMatchObject({ inputs: [{ value: { toolConfig } }] });
      expect(result.nodes[2]).toEqual(before.nodes[2]);
      expect(workflow).toEqual(before);
      expect(migrateWorkflowSecretValues(result)).toEqual(result);
    }
  );

  it('preserves empty or malformed containers at the migration boundary', () => {
    const workflow = {
      nodes: [
        null,
        { inputs: null },
        { inputs: [null] },
        {
          flowNodeType: FlowNodeTypeEnum.httpRequest468,
          inputs: [
            { key: NodeInputKeyEnum.headerSecret },
            { renderTypeList: [FlowNodeInputTypeEnum.password] }
          ]
        },
        {
          flowNodeType: FlowNodeTypeEnum.tool,
          inputs: [
            { key: NodeInputKeyEnum.systemInputConfig, value: null },
            { key: NodeInputKeyEnum.systemInputConfig, value: { value: null } }
          ]
        },
        {
          flowNodeType: FlowNodeTypeEnum.agent,
          inputs: [
            { key: 'payload', value: [] },
            { key: NodeInputKeyEnum.selectedTools, value: null },
            {
              key: NodeInputKeyEnum.selectedTools,
              value: [null, {}, { toolConfig: null }, { toolConfig: {} }]
            }
          ]
        },
        { flowNodeType: FlowNodeTypeEnum.toolSet, toolConfig: null },
        { flowNodeType: FlowNodeTypeEnum.toolSet, toolConfig: { mcpToolSet: {}, httpToolSet: {} } }
      ]
    };
    expect(migrateWorkflowSecretValues(workflow)).toEqual(workflow);
  });
});

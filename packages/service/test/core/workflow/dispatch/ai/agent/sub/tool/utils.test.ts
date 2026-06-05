import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { formatAgentToolSchema } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool/utils';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';

describe('formatAgentToolSchema', () => {
  const matrixSchema: JSONSchemaInputType = {
    type: 'object',
    properties: {
      matrix: {
        type: 'array',
        items: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        description: 'Two-dimensional string array.'
      }
    },
    required: ['matrix']
  };

  it('uses runtime jsonSchema before valueType fallback', () => {
    const schema = formatAgentToolSchema({
      toolId: 'echo_matrix',
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'echo_matrix',
      intro: 'Echo matrix.',
      jsonSchema: matrixSchema,
      inputs: [
        {
          key: 'matrix',
          valueType: WorkflowIOValueTypeEnum.arrayAny,
          toolDescription: 'Two-dimensional string array.',
          required: true,
          renderTypeList: []
        } as any
      ]
    });

    expect(schema.function.parameters).toBe(matrixSchema);
  });

  it('uses toolData input schema before valueType fallback', () => {
    const schema = formatAgentToolSchema({
      toolId: 'echo_matrix',
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'echo_matrix',
      intro: 'Echo matrix.',
      inputs: [
        {
          key: NodeInputKeyEnum.toolData,
          value: {
            inputSchema: matrixSchema
          },
          renderTypeList: []
        } as any,
        {
          key: 'matrix',
          valueType: WorkflowIOValueTypeEnum.arrayAny,
          toolDescription: 'Two-dimensional string array.',
          required: true,
          renderTypeList: []
        } as any
      ]
    });

    expect(schema.function.parameters).toBe(matrixSchema);
  });

  it('falls back to valueType schema when no jsonSchema exists', () => {
    const schema = formatAgentToolSchema({
      toolId: 'echo_matrix',
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'echo_matrix',
      intro: 'Echo matrix.',
      inputs: [
        {
          key: 'matrix',
          valueType: WorkflowIOValueTypeEnum.arrayAny,
          toolDescription: 'Two-dimensional string array.',
          required: true,
          renderTypeList: []
        } as any
      ]
    });

    expect(schema.function.parameters).toEqual({
      type: 'object',
      properties: {
        matrix: {
          type: 'string',
          description: 'Two-dimensional string array.',
          enum: undefined
        }
      },
      required: ['matrix']
    });
  });
});

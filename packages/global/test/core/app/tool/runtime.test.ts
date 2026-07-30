import { describe, expect, it } from 'vitest';
import {
  compileToolRuntime,
  mergeToolRuntimeParams,
  validateToolInputValue,
  validateToolRuntimeParams
} from '@fastgpt/global/core/app/tool/runtime';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

describe('compileToolRuntime', () => {
  it('separates model parameters from configured values and defaults', () => {
    const compiled = compileToolRuntime({
      toolId: 'search',
      name: 'Search',
      description: 'Search documents',
      inputs: [
        {
          key: 'query',
          label: 'Query',
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.input],
          selectedType: FlowNodeInputTypeEnum.agentGenerated,
          required: true
        },
        {
          key: 'limit',
          label: 'Limit',
          valueType: WorkflowIOValueTypeEnum.number,
          renderTypeList: [FlowNodeInputTypeEnum.numberInput],
          selectedType: FlowNodeInputTypeEnum.numberInput,
          defaultValue: 5,
          required: true
        },
        {
          key: 'dataset',
          label: 'Dataset',
          valueType: WorkflowIOValueTypeEnum.selectDataset,
          renderTypeList: [FlowNodeInputTypeEnum.selectDataset],
          value: ['dataset-id']
        }
      ],
      jsonSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 2 },
          limit: { type: 'number', minimum: 1 },
          dataset: { type: 'string' }
        },
        required: ['query', 'limit']
      }
    });

    expect(compiled.modelTool.function.parameters).toEqual({
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2 }
      },
      required: ['query']
    });
    expect(compiled.agentGeneratedKeys).toEqual(['query']);
    expect(compiled.fixedInputBindings).toEqual({
      limit: 5,
      dataset: ['dataset-id']
    });
  });

  it('normalizes persisted modes to each input allowed modes', () => {
    const compiled = compileToolRuntime({
      toolId: 'guarded-tool',
      name: 'Guarded tool',
      inputs: [
        {
          key: 'dataset',
          valueType: WorkflowIOValueTypeEnum.selectDataset,
          renderTypeList: [FlowNodeInputTypeEnum.selectDataset],
          selectedType: FlowNodeInputTypeEnum.agentGenerated,
          value: ['dataset-id']
        },
        {
          key: 'mixedUnion',
          valueType: WorkflowIOValueTypeEnum.any,
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated],
          selectedType: FlowNodeInputTypeEnum.input,
          value: 'persisted-manual-value'
        }
      ]
    });

    expect(compiled.agentGeneratedKeys).toEqual(['mixedUnion']);
    expect(compiled.fixedInputBindings).toEqual({ dataset: ['dataset-id'] });
  });
});

describe('mergeToolRuntimeParams', () => {
  it('filters unknown model fields and keeps fixed bindings authoritative', () => {
    const result = mergeToolRuntimeParams({
      agentGeneratedKeys: ['query'],
      fixedInputBindings: { limit: 5 },
      aiParams: { query: 'fastgpt', limit: 100, unknown: true }
    });

    expect(result).toEqual({ limit: 5, query: 'fastgpt' });
  });

  it('rejects conflicting generated and fixed keys', () => {
    expect(() =>
      mergeToolRuntimeParams({
        agentGeneratedKeys: ['query'],
        fixedInputBindings: { query: 'fixed' },
        aiParams: { query: 'generated' }
      })
    ).toThrow('query');
  });
});

describe('JSON Schema runtime validation', () => {
  const propertySchema = {
    type: 'string',
    pattern: '^[a-z]+$',
    minLength: 3
  } as const;

  it('validates a configured value with the original property schema', () => {
    expect(validateToolInputValue({ schema: propertySchema, value: 'fastgpt' })).toEqual({
      success: true,
      errors: []
    });

    const invalid = validateToolInputValue({ schema: propertySchema, value: 'A' });
    expect(invalid.success).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  it('validates complete runtime parameters while preserving required checks', () => {
    const result = validateToolRuntimeParams({
      jsonSchema: {
        type: 'object',
        properties: {
          query: propertySchema
        },
        required: ['query'],
        additionalProperties: false
      },
      params: { query: 'fastgpt' }
    });

    expect(result).toEqual({ success: true, errors: [] });

    expect(
      validateToolRuntimeParams({
        jsonSchema: {
          type: 'object',
          properties: { query: propertySchema },
          additionalProperties: false
        },
        params: { query: 'fastgpt', unknown: true }
      }).success
    ).toBe(false);
  });

  it('validates root union schemas', () => {
    const jsonSchema = {
      oneOf: [
        {
          type: 'object',
          properties: { query: { type: 'string', minLength: 3 } },
          required: ['query'],
          additionalProperties: false
        },
        {
          type: 'object',
          properties: { count: { type: 'number', minimum: 1 } },
          required: ['count'],
          additionalProperties: false
        }
      ]
    };

    expect(
      validateToolRuntimeParams({
        jsonSchema,
        params: { query: 'fastgpt' }
      })
    ).toEqual({ success: true, errors: [] });

    const invalid = validateToolRuntimeParams({
      jsonSchema,
      params: { query: 'x' }
    });
    expect(invalid.success).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  it('validates root references and pattern properties without pre-filtering params', () => {
    const referencedSchema = {
      $ref: '#/$defs/input',
      $defs: {
        input: {
          type: 'object',
          properties: { query: { type: 'string', minLength: 3 } },
          required: ['query'],
          additionalProperties: false
        }
      }
    };
    expect(
      validateToolRuntimeParams({ jsonSchema: referencedSchema, params: { query: 'fastgpt' } })
    ).toEqual({ success: true, errors: [] });

    const patternSchema = {
      type: 'object',
      patternProperties: { '^value_': { type: 'number' } },
      additionalProperties: false
    };
    expect(
      validateToolRuntimeParams({ jsonSchema: patternSchema, params: { value_count: 'invalid' } })
        .success
    ).toBe(false);
  });
});

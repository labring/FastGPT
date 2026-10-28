import { describe, expect, it } from 'vitest';
import {
  compileToolRuntime,
  mergeToolRuntimeParams,
  validateToolInputValue
} from '@fastgpt/global/core/app/tool/runtime';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';
import {
  canInputBeAgentGenerated,
  normalizeFlowNodeInputType
} from '@fastgpt/global/core/app/formEdit/utils';
import { nodeInputs2JsonSchema } from '@fastgpt/global/core/app/jsonschema';

describe('compileToolRuntime', () => {
  it('exposes generated file inputs as array<string>', () => {
    const compiled = compileToolRuntime({
      toolId: 'file-tool',
      name: 'File tool',
      inputs: [
        {
          key: 'files',
          label: 'Files',
          valueType: WorkflowIOValueTypeEnum.arrayString,
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.fileSelect],
          selectedType: FlowNodeInputTypeEnum.agentGenerated,
          required: true
        }
      ]
    });

    expect(compiled.modelTool.function.parameters).toEqual({
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files'
        }
      },
      required: ['files']
    });
  });

  it('uses ToolCallNode default agent-generated inputs for its model schema', () => {
    const toolInputs = ToolCallNode.inputs
      .filter((input) =>
        [
          NodeInputKeyEnum.aiSystemPrompt,
          NodeInputKeyEnum.history,
          NodeInputKeyEnum.fileUrlList,
          NodeInputKeyEnum.userChatInput
        ].includes(input.key as NodeInputKeyEnum)
      )
      .map((input) => normalizeFlowNodeInputType(input, { isTool: true }));
    const compiled = compileToolRuntime({
      toolId: 'agent',
      name: 'Agent',
      inputs: toolInputs
    });

    // 提示词和聊天记录由开发者配置，文件链接与用户输入默认进入模型 schema
    expect(compiled.agentGeneratedKeys).toEqual([
      NodeInputKeyEnum.fileUrlList,
      NodeInputKeyEnum.userChatInput
    ]);
    [NodeInputKeyEnum.aiSystemPrompt, NodeInputKeyEnum.history].forEach((key) => {
      expect(toolInputs.find((input) => input.key === key)?.selectedType).not.toBe(
        FlowNodeInputTypeEnum.agentGenerated
      );
    });

    const manualInputs = toolInputs.map((input) => ({
      ...input,
      selectedType: input.renderTypeList.find(
        (type) => type !== FlowNodeInputTypeEnum.agentGenerated
      )
    }));
    const manualCompiled = compileToolRuntime({
      toolId: 'agent',
      name: 'Agent',
      inputs: manualInputs
    });
    expect(manualCompiled.agentGeneratedKeys).toEqual([]);
    expect(manualCompiled.modelTool.function).not.toHaveProperty('parameters');
  });

  it('builds the function description from the tool name and intro', () => {
    const compiled = compileToolRuntime({
      toolId: 'search',
      name: 'Search',
      description: 'Search documents',
      inputs: []
    });
    const withoutIntro = compileToolRuntime({
      toolId: 'search',
      name: 'Search',
      description: '',
      inputs: []
    });

    expect(compiled.modelTool.function.description).toBe('Search: Search documents');
    expect(withoutIntro.modelTool.function.description).toBe('Search');
  });

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

  it('keeps a selected workflow reference out of the model schema', () => {
    const compiled = compileToolRuntime({
      toolId: 'workflow-tool',
      name: 'Workflow tool',
      inputs: [
        {
          key: 'var_ref',
          label: 'var_ref',
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          value: ['workflowStart', 'userChatInput']
        },
        {
          key: 'var_ref2',
          label: 'var_ref2',
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.agentGenerated
        }
      ]
    });

    expect(compiled.modelTool.function.parameters).toEqual({
      type: 'object',
      properties: {
        var_ref2: { type: 'string', description: 'var_ref2' }
      }
    });
    expect(compiled.agentGeneratedKeys).toEqual(['var_ref2']);
    expect(compiled.fixedInputBindings).toEqual({
      var_ref: ['workflowStart', 'userChatInput']
    });
  });

  it('keeps off inputs out of the model schema while the external schema keeps their metadata', () => {
    const inputs: FlowNodeInputItemType[] = [
      {
        key: 'offInput',
        label: 'Off input',
        valueType: WorkflowIOValueTypeEnum.number,
        defaultValue: 3,
        required: true,
        renderTypeList: [FlowNodeInputTypeEnum.off]
      },
      {
        key: 'query',
        label: 'Query',
        valueType: WorkflowIOValueTypeEnum.string,
        renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.input],
        selectedType: FlowNodeInputTypeEnum.agentGenerated,
        required: true
      }
    ];

    // off 只面向第三方接口调用方，不参与 Agent 生成
    expect(canInputBeAgentGenerated(inputs[0])).toBe(false);

    const compiled = compileToolRuntime({
      toolId: 'off-tool',
      name: 'Off tool',
      inputs
    });

    expect(compiled.agentGeneratedKeys).toEqual(['query']);
    expect(compiled.modelTool.function.parameters).toEqual({
      type: 'object',
      properties: { query: { type: 'string', description: 'Query' } },
      required: ['query']
    });
    // 模型不生成 off 字段，改按节点默认值固定传入
    expect(compiled.fixedInputBindings).toEqual({ offInput: 3 });

    // 第三方调用方 schema 仍保留 off 字段及 required/default 元数据
    const jsonSchema = nodeInputs2JsonSchema({
      inputs,
      includeNodeMetadata: true,
      filterInternalInputs: true
    });
    expect(jsonSchema.properties?.offInput).toMatchObject({
      type: 'number',
      default: 3,
      'x-fastgpt-node-input': {
        valueType: WorkflowIOValueTypeEnum.number,
        defaultValue: 3,
        renderTypeList: [FlowNodeInputTypeEnum.off]
      }
    });
    expect(jsonSchema.required).toEqual(['offInput', 'query']);
  });

  it('keeps editable Code custom inputs in the model schema', () => {
    const compiled = compileToolRuntime({
      toolId: 'code',
      name: 'Code',
      inputs: [
        {
          key: 'customParam',
          label: 'customParam',
          valueType: WorkflowIOValueTypeEnum.string,
          canEdit: true,
          defaultToAgentGenerated: true,
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.agentGenerated
        }
      ]
    });

    expect(compiled.agentGeneratedKeys).toEqual(['customParam']);
    expect(compiled.modelTool.function.parameters).toEqual({
      type: 'object',
      properties: {
        customParam: { type: 'string', description: 'customParam' }
      }
    });
  });

  it('normalizes persisted modes to each input allowed modes', () => {
    const compiled = compileToolRuntime({
      toolId: 'guarded-tool',
      name: 'Guarded tool',
      inputs: [
        {
          key: 'dataset',
          label: 'Dataset',
          valueType: WorkflowIOValueTypeEnum.selectDataset,
          renderTypeList: [FlowNodeInputTypeEnum.selectDataset],
          selectedType: FlowNodeInputTypeEnum.agentGenerated,
          value: ['dataset-id']
        },
        {
          key: 'mixedUnion',
          label: 'Mixed union',
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

  it('removes title and default annotations from JSON Schema model parameters recursively', () => {
    const compiled = compileToolRuntime({
      toolId: 'search',
      name: 'Search',
      inputs: [
        {
          key: 'filter',
          label: 'Filter',
          valueType: WorkflowIOValueTypeEnum.object,
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated],
          selectedType: FlowNodeInputTypeEnum.agentGenerated
        }
      ],
      jsonSchema: {
        type: 'object',
        title: 'Search parameters',
        default: { filter: { query: 'fastgpt' } },
        properties: {
          filter: {
            type: 'object',
            title: 'Filter',
            default: { query: 'fastgpt' },
            properties: {
              query: {
                type: 'string',
                title: 'Query',
                default: 'fastgpt'
              }
            }
          }
        }
      }
    });

    expect(compiled.modelTool.function.parameters).toEqual({
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          }
        }
      }
    });
  });

  it('removes NodeIO titles and defaults from model parameters without changing manual bindings', () => {
    const compiled = compileToolRuntime({
      toolId: 'search',
      name: 'Search',
      inputs: [
        {
          key: 'query',
          label: 'Query',
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated],
          selectedType: FlowNodeInputTypeEnum.agentGenerated,
          defaultValue: 'fallback'
        },
        {
          key: 'limit',
          label: 'Limit',
          valueType: WorkflowIOValueTypeEnum.number,
          renderTypeList: [FlowNodeInputTypeEnum.numberInput],
          selectedType: FlowNodeInputTypeEnum.numberInput,
          defaultValue: 5
        }
      ]
    });

    expect(compiled.modelTool.function.parameters).toEqual({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query' }
      }
    });
    expect(compiled.fixedInputBindings).toEqual({ limit: 5 });
  });
});

describe('mergeToolRuntimeParams', () => {
  it('passes through model fields and keeps fixed bindings authoritative', () => {
    const result = mergeToolRuntimeParams({
      agentGeneratedKeys: ['query'],
      fixedInputBindings: { limit: 5 },
      aiParams: { query: 'fastgpt', limit: 100, unknown: true }
    });

    expect(result).toEqual({ limit: 5, query: 'fastgpt', unknown: true });
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

describe('JSON Schema manual input validation', () => {
  const legacyObject = {
    type: 'object',
    properties: { name: { type: 'string', required: true } }
  };
  it.each([
    {
      name: 'array items',
      schema: { type: 'array', items: legacyObject },
      valid: [{ name: 'Alice' }],
      invalid: [{}]
    },
    {
      name: 'legacy tuple items',
      schema: { type: 'array', items: [legacyObject], additionalItems: false },
      valid: [{ name: 'Alice' }],
      invalid: [{}]
    },
    {
      name: 'anyOf',
      schema: { anyOf: [legacyObject, { type: 'null' }] },
      valid: { name: 'Alice' },
      invalid: {}
    },
    {
      name: 'boolean oneOf branch',
      schema: { oneOf: [false, legacyObject] },
      valid: { name: 'Alice' },
      invalid: {}
    },
    {
      name: 'additionalProperties',
      schema: { type: 'object', additionalProperties: legacyObject },
      valid: { entry: { name: 'Alice' } },
      invalid: { entry: {} }
    },
    {
      name: '$defs reference',
      schema: { $ref: '#/$defs/entry', $defs: { entry: legacyObject } },
      valid: { name: 'Alice' },
      invalid: {}
    }
  ])('normalizes nested legacy required flags in $name', ({ schema, valid, invalid }) => {
    const before = structuredClone(schema);
    expect(validateToolInputValue({ schema, value: valid }).success).toBe(true);
    expect(validateToolInputValue({ schema, value: invalid }).success).toBe(false);
    expect(schema).toEqual(before);
  });

  it('combines standard required keys with legacy flags and preserves schema annotations as data', () => {
    const data = { required: true, properties: { name: { required: false } } };
    const schema = {
      type: 'object',
      required: ['count'],
      properties: {
        count: { type: 'number' },
        name: { type: 'string', required: true },
        literal: { enum: [data], default: data, examples: [data] }
      }
    };
    const before = structuredClone(schema);
    expect(
      validateToolInputValue({ schema, value: { count: 0, name: 'Alice', literal: data } }).success
    ).toBe(true);
    expect(validateToolInputValue({ schema, value: { name: 'Alice' } }).success).toBe(false);
    expect(validateToolInputValue({ schema, value: { count: 0 } }).success).toBe(false);
    expect(schema).toEqual(before);
  });

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
});

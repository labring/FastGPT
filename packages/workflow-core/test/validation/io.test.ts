import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { describe, expect, it } from 'vitest';
import {
  NodeInputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum,
  LoopRunModeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowDiagnostic } from '../../src/domain/diagnostic';
import { createWorkflowDocument } from '../../src/domain/document';
import { validateNodeIO } from '../../src/validation/io';
import { ContextExtractModule } from '@fastgpt/global/core/workflow/template/system/contextExtract';
import { HttpNode468 } from '@fastgpt/global/core/workflow/template/system/http468';
import { VariableUpdateNode } from '@fastgpt/global/core/workflow/template/system/variableUpdate';
import { FormInputNode } from '@fastgpt/global/core/workflow/template/system/interactive/formInput';
import { AgentNode } from '@fastgpt/global/core/workflow/template/system/agent';
import { WorkflowStart } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import { jsonSchema2NodeInput } from '@fastgpt/global/core/app/jsonschema';
import { createEmptyTagFilterValue } from '@fastgpt/global/core/dataset/search/tagFilter/type';
import {
  DatasetCollectionTagTypeEnum,
  DatasetTagFilterLogicEnum,
  DatasetTagFilterValueModeEnum
} from '@fastgpt/global/core/dataset/constants';

type Input = StoreNodeItemType['inputs'][number];

/** 构造真实领域节点，只省略与 IO 规则无关的模板展示配置。 */
const makeNode = (overrides: Partial<StoreNodeItemType> = {}): StoreNodeItemType => ({
  nodeId: 'target',
  name: 'Target',
  flowNodeType: FlowNodeTypeEnum.answerNode,
  inputs: [],
  outputs: [],
  ...overrides
});
const makeInput = (overrides: Partial<Input> = {}): Input => ({
  key: 'parameter',
  label: 'Parameter',
  renderTypeList: [FlowNodeInputTypeEnum.input],
  valueType: WorkflowIOValueTypeEnum.string,
  required: true,
  ...overrides
});

/** 工具上下文通过实际的 selectedTools 边表达，不用 mock 输入来源判断。 */
const check = (node: StoreNodeItemType, isTool = false) => {
  const source = makeNode({
    nodeId: 'source',
    flowNodeType: isTool ? FlowNodeTypeEnum.toolCall : FlowNodeTypeEnum.workflowStart,
    outputs: [
      {
        id: 'text',
        key: 'text',
        label: 'Text',
        type: FlowNodeOutputTypeEnum.static,
        valueType: WorkflowIOValueTypeEnum.string
      }
    ]
  });
  const document = createWorkflowDocument({
    nodes: [source, node],
    executionEdges: [
      {
        source: isTool
          ? { kind: 'selectedTools', nodeId: 'source' }
          : { kind: 'next', nodeId: 'source' },
        target: isTool
          ? { kind: 'selectedTools', nodeId: node.nodeId }
          : { kind: 'target', nodeId: node.nodeId }
      }
    ]
  });
  const diagnostics: WorkflowDiagnostic[] = [];
  validateNodeIO({ document, node, diagnostics });
  return diagnostics;
};

describe('validateNodeIO', () => {
  it.each([
    { value: createEmptyTagFilterValue() },
    { defaultValue: createEmptyTagFilterValue() },
    {
      value: {
        logic: DatasetTagFilterLogicEnum.AND,
        conditions: [
          { tag: 'price', tagType: DatasetCollectionTagTypeEnum.number, op: '$gte', value: 10 }
        ]
      },
      customJsonSchema: { type: 'string', pattern: '"tags"' }
    },
    {
      value: {
        logic: DatasetTagFilterLogicEnum.OR,
        conditions: [
          {
            tag: 'price',
            op: '$gte',
            valueMode: DatasetTagFilterValueModeEnum.reference,
            value: [VARIABLE_NODE_ID, 'price']
          }
        ]
      }
    },
    { value: '{"tags":{"$and":["legacy"]}}' }
  ])('checks tag-filter storage values using the runtime string contract: %j', (values) => {
    const node = makeNode({
      flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
      inputs: [
        makeInput({
          key: NodeInputKeyEnum.collectionFilterMatch,
          renderTypeList: [FlowNodeInputTypeEnum.datasetTagFilter, FlowNodeInputTypeEnum.reference],
          required: false,
          ...values
        })
      ]
    });
    const before = structuredClone(node);
    expect(check(node)).toEqual([]);
    expect(node).toEqual(before);
  });

  it.each([
    { value: { logic: 'invalid', conditions: [] } },
    { value: { logic: DatasetTagFilterLogicEnum.AND, conditions: 'invalid' } },
    { value: createEmptyTagFilterValue(), selectedType: FlowNodeInputTypeEnum.textarea }
  ])('retains type checks outside valid tag-filter storage: %j', (values) => {
    const node = makeNode({
      inputs: [
        makeInput({
          renderTypeList: [FlowNodeInputTypeEnum.datasetTagFilter, FlowNodeInputTypeEnum.textarea],
          ...values
        })
      ]
    });
    expect(check(node).map((item) => item.code)).toEqual([
      WorkflowDiagnosticCodeEnum.inputValueTypeInvalid
    ]);
  });

  it('treats empty tag-filter rows as missing when the input is required', () => {
    const node = makeNode({
      flowNodeType: FlowNodeTypeEnum.agent,
      inputs: [
        makeInput({
          key: NodeInputKeyEnum.collectionFilterMatch,
          renderTypeList: [FlowNodeInputTypeEnum.datasetTagFilter],
          value: createEmptyTagFilterValue()
        })
      ]
    });
    expect(check(node).map((item) => item.code)).toEqual([
      WorkflowDiagnosticCodeEnum.requiredInputMissing
    ]);
    node.inputs[0].required = false;
    expect(check(node)).toEqual([]);
  });

  it.each([
    {
      schema: { type: 'object', required: true, properties: { name: { type: 'string' } } },
      value: { name: 'Alice' }
    },
    {
      schema: {
        type: 'object',
        patternProperties: { '^value_': { type: 'number' } },
        additionalProperties: false
      },
      value: { value_count: 1 }
    },
    {
      schema: {
        oneOf: [
          false,
          { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
        ]
      },
      value: { name: 'Alice' }
    }
  ])(
    'accepts tool inputs projected from supported legacy and pattern-property schemas: $schema',
    ({ schema, value }) => {
      const inputs = jsonSchema2NodeInput({
        schemaType: 'http',
        jsonSchema: { type: 'object', properties: { parameter: schema } }
      }).map((input) => ({
        ...input,
        selectedType: FlowNodeInputTypeEnum.JSONEditor,
        value: JSON.stringify(value)
      }));
      const node = makeNode({ flowNodeType: FlowNodeTypeEnum.tool, inputs });
      expect(check(node, true)).toEqual([]);
    }
  );

  it.each([
    {
      template: ContextExtractModule,
      key: NodeInputKeyEnum.extractKeys,
      value: [{ key: 'name', desc: 'Name', required: true }]
    },
    {
      template: ContextExtractModule,
      key: NodeInputKeyEnum.extractKeys,
      value: [
        {
          key: 'status',
          valueType: WorkflowIOValueTypeEnum.string,
          desc: 'Status',
          required: true,
          defaultValue: 'open',
          enum: 'open\nclosed'
        }
      ]
    },
    ...[
      NodeInputKeyEnum.httpHeaders,
      NodeInputKeyEnum.httpParams,
      NodeInputKeyEnum.httpFormBody
    ].flatMap((key) => [
      { template: HttpNode468, key, value: [{ key: 'name', value: 'Alice', type: 'string' }] },
      { template: HttpNode468, key, value: [{ key: 'name', value: 'Alice' }] }
    ]),
    ...[true, false, 0, { count: 1 }, ['item']].map((value) => ({
      template: VariableUpdateNode,
      key: NodeInputKeyEnum.updateList,
      value: [
        {
          variable: [VARIABLE_NODE_ID, 'target'],
          renderType: FlowNodeInputTypeEnum.input,
          value: ['', value]
        }
      ]
    })),
    {
      template: FormInputNode,
      key: NodeInputKeyEnum.userInputForms,
      // 未填写的当前值可能是 undefined，经过 JSON 持久化后不再包含 value。
      value: [
        {
          type: FlowNodeInputTypeEnum.input,
          key: 'name',
          label: 'Name',
          valueType: WorkflowIOValueTypeEnum.string,
          required: false,
          defaultValue: 'Alice'
        }
      ]
    }
  ])(
    'accepts persisted $template.flowNodeType / $key values in ordinary and tool contexts',
    ({ template, key, value }) => {
      const node = makeNode({
        flowNodeType: template.flowNodeType,
        inputs: [{ ...template.inputs.find((input) => input.key === key)!, value }]
      });
      const before = structuredClone(node);
      expect(check(node)).toEqual([]);
      expect(check(node, true)).toEqual([]);
      expect(node).toEqual(before);
    }
  );

  it.each([
    {
      key: NodeInputKeyEnum.selectedTools,
      value: [{ id: 'workflow-tool', version: '', config: {} }]
    },
    {
      key: NodeInputKeyEnum.selectedTools,
      value: [
        { id: 'systemTool-search', inputs: [{ key: 'query', mode: 'agentGenerated' }], config: {} }
      ]
    },
    { key: NodeInputKeyEnum.skills, value: [{ skillId: 'skill-id' }] },
    { key: NodeInputKeyEnum.datasetSelectList, value: [{ datasetId: 'dataset-id' }] }
  ])(
    'accepts sparse Agent resource snapshots without selector metadata: $key',
    ({ key, value }) => {
      const node = makeNode({
        flowNodeType: AgentNode.flowNodeType,
        inputs: [{ ...AgentNode.inputs.find((input) => input.key === key)!, value }]
      });
      expect(check(node)).toEqual([]);
    }
  );

  it.each([
    {
      template: ContextExtractModule,
      key: NodeInputKeyEnum.extractKeys,
      value: [{ desc: 'Missing key' }]
    },
    {
      template: ContextExtractModule,
      key: NodeInputKeyEnum.extractKeys,
      value: [{ key: 'status', enum: ['open'] }]
    },
    {
      template: HttpNode468,
      key: NodeInputKeyEnum.httpHeaders,
      value: [{ key: 'name', type: 'string' }]
    },
    {
      template: VariableUpdateNode,
      key: NodeInputKeyEnum.updateList,
      value: [{ renderType: FlowNodeInputTypeEnum.input, value: [true, false] }]
    }
  ])(
    'still rejects malformed persisted $template.flowNodeType / $key values',
    ({ template, key, value }) => {
      const node = makeNode({
        flowNodeType: template.flowNodeType,
        inputs: [{ ...template.inputs.find((input) => input.key === key)!, value }]
      });
      expect(check(node)).toEqual([
        expect.objectContaining({
          code: WorkflowDiagnosticCodeEnum.inputValueSchemaInvalid,
          inputKey: key
        })
      ]);
    }
  );

  it.each([
    { datasetId: 'dataset-id' },
    { datasetId: 'dataset-id', name: 'Stored dataset', vectorModel: { modelId: 'embedding-id' } },
    { datasetId: 'dataset-id', avatar: '', vectorModel: { model: 'legacy-embedding-model' } }
  ])('accepts stored dataset references without complete display metadata: %j', (dataset) => {
    const node = makeNode({
      flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
      inputs: [
        makeInput({
          key: NodeInputKeyEnum.datasetSelectList,
          renderTypeList: [FlowNodeInputTypeEnum.selectDataset],
          valueType: WorkflowIOValueTypeEnum.selectDataset,
          value: [dataset]
        })
      ]
    });
    expect(check(node)).toEqual([]);
  });

  it.each([{ name: 'Missing ID' }, { datasetId: 123 }])(
    'rejects malformed stored dataset references: %j',
    (dataset) => {
      const node = makeNode({
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [
          makeInput({
            key: NodeInputKeyEnum.datasetSelectList,
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset],
            valueType: WorkflowIOValueTypeEnum.selectDataset,
            value: [dataset]
          })
        ]
      });
      expect(check(node)).toEqual([
        expect.objectContaining({
          code: WorkflowDiagnosticCodeEnum.inputValueSchemaInvalid,
          inputKey: NodeInputKeyEnum.datasetSelectList
        })
      ]);
    }
  );

  it.each([LoopRunModeEnum.array, LoopRunModeEnum.conditional])(
    'requires the loop array only when its mode consumes it: %s',
    (mode) => {
      const node = makeNode({
        flowNodeType: FlowNodeTypeEnum.loopRun,
        inputs: [
          makeInput({
            key: NodeInputKeyEnum.loopRunMode,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            value: mode
          }),
          makeInput({
            key: NodeInputKeyEnum.loopRunInputArray,
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.arrayAny,
            value: []
          })
        ]
      });
      expect(check(node).map((item) => item.code)).toEqual(
        mode === LoopRunModeEnum.array ? [WorkflowDiagnosticCodeEnum.requiredInputMissing] : []
      );
      if (mode === LoopRunModeEnum.conditional) {
        node.inputs[1].value = ['deleted'];
        expect(check(node)).toEqual([]);
      }
    }
  );
  it.each([
    { value: undefined, defaultValue: 'fallback', valueType: WorkflowIOValueTypeEnum.string },
    { value: null, defaultValue: 'fallback', valueType: WorkflowIOValueTypeEnum.string },
    { value: 0, defaultValue: 1, valueType: WorkflowIOValueTypeEnum.number },
    { value: false, defaultValue: true, valueType: WorkflowIOValueTypeEnum.boolean }
  ])(
    'uses the Web/runtime effective value without changing explicit falsy values: $value',
    (config) => {
      expect(check(makeNode({ inputs: [makeInput(config)] }))).toEqual([]);
    }
  );

  it.each(['', []])('does not replace explicitly empty values with a default: %j', (value) => {
    const result = check(makeNode({ inputs: [makeInput({ value, defaultValue: 'fallback' })] }));
    expect(result.map((item) => item.code)).toContain(
      WorkflowDiagnosticCodeEnum.requiredInputMissing
    );
  });

  it.each([
    { renderTypeList: [FlowNodeInputTypeEnum.hidden] },
    { renderTypeList: [FlowNodeInputTypeEnum.off] },
    { valueType: WorkflowIOValueTypeEnum.boolean },
    { valueType: undefined }
  ])('does not require inputs that Web excludes from the generic required rule: %j', (config) => {
    expect(check(makeNode({ inputs: [makeInput(config)] }))).toEqual([]);
  });

  it.each([FlowNodeTypeEnum.workflowStart, FlowNodeTypeEnum.pluginInput, FlowNodeTypeEnum.comment])(
    'does not require runtime/editor inputs on %s',
    (flowNodeType) => {
      expect(check(makeNode({ flowNodeType, inputs: [makeInput()] }))).toEqual([]);
    }
  );

  it.each([
    {},
    { value: ['', ''] },
    { value: ['deleted', 'userChatInput'] },
    { value: ['target', 'userChatInput'] },
    { value: '历史调试问题' },
    { defaultValue: ['deleted', 'userChatInput'] }
  ])('ignores stored runtime question values on workflowStart: %j', (config) => {
    const node = makeNode({
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      outputs: WorkflowStart.outputs,
      inputs: [
        {
          ...WorkflowStart.inputs[0],
          renderTypeList: [
            FlowNodeInputTypeEnum.agentGenerated,
            FlowNodeInputTypeEnum.reference,
            FlowNodeInputTypeEnum.textarea
          ],
          selectedType: FlowNodeInputTypeEnum.reference,
          ...config
        }
      ]
    });
    const before = structuredClone(node);

    expect(check(node)).toEqual([]);
    expect(node).toEqual(before);
  });

  it('keeps IO uniqueness checks on workflowStart runtime inputs and outputs', () => {
    const input = {
      ...WorkflowStart.inputs[0],
      selectedType: FlowNodeInputTypeEnum.reference,
      value: ['', '']
    };
    const node = makeNode({
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      inputs: [input, { ...input }],
      outputs: [...WorkflowStart.outputs, ...WorkflowStart.outputs]
    });

    expect(check(node).map((item) => item.code)).toEqual([
      WorkflowDiagnosticCodeEnum.inputKeyDuplicated,
      WorkflowDiagnosticCodeEnum.outputKeyDuplicated
    ]);
  });

  it.each([FlowNodeTypeEnum.chatNode, FlowNodeTypeEnum.pluginInput])(
    'still validates configured user question references on %s',
    (flowNodeType) => {
      const node = makeNode({
        flowNodeType,
        inputs: [
          {
            ...WorkflowStart.inputs[0],
            selectedType: FlowNodeInputTypeEnum.reference,
            value: ['deleted', 'userChatInput']
          }
        ]
      });

      expect(check(node).map((item) => item.code)).toEqual([
        WorkflowDiagnosticCodeEnum.referenceOutputNotFound
      ]);
    }
  );

  it('retains type and schema validation on configured values, including defaults and hidden fields', () => {
    const node = makeNode({
      inputs: [
        makeInput({
          key: 'number',
          valueType: WorkflowIOValueTypeEnum.number,
          defaultValue: 'wrong'
        }),
        makeInput({ key: 'hidden', renderTypeList: [FlowNodeInputTypeEnum.hidden], value: 1 }),
        makeInput({
          key: 'schema',
          defaultValue: 'short',
          customJsonSchema: { type: 'string', minLength: 10 }
        }),
        makeInput({ key: 'object', valueType: WorkflowIOValueTypeEnum.object, value: { value: 1 } })
      ]
    });
    expect(check(node).map((item) => [item.inputKey, item.code])).toEqual([
      ['number', WorkflowDiagnosticCodeEnum.inputValueTypeInvalid],
      ['hidden', WorkflowDiagnosticCodeEnum.inputValueTypeInvalid],
      ['schema', WorkflowDiagnosticCodeEnum.inputValueSchemaInvalid]
    ]);
  });

  it.each([
    {
      value: '{count: 2,}',
      valueType: WorkflowIOValueTypeEnum.object,
      customJsonSchema: { type: 'object', properties: { count: { type: 'number' } } }
    },
    {
      value: '[1, 2]',
      valueType: WorkflowIOValueTypeEnum.arrayNumber,
      customJsonSchema: { type: 'array', items: { type: 'number' } }
    },
    {
      value: "['a', 'b',]",
      valueType: WorkflowIOValueTypeEnum.arrayString,
      customJsonSchema: { type: 'array', items: { type: 'string' } }
    }
  ])('checks JSON editor text using the runtime value without rewriting it: $value', (config) => {
    const node = makeNode({
      inputs: [makeInput({ ...config, renderTypeList: [FlowNodeInputTypeEnum.JSONEditor] })]
    });
    const before = structuredClone(node);
    expect(check(node)).toEqual([]);
    expect(node).toEqual(before);
  });

  it('defers JSON editor expressions until their runtime values are known', () => {
    const node = makeNode({
      inputs: [
        makeInput({
          renderTypeList: [FlowNodeInputTypeEnum.JSONEditor],
          valueType: WorkflowIOValueTypeEnum.object,
          value: '{"count": {{$source.text$}}}',
          customJsonSchema: { type: 'object', properties: { count: { type: 'number' } } }
        })
      ]
    });
    expect(check(node)).toEqual([]);
  });

  it('still rejects incompatible runtime types and schema violations in JSON editor values', () => {
    const node = makeNode({
      inputs: [
        makeInput({
          key: 'wrongType',
          renderTypeList: [FlowNodeInputTypeEnum.JSONEditor],
          valueType: WorkflowIOValueTypeEnum.arrayString,
          value: '[1]'
        }),
        makeInput({
          key: 'wrongSchema',
          renderTypeList: [FlowNodeInputTypeEnum.JSONEditor],
          valueType: WorkflowIOValueTypeEnum.object,
          value: '{"count": "two"}',
          customJsonSchema: { type: 'object', properties: { count: { type: 'number' } } }
        })
      ]
    });
    expect(check(node).map((item) => [item.inputKey, item.code])).toEqual([
      ['wrongType', WorkflowDiagnosticCodeEnum.inputValueTypeInvalid],
      ['wrongSchema', WorkflowDiagnosticCodeEnum.inputValueSchemaInvalid]
    ]);
  });

  it.each([
    { value: 'legacy-plaintext' },
    { value: { value: 'plaintext', secret: '' } },
    { value: { ref: ['source', 'text'] } },
    { value: { value: '', secret: 'encrypted-placeholder' } },
    { defaultValue: { secret: 'encrypted-default' } }
  ])('accepts configured password storage values in ordinary and tool contexts: %j', (config) => {
    const node = makeNode({
      inputs: [
        makeInput({
          ...config,
          renderTypeList: [FlowNodeInputTypeEnum.password],
          customJsonSchema: { type: 'string', minLength: 5 }
        })
      ]
    });
    expect(check(node)).toEqual([]);
    expect(check(node, true)).toEqual([]);
  });

  it('distinguishes empty required secrets from malformed storage values without exposing them', () => {
    const node = makeNode({
      inputs: [
        makeInput({
          key: 'empty',
          renderTypeList: [FlowNodeInputTypeEnum.password],
          value: { value: '', secret: '' }
        }),
        makeInput({
          key: 'optional',
          renderTypeList: [FlowNodeInputTypeEnum.password],
          required: false,
          value: { value: '', secret: '' }
        }),
        makeInput({
          key: 'malformed',
          renderTypeList: [FlowNodeInputTypeEnum.password],
          value: { value: 123, secret: 'invalid-with-private-data' }
        }),
        makeInput({
          key: 'malformedEmpty',
          renderTypeList: [FlowNodeInputTypeEnum.password],
          required: false,
          value: []
        }),
        makeInput({
          key: 'malformedReference',
          renderTypeList: [FlowNodeInputTypeEnum.password],
          required: false,
          value: { ref: ['source'] }
        })
      ]
    });
    const diagnostics = check(node);
    expect(diagnostics.map((item) => [item.inputKey, item.code])).toEqual([
      ['empty', WorkflowDiagnosticCodeEnum.requiredInputMissing],
      ['malformed', WorkflowDiagnosticCodeEnum.inputValueSchemaInvalid],
      ['malformedEmpty', WorkflowDiagnosticCodeEnum.inputValueSchemaInvalid],
      ['malformedReference', WorkflowDiagnosticCodeEnum.inputValueSchemaInvalid]
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('invalid-with-private-data');
  });

  it.each([undefined, ['', ''], []])(
    'reports unselected required references as missing: %j',
    (value) => {
      const result = check(
        makeNode({
          inputs: [makeInput({ renderTypeList: [FlowNodeInputTypeEnum.reference], value })]
        })
      );
      expect(result.map((item) => item.code)).toEqual([
        WorkflowDiagnosticCodeEnum.requiredInputMissing
      ]);
    }
  );

  it('checks default references and preserves stricter reference diagnostics', () => {
    const node = makeNode({
      inputs: [
        makeInput({
          key: 'default',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          defaultValue: ['source', 'text']
        }),
        makeInput({
          key: 'malformed',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          required: false,
          value: ['source']
        }),
        makeInput({
          key: 'deleted',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          value: ['source', 'deleted']
        }),
        makeInput({
          key: 'global',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          value: [VARIABLE_NODE_ID, 'deleted']
        }),
        makeInput({
          key: 'type',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          value: ['source', 'text'],
          valueType: WorkflowIOValueTypeEnum.number
        }),
        makeInput({
          key: 'array',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          value: [['source', 'text']],
          valueType: WorkflowIOValueTypeEnum.arrayString
        })
      ]
    });
    const diagnostics = check(node);
    expect(diagnostics.some((item) => item.inputKey === 'default')).toBe(false);
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputKey: 'malformed',
          code: WorkflowDiagnosticCodeEnum.referenceFormatInvalid
        }),
        expect.objectContaining({
          inputKey: 'deleted',
          code: WorkflowDiagnosticCodeEnum.referenceOutputNotFound
        }),
        expect.objectContaining({
          inputKey: 'global',
          code: WorkflowDiagnosticCodeEnum.referenceOutputNotFound
        }),
        expect.objectContaining({
          inputKey: 'type',
          code: WorkflowDiagnosticCodeEnum.referenceTypeMismatch
        })
      ])
    );
  });

  it.each([
    { defaultToAgentGenerated: true },
    { renderTypeList: [FlowNodeInputTypeEnum.reference] },
    {
      selectedType: FlowNodeInputTypeEnum.agentGenerated,
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
      value: ['deleted', 'output']
    }
  ])(
    'does not prefill Agent-generated tool parameters or validate stale manual values: %j',
    (config) => {
      const node = makeNode({
        flowNodeType: FlowNodeTypeEnum.pluginModule,
        inputs: [makeInput(config)]
      });
      const before = structuredClone(node);
      expect(check(node, true)).toEqual([]);
      expect(node).toEqual(before);
    }
  );

  it('does not allow default generation preferences to bypass manual or forbidden inputs', () => {
    const node = makeNode({
      flowNodeType: FlowNodeTypeEnum.pluginModule,
      inputs: [
        makeInput({
          key: 'manual',
          defaultToAgentGenerated: true,
          selectedType: FlowNodeInputTypeEnum.input
        }),
        makeInput({ key: 'forbidden', defaultToAgentGenerated: true, canAgentGenerated: false })
      ]
    });
    expect(check(node, true).map((item) => item.inputKey)).toEqual(['manual', 'forbidden']);
    expect(
      check(makeNode({ inputs: [makeInput({ defaultToAgentGenerated: true })] })).map(
        (item) => item.code
      )
    ).toEqual([WorkflowDiagnosticCodeEnum.requiredInputMissing]);
  });

  it.each([false, true])('leaves tool activation to run/publish checks (mounted: %s)', (isTool) => {
    const node = makeNode({
      flowNodeType: FlowNodeTypeEnum.pluginModule,
      inputs: [
        makeInput({
          key: NodeInputKeyEnum.systemInputConfig,
          required: false,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          valueType: WorkflowIOValueTypeEnum.any
        })
      ]
    });
    expect(check(node, isTool)).toEqual([]);
  });

  it('checks editable code parameter names and references without a duplicate generic required issue', () => {
    const node = makeNode({
      flowNodeType: FlowNodeTypeEnum.code,
      inputs: [
        makeInput({
          key: 'missing',
          canEdit: true,
          value: ['', ''],
          renderTypeList: [FlowNodeInputTypeEnum.reference]
        }),
        makeInput({
          key: 'label',
          label: '',
          canEdit: true,
          value: ['source', 'text'],
          renderTypeList: [FlowNodeInputTypeEnum.reference]
        }),
        makeInput({
          key: 'valid',
          canEdit: true,
          value: ['source', 'text'],
          renderTypeList: [FlowNodeInputTypeEnum.reference]
        })
      ]
    });
    expect(check(node).map((item) => [item.inputKey, item.code])).toEqual([
      ['missing', WorkflowDiagnosticCodeEnum.codeInputIncomplete],
      ['label', WorkflowDiagnosticCodeEnum.codeInputIncomplete]
    ]);
  });

  it('preserves unique IO keys and invalid input-mode diagnostics', () => {
    const node = makeNode({
      inputs: [
        makeInput({ value: 'ok' }),
        makeInput({ value: 'ok' }),
        makeInput({ key: 'mode', renderTypeList: [] })
      ],
      outputs: [
        { id: 'one', key: 'duplicate', label: '', type: FlowNodeOutputTypeEnum.static },
        { id: 'two', key: 'duplicate', label: '', type: FlowNodeOutputTypeEnum.static }
      ]
    });
    expect(check(node).map((item) => item.code)).toEqual([
      WorkflowDiagnosticCodeEnum.inputKeyDuplicated,
      WorkflowDiagnosticCodeEnum.inputModeInvalid,
      WorkflowDiagnosticCodeEnum.outputKeyDuplicated
    ]);
  });
});

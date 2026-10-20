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
        mode === LoopRunModeEnum.array ? ['WORKFLOW_REQUIRED_INPUT_MISSING'] : []
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
    expect(result.map((item) => item.code)).toContain('WORKFLOW_REQUIRED_INPUT_MISSING');
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
      ['number', 'WORKFLOW_INPUT_VALUE_TYPE_INVALID'],
      ['hidden', 'WORKFLOW_INPUT_VALUE_TYPE_INVALID'],
      ['schema', 'WORKFLOW_INPUT_VALUE_SCHEMA_INVALID'],
      ['object', 'WORKFLOW_TEMPLATE_PARAMETER_SCHEMA_MISSING']
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
      ['wrongType', 'WORKFLOW_INPUT_VALUE_TYPE_INVALID'],
      ['wrongSchema', 'WORKFLOW_INPUT_VALUE_SCHEMA_INVALID']
    ]);
  });

  it.each([
    { value: 'legacy-plaintext' },
    { value: { value: 'plaintext', secret: '' } },
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
        })
      ]
    });
    const diagnostics = check(node);
    expect(diagnostics.map((item) => [item.inputKey, item.code])).toEqual([
      ['empty', 'WORKFLOW_REQUIRED_INPUT_MISSING'],
      ['malformed', 'WORKFLOW_INPUT_VALUE_SCHEMA_INVALID'],
      ['malformedEmpty', 'WORKFLOW_INPUT_VALUE_SCHEMA_INVALID']
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
      expect(result.map((item) => item.code)).toEqual(['WORKFLOW_REQUIRED_INPUT_MISSING']);
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
          code: 'WORKFLOW_REFERENCE_FORMAT_INVALID'
        }),
        expect.objectContaining({
          inputKey: 'deleted',
          code: 'WORKFLOW_REFERENCE_OUTPUT_NOT_FOUND'
        }),
        expect.objectContaining({
          inputKey: 'global',
          code: 'WORKFLOW_REFERENCE_OUTPUT_NOT_FOUND'
        }),
        expect.objectContaining({ inputKey: 'type', code: 'WORKFLOW_REFERENCE_TYPE_MISMATCH' })
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
    ).toEqual(['WORKFLOW_REQUIRED_INPUT_MISSING']);
  });

  it('requires tool system configuration and accepts its configured default', () => {
    const node = makeNode({
      flowNodeType: FlowNodeTypeEnum.pluginModule,
      inputs: [
        makeInput({
          key: NodeInputKeyEnum.systemInputConfig,
          required: false,
          valueType: WorkflowIOValueTypeEnum.any
        })
      ]
    });
    expect(check(node, true).map((item) => item.code)).toEqual([
      'WORKFLOW_TOOL_INPUT_CONFIGURATION_MISSING'
    ]);
    node.inputs[0].defaultValue = 'configured';
    expect(check(node, true)).toEqual([]);
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
      ['missing', 'WORKFLOW_CODE_INPUT_INCOMPLETE'],
      ['label', 'WORKFLOW_CODE_INPUT_INCOMPLETE']
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
      'WORKFLOW_INPUT_KEY_DUPLICATED',
      'WORKFLOW_INPUT_MODE_INVALID',
      'WORKFLOW_OUTPUT_KEY_DUPLICATED'
    ]);
  });
});

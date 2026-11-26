import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { describe, expect, it } from 'vitest';
import {
  NodeInputKeyEnum,
  VARIABLE_NODE_ID,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { createWorkflowDocument } from '../../src/domain/document';
import { TextEditorNode } from '@fastgpt/global/core/workflow/template/system/textEditor';
import { HttpNode468 } from '@fastgpt/global/core/workflow/template/system/http468';
import {
  getWorkflowInputReferenceDiagnostics,
  resolveWorkflowReferenceDocument
} from '../../src/reference/validation';
import { getAvailableInputReferences } from '../../src/reference/query';
import { createWorkflowReferenceIndex, setInputReference } from '../../src/reference/service';
import { validateWorkflow } from '../../src/validation/index';

/** 最小连通图同时提供稳定 key 和历史 id，用真实引用规则检查两种策略。 */
const makeDocument = (input: Partial<FlowNodeInputItemType> = {}) =>
  createWorkflowDocument({
    nodes: [
      {
        nodeId: 'start',
        name: 'Start',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        inputs: [],
        outputs: [
          {
            id: 'text-id',
            key: 'text',
            label: 'Text',
            type: FlowNodeOutputTypeEnum.static,
            valueType: WorkflowIOValueTypeEnum.string
          },
          {
            id: 'count',
            key: 'count',
            type: FlowNodeOutputTypeEnum.static,
            valueType: WorkflowIOValueTypeEnum.number
          },
          {
            id: 'unavailable',
            key: 'unavailable',
            type: FlowNodeOutputTypeEnum.static,
            invalid: true
          },
          {
            id: 'error',
            key: 'error',
            type: FlowNodeOutputTypeEnum.error,
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      },
      {
        nodeId: 'target',
        name: 'Target',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        outputs: [],
        inputs: [
          {
            key: 'parameter',
            label: 'Parameter',
            valueType: WorkflowIOValueTypeEnum.string,
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            ...input
          }
        ]
      }
    ],
    executionEdges: [
      { source: { kind: 'next', nodeId: 'start' }, target: { kind: 'target', nodeId: 'target' } }
    ]
  });

describe('getWorkflowInputReferenceDiagnostics', () => {
  it('ignores removed dynamic source handles in the reference index', () => {
    const document = makeDocument();
    document.nodes[1] = {
      ...document.nodes[1],
      flowNodeType: FlowNodeTypeEnum.userSelect,
      inputs: [
        {
          key: NodeInputKeyEnum.userSelectOptions,
          label: 'Options',
          renderTypeList: [],
          value: [{ key: 'removed' }]
        }
      ]
    };
    document.executionEdges = [
      {
        source: { kind: 'branch', nodeId: 'target', branchKey: 'removed' },
        target: { kind: 'target', nodeId: 'start' }
      }
    ];

    expect(
      createWorkflowReferenceIndex(document).incomingEdgesByNodeId.get('start')
    ).toContainEqual(expect.objectContaining({ source: 'target' }));

    document.nodes[1].inputs[0] = { ...document.nodes[1].inputs[0], value: [] };
    expect(
      createWorkflowReferenceIndex(document).incomingEdgesByNodeId.get('start')
    ).toBeUndefined();
  });

  it('only accepts string references for a selected reference input', () => {
    const document = makeDocument();
    document.nodes[1].flowNodeType = FlowNodeTypeEnum.textEditor;
    document.nodes[1].inputs[0] = {
      ...TextEditorNode.inputs[0],
      key: NodeInputKeyEnum.textareaInput,
      value: [VARIABLE_NODE_ID, 'count'],
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference
    };
    document.chatConfig.variables = [
      {
        key: 'count',
        label: 'Count',
        description: '',
        type: VariableInputEnum.numberInput,
        valueType: WorkflowIOValueTypeEnum.number
      }
    ];

    expect(
      getWorkflowInputReferenceDiagnostics({
        document,
        nodeId: 'target',
        input: document.nodes[1].inputs[0]
      })
    ).toEqual([
      expect.objectContaining({ code: WorkflowDiagnosticCodeEnum.referenceTypeMismatch })
    ]);
  });

  it.each([
    { value: ['start'], code: WorkflowDiagnosticCodeEnum.referenceFormatInvalid },
    { value: ['deleted', 'text'], code: WorkflowDiagnosticCodeEnum.referenceOutputNotFound },
    { value: ['start', 'deleted'], code: WorkflowDiagnosticCodeEnum.referenceOutputNotFound },
    { value: ['start', 'count'], code: WorkflowDiagnosticCodeEnum.referenceTypeMismatch },
    {
      value: [VARIABLE_NODE_ID, 'deleted'],
      code: WorkflowDiagnosticCodeEnum.referenceOutputNotFound
    },
    { value: ['start', 'unavailable'], code: WorkflowDiagnosticCodeEnum.referenceOutputNotFound },
    { value: ['start', 'error'], code: WorkflowDiagnosticCodeEnum.referenceOutputNotFound }
  ])('reports $code for $value', ({ value, code }) => {
    const document = makeDocument({ value });
    expect(
      getWorkflowInputReferenceDiagnostics({
        document,
        nodeId: 'target',
        input: document.nodes[1].inputs[0]
      }).map((issue) => issue.code)
    ).toEqual([code]);
  });

  it('checks upstream scope and permits error outputs only with catch enabled', () => {
    const document = makeDocument({ value: ['start', 'text'] });
    const input = document.nodes[1].inputs[0];
    document.executionEdges = [];
    expect(
      getWorkflowInputReferenceDiagnostics({ document, nodeId: 'target', input })
    ).toContainEqual(
      expect.objectContaining({ code: WorkflowDiagnosticCodeEnum.referenceSourceNotUpstream })
    );
    document.executionEdges = [
      { source: { kind: 'next', nodeId: 'start' }, target: { kind: 'target', nodeId: 'target' } }
    ];
    document.nodes[0].catchError = true;
    input.value = ['start', 'error'];
    expect(
      getWorkflowInputReferenceDiagnostics({ document, nodeId: 'target', input }).map(
        (item) => item.code
      )
    ).toEqual([WorkflowDiagnosticCodeEnum.referenceSourceNotUpstream]);
    expect(
      getAvailableInputReferences({ document, nodeId: 'target', inputKey: input.key })
    ).not.toContainEqual(expect.objectContaining({ ref: { nodeId: 'start', outputKey: 'error' } }));

    document.executionEdges = [
      { source: { kind: 'catch', nodeId: 'start' }, target: { kind: 'target', nodeId: 'target' } }
    ];
    expect(getWorkflowInputReferenceDiagnostics({ document, nodeId: 'target', input })).toEqual([]);
    expect(
      getAvailableInputReferences({ document, nodeId: 'target', inputKey: input.key })
    ).toContainEqual(expect.objectContaining({ ref: { nodeId: 'start', outputKey: 'error' } }));

    input.value = ['start', 'text'];
    expect(getWorkflowInputReferenceDiagnostics({ document, nodeId: 'target', input })).toEqual([]);

    document.executionEdges = [
      { source: { kind: 'catch', nodeId: 'start' }, target: { kind: 'target', nodeId: 'middle' } },
      { source: { kind: 'next', nodeId: 'middle' }, target: { kind: 'target', nodeId: 'target' } }
    ];
    document.nodes.splice(1, 0, {
      nodeId: 'middle',
      name: 'Middle',
      flowNodeType: FlowNodeTypeEnum.code,
      inputs: [],
      outputs: []
    });
    input.value = ['start', 'error'];
    expect(getWorkflowInputReferenceDiagnostics({ document, nodeId: 'target', input })).toEqual([]);

    document.executionEdges = [
      { source: { kind: 'next', nodeId: 'start' }, target: { kind: 'target', nodeId: 'middle' } },
      { source: { kind: 'next', nodeId: 'middle' }, target: { kind: 'target', nodeId: 'target' } }
    ];
    expect(
      getWorkflowInputReferenceDiagnostics({ document, nodeId: 'target', input }).map(
        (item) => item.code
      )
    ).toEqual([WorkflowDiagnosticCodeEnum.referenceSourceNotUpstream]);
  });

  it('offers and validates a direct child’s caught error for a LoopRun output', () => {
    const document = makeDocument({ canEdit: true, value: ['start', 'error'] });
    const [child, loop] = document.nodes;
    child.flowNodeType = FlowNodeTypeEnum.code;
    child.parentNodeId = loop.nodeId;
    child.catchError = true;
    loop.flowNodeType = FlowNodeTypeEnum.loopRun;
    const input = loop.inputs[0];
    document.executionEdges = [];
    const query = { document, nodeId: loop.nodeId, inputKey: input.key };
    const ref = { nodeId: child.nodeId, outputKey: 'error' };
    expect(getAvailableInputReferences(query)).toContainEqual(expect.objectContaining({ ref }));
    expect(getWorkflowInputReferenceDiagnostics({ document, nodeId: loop.nodeId, input })).toEqual(
      []
    );
    setInputReference({ ...query, ref });
    expect(input.value).toEqual([child.nodeId, 'error']);

    child.catchError = false;
    expect(getAvailableInputReferences(query)).not.toContainEqual(expect.objectContaining({ ref }));
    expect(
      getWorkflowInputReferenceDiagnostics({ document, nodeId: loop.nodeId, input })
    ).toContainEqual(
      expect.objectContaining({ code: WorkflowDiagnosticCodeEnum.referenceOutputNotFound })
    );
  });

  it.each(['selected tool', 'container alias'])(
    'inherits ordinary sources through a %s and requires a real catch edge for errors',
    (path) => {
      const document = makeDocument({ value: ['start', 'error'] });
      const [source, target] = document.nodes;
      const [input] = target.inputs;
      const mountedTool = path === 'selected tool';
      source.catchError = true;
      target.parentNodeId = mountedTool ? undefined : 'relay';
      document.nodes.push({
        nodeId: 'relay',
        name: 'Relay',
        flowNodeType: mountedTool ? FlowNodeTypeEnum.toolCall : FlowNodeTypeEnum.parallelRun,
        inputs: mountedTool
          ? []
          : [{ ...input, key: 'alias', value: undefined, defaultValue: ['start', 'text'] }],
        outputs: []
      });
      document.executionEdges = mountedTool
        ? [
            {
              source: { kind: 'catch', nodeId: 'start' },
              target: { kind: 'target', nodeId: 'relay' }
            },
            {
              source: { kind: 'selectedTools', nodeId: 'relay' },
              target: { kind: 'selectedTools', nodeId: 'target' }
            }
          ]
        : [];
      const options = getAvailableInputReferences({
        document,
        nodeId: target.nodeId,
        inputKey: input.key
      });

      const errors = getWorkflowInputReferenceDiagnostics({
        document,
        nodeId: target.nodeId,
        input
      });
      const errorRef = expect.objectContaining({ ref: { nodeId: 'start', outputKey: 'error' } });
      if (mountedTool) {
        expect(errors).toEqual([]);
        expect(options).toContainEqual(errorRef);
        document.executionEdges[0].source = { kind: 'next', nodeId: 'start' };
        expect(
          getWorkflowInputReferenceDiagnostics({ document, nodeId: target.nodeId, input }).map(
            ({ code }) => code
          )
        ).toEqual([WorkflowDiagnosticCodeEnum.referenceSourceNotUpstream]);
      } else {
        expect(errors.map(({ code }) => code)).toEqual([
          WorkflowDiagnosticCodeEnum.referenceSourceNotUpstream
        ]);
        expect(options).not.toContainEqual(errorRef);
      }
      input.value = ['start', 'text'];
      expect(
        getWorkflowInputReferenceDiagnostics({ document, nodeId: target.nodeId, input })
      ).toEqual([]);
      expect(options).toContainEqual(
        expect.objectContaining({ ref: { nodeId: 'start', outputKey: 'text' } })
      );
    }
  );
});

describe('Secret reference validation', () => {
  it.each([
    {
      flowNodeType: FlowNodeTypeEnum.httpRequest468,
      key: NodeInputKeyEnum.headerSecret,
      value: { Authorization: { ref: ['start', 'text'] } }
    },
    {
      flowNodeType: FlowNodeTypeEnum.tool,
      key: NodeInputKeyEnum.systemInputConfig,
      inputList: [
        { key: 'token', label: 'Token', inputType: 'secret' as const },
        { key: 'count', label: 'Count', inputType: 'numberInput' as const }
      ],
      value: {
        type: 'manual',
        value: {
          token: { ref: ['start', 'text'] },
          count: { ref: ['start', 'count'] }
        }
      }
    }
  ])('accepts $flowNodeType secret references', (fixture) => {
    const document = makeDocument({
      key: fixture.key,
      label: 'Secret',
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.object,
      inputList: fixture.inputList,
      value: fixture.value
    });
    const target = document.nodes[1];
    target.flowNodeType = fixture.flowNodeType;
    if (fixture.flowNodeType === FlowNodeTypeEnum.httpRequest468) {
      const url = HttpNode468.inputs.find(({ key }) => key === NodeInputKeyEnum.httpReqUrl)!;
      target.inputs.unshift({ ...url, value: 'https://example.com' });
    }

    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([]);
  });

  it('preserves invalid secret references in the validation snapshot', () => {
    const document = makeDocument({
      key: NodeInputKeyEnum.systemInputConfig,
      label: 'Secret',
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.object,
      inputList: [
        { key: 'token', label: 'Token', inputType: 'secret' },
        { key: 'other', label: 'Other', inputType: 'secret' }
      ],
      value: {
        type: 'manual',
        value: { token: { ref: ['deleted', 'text'] }, other: { value: 'keep' } }
      }
    });
    document.nodes[1].flowNodeType = FlowNodeTypeEnum.tool;
    const before = structuredClone(document);
    const resolved = resolveWorkflowReferenceDocument({
      document,
      invalidReferencePolicy: 'asEmpty'
    });

    expect(resolved).toBe(document);
    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toContainEqual(
      expect.objectContaining({
        code: WorkflowDiagnosticCodeEnum.referenceOutputNotFound,
        nodeId: 'target',
        inputKey: NodeInputKeyEnum.systemInputConfig
      })
    );
    expect(document).toEqual(before);
  });
});

describe('resolveWorkflowReferenceDocument', () => {
  it('rejects an omitted policy at both public boundaries instead of silently using asEmpty', () => {
    const document = makeDocument({ value: ['deleted', 'text'] });
    // @ts-expect-error 策略必填，防止类型外调用遗漏后悄悄放宽引用检查。
    expect(() => resolveWorkflowReferenceDocument({ document })).toThrow('invalidReferencePolicy');
    // @ts-expect-error 检查器同样要求显式声明引用策略。
    expect(() => validateWorkflow(document, {})).toThrow('invalidReferencePolicy');
  });

  it('rechecks child scope when a parent reference is removed without changing the original graph', () => {
    const document = makeDocument({ value: ['start', 'text'] });
    document.nodes[1].parentNodeId = 'parent';
    document.nodes.push({
      nodeId: 'parent',
      name: 'Parent',
      flowNodeType: FlowNodeTypeEnum.loopRun,
      inputs: [
        {
          key: 'external',
          label: 'External',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.string,
          value: ['start', 'deleted']
        }
      ],
      outputs: []
    });
    document.executionEdges = [];
    const before = structuredClone(document);
    const resolved = resolveWorkflowReferenceDocument({
      document,
      invalidReferencePolicy: 'asEmpty'
    });
    expect(resolved.nodes[1].inputs[0].value).toBeUndefined();
    expect(resolved.nodes[2].inputs[0].value).toBeUndefined();
    expect(
      resolveWorkflowReferenceDocument({ document: resolved, invalidReferencePolicy: 'asEmpty' })
    ).toBe(resolved);
    expect(document).toEqual(before);
  });

  it.each([
    { input: { value: ['deleted', 'text'] }, expected: undefined },
    { input: { defaultValue: ['deleted', 'text'] }, expected: undefined },
    { input: { value: ['deleted', 'text'], defaultValue: ['start', 'text'] }, expected: undefined },
    { input: { value: 'malformed' }, expected: undefined },
    { input: { value: [['deleted', 'text']] }, expected: [] },
    {
      input: { value: [['start', 'text-id'], ['deleted', 'text'], ['broken']] },
      expected: [['start', 'text-id']]
    }
  ])('normalizes only the validation snapshot: $input', ({ input, expected }) => {
    const document = makeDocument(input);
    const before = structuredClone(document);
    expect(resolveWorkflowReferenceDocument({ invalidReferencePolicy: 'error', document })).toBe(
      document
    );
    const resolved = resolveWorkflowReferenceDocument({
      document,
      invalidReferencePolicy: 'asEmpty'
    });
    expect(resolved.nodes[1].inputs[0].value).toEqual(expected);
    expect(resolved.nodes[1].inputs[0].defaultValue).toBeUndefined();
    expect(document).toEqual(before);
    expect(resolved.nodes[0]).toBe(document.nodes[0]);
  });

  it.each([
    { value: undefined },
    { value: [] },
    { value: ['start', 'text'] },
    { defaultValue: ['start', 'text-id'] },
    {
      value: [
        ['start', 'text'],
        ['start', 'text-id']
      ]
    }
  ])('preserves empty and valid references: %j', (input) => {
    const document = makeDocument(input);
    expect(resolveWorkflowReferenceDocument({ document, invalidReferencePolicy: 'asEmpty' })).toBe(
      document
    );
  });
});

describe('validateWorkflow reference policy', () => {
  it('reports a removed legacy dataset filter source in strict mode and clears it for clients', () => {
    const document = makeDocument({
      key: NodeInputKeyEnum.collectionFilterMatch,
      renderTypeList: [FlowNodeInputTypeEnum.hidden, FlowNodeInputTypeEnum.reference],
      defaultValue: ['start', 'deleted']
    });
    document.nodes[1].flowNodeType = FlowNodeTypeEnum.agent;

    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([
      expect.objectContaining({ code: WorkflowDiagnosticCodeEnum.referenceOutputNotFound })
    ]);
    expect(validateWorkflow(document, { invalidReferencePolicy: 'asEmpty' })).toEqual([]);
    expect(document.nodes[1].inputs[0].defaultValue).toEqual(['start', 'deleted']);
  });

  it.each(['error', 'asEmpty'] as const)(
    'leaves invalid inline expressions to the editor under the %s policy',
    (invalidReferencePolicy) => {
      const document = makeDocument({
        selectedType: FlowNodeInputTypeEnum.textarea,
        renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
        required: true,
        value: '{{deletedGlobal}} {{$deletedNode.output$}} {{$start.deletedOutput$}}'
      });
      const before = structuredClone(document);

      expect(resolveWorkflowReferenceDocument({ document, invalidReferencePolicy })).toBe(document);
      expect(validateWorkflow(document, { invalidReferencePolicy })).toEqual([]);
      expect(document).toEqual(before);
    }
  );

  it.each([
    {
      required: false,
      value: ['deleted', 'text'],
      valueType: WorkflowIOValueTypeEnum.string,
      expected: []
    },
    {
      required: true,
      value: ['deleted', 'text'],
      valueType: WorkflowIOValueTypeEnum.string,
      expected: [WorkflowDiagnosticCodeEnum.requiredInputMissing]
    },
    {
      required: true,
      value: [['deleted', 'text']],
      valueType: WorkflowIOValueTypeEnum.arrayString,
      expected: [WorkflowDiagnosticCodeEnum.requiredInputMissing]
    },
    {
      required: true,
      value: [
        ['start', 'text'],
        ['deleted', 'text']
      ],
      valueType: WorkflowIOValueTypeEnum.arrayString,
      expected: []
    }
  ])(
    'keeps AI strict and checks client required values after normalization: %j',
    ({ expected, ...input }) => {
      const document = makeDocument(input);
      const before = structuredClone(document);
      expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toContainEqual(
        expect.objectContaining({ code: WorkflowDiagnosticCodeEnum.referenceOutputNotFound })
      );
      expect(
        validateWorkflow(document, { invalidReferencePolicy: 'asEmpty' }).map((issue) => issue.code)
      ).toEqual(expected);
      expect(document).toEqual(before);
    }
  );
});

describe('node and global reference coverage', () => {
  it.each([
    { name: 'node output key', value: ['start', 'text'], strict: [], client: [] },
    { name: 'node output id', value: ['start', 'text-id'], strict: [], client: [] },
    { name: 'user global', value: [VARIABLE_NODE_ID, 'topic'], strict: [], client: [] },
    {
      name: 'system global overrides user variable type',
      value: [VARIABLE_NODE_ID, 'appId'],
      strict: [],
      client: []
    },
    {
      name: 'deleted optional global',
      value: [VARIABLE_NODE_ID, 'deleted'],
      strict: [WorkflowDiagnosticCodeEnum.referenceOutputNotFound],
      client: []
    },
    {
      name: 'deleted required global',
      value: [VARIABLE_NODE_ID, 'deleted'],
      required: true,
      strict: [WorkflowDiagnosticCodeEnum.referenceOutputNotFound],
      client: [WorkflowDiagnosticCodeEnum.requiredInputMissing]
    },
    {
      name: 'user global reference type mismatch',
      value: [VARIABLE_NODE_ID, 'count'],
      required: true,
      strict: [WorkflowDiagnosticCodeEnum.referenceTypeMismatch],
      client: [WorkflowDiagnosticCodeEnum.requiredInputMissing]
    },
    {
      name: 'system global type mismatch',
      value: [VARIABLE_NODE_ID, 'histories'],
      strict: [WorkflowDiagnosticCodeEnum.referenceTypeMismatch],
      client: []
    },
    {
      name: 'mixed node and global references',
      value: [
        ['start', 'text'],
        [VARIABLE_NODE_ID, 'topic'],
        ['deleted', 'text'],
        [VARIABLE_NODE_ID, 'deleted']
      ],
      valueType: WorkflowIOValueTypeEnum.arrayString,
      required: true,
      strict: [
        WorkflowDiagnosticCodeEnum.referenceOutputNotFound,
        WorkflowDiagnosticCodeEnum.referenceOutputNotFound
      ],
      client: [],
      effectiveValue: [
        ['start', 'text'],
        [VARIABLE_NODE_ID, 'topic']
      ]
    }
  ])(
    'checks $name under both policies',
    ({ name: _, strict, client, effectiveValue, ...input }) => {
      const document = makeDocument(input);
      document.chatConfig.variables = [
        {
          key: 'topic',
          label: 'Topic',
          description: '',
          type: VariableInputEnum.input,
          valueType: WorkflowIOValueTypeEnum.string
        },
        {
          key: 'count',
          label: 'Count',
          description: '',
          type: VariableInputEnum.numberInput,
          valueType: WorkflowIOValueTypeEnum.number
        },
        {
          key: 'appId',
          label: 'User appId',
          description: '',
          type: VariableInputEnum.numberInput,
          valueType: WorkflowIOValueTypeEnum.number
        }
      ];
      const before = structuredClone(document);
      expect(
        validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((issue) => issue.code)
      ).toEqual(strict);
      expect(
        validateWorkflow(document, { invalidReferencePolicy: 'asEmpty' }).map((issue) => issue.code)
      ).toEqual(client);
      if (effectiveValue) {
        expect(
          resolveWorkflowReferenceDocument({ document, invalidReferencePolicy: 'asEmpty' }).nodes[1]
            .inputs[0].value
        ).toEqual(effectiveValue);
      }
      expect(document).toEqual(before);
    }
  );
});

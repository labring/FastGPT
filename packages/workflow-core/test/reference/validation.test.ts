import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { describe, expect, it } from 'vitest';
import {
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
import {
  getWorkflowInputReferenceDiagnostics,
  resolveWorkflowReferenceDocument
} from '../../src/reference/validation';
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
    expect(getWorkflowInputReferenceDiagnostics({ document, nodeId: 'target', input })).toEqual([]);
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
      name: 'user global type mismatch',
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

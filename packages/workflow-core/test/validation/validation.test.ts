import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';

import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum,
  FlowNodeOutputTypeEnum,
  LoopRunModeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import {
  WorkflowDocumentSchema,
  type WorkflowDocument
} from '@fastgpt/global/core/workflow/type/document';
import { applyWorkflowCommand } from '../../src/command/apply';
import { builtinTemplateProvider } from '../template/provider';
import { createWorkflowDocument } from '../../src/domain/document';
import { parseNodeTemplateRef } from '../../src/template/type';
import { validateWorkflow } from '../../src/validation/index';
import { getDefaultExecutionSourcePort } from '../../src/edge/validation';
import { compileExecutionEdge, decompileStoreEdge } from '../../src/edge/compiler';
import { USER_SELECT_REFERENCE_HANDLE_KEY } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import aiWorkflow from '../fixtures/basic-ai/workflow.json';
import staticWorkflow from '../fixtures/basic-static/workflow.json';
import commonLinearWorkflow from '../fixtures/common-linear/workflow.json';
import { describe, expect, it } from 'vitest';

describe('validateWorkflow', () => {
  /** 创建连通的最小工作流，边界样例不受模板默认值和模型目录影响。 */
  const makeDocument = (overrides: Partial<StoreNodeItemType> = {}) =>
    createWorkflowDocument({
      nodes: [
        {
          nodeId: 'start',
          name: 'Start',
          flowNodeType: FlowNodeTypeEnum.workflowStart,
          inputs: [],
          outputs: []
        },
        {
          nodeId: 'target',
          name: 'Target',
          flowNodeType: FlowNodeTypeEnum.answerNode,
          inputs: [],
          outputs: [],
          ...overrides
        }
      ],
      executionEdges: [
        { source: { kind: 'next', nodeId: 'start' }, target: { kind: 'target', nodeId: 'target' } }
      ]
    });

  it.each([aiWorkflow, staticWorkflow, commonLinearWorkflow])(
    'accepts a golden workflow',
    (workflow) => {
      expect(
        validateWorkflow(WorkflowDocumentSchema.parse(workflow), {
          invalidReferencePolicy: 'error'
        })
      ).toEqual([]);
    }
  );

  it('reports duplicate IDs, missing start, unreachable nodes and required inputs', () => {
    const broken: WorkflowDocument = structuredClone(WorkflowDocumentSchema.parse(staticWorkflow));
    broken.nodes = broken.nodes.filter((node) => node.nodeId !== 'start');
    broken.nodes[0].inputs[0].value = undefined;
    broken.nodes.push({ ...broken.nodes[0], nodeId: broken.nodes[0].nodeId });
    broken.executionEdges = [];
    const codes = validateWorkflow(broken, { invalidReferencePolicy: 'error' }).map(
      (item) => item.code
    );
    expect(codes).toContain(WorkflowDiagnosticCodeEnum.nodeIdDuplicated);
    expect(codes).toContain(WorkflowDiagnosticCodeEnum.startCountInvalid);
    expect(codes).toContain(WorkflowDiagnosticCodeEnum.requiredInputMissing);
  });

  it('reports serial cycles and accepts conditional or error feedback without deleting edges', () => {
    const document = makeDocument();
    document.nodes.push({ ...document.nodes[1], nodeId: 'downstream' });
    document.executionEdges.push(
      {
        source: { kind: 'next', nodeId: 'target' },
        target: { kind: 'target', nodeId: 'downstream' }
      },
      {
        source: { kind: 'next', nodeId: 'downstream' },
        target: { kind: 'target', nodeId: 'target' }
      }
    );
    const before = structuredClone(document);
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).filter(
        (issue) => issue.code === WorkflowDiagnosticCodeEnum.edgeCreatesCycle
      )
    ).toHaveLength(2);
    expect(document).toEqual(before);

    document.nodes[1].flowNodeType = FlowNodeTypeEnum.ifElseNode;
    document.executionEdges[1].source = { kind: 'branch', nodeId: 'target', branchKey: 'ELSE' };
    const branched = structuredClone(document);
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).filter(
        (issue) => issue.code === WorkflowDiagnosticCodeEnum.edgeCreatesCycle
      )
    ).toEqual([]);
    expect(document).toEqual(branched);

    const withCatch = structuredClone(before);
    withCatch.nodes[1].catchError = true;
    withCatch.executionEdges[1].source = { kind: 'catch', nodeId: 'target' };
    const caught = structuredClone(withCatch);
    expect(
      validateWorkflow(withCatch, { invalidReferencePolicy: 'error' }).filter(
        (issue) => issue.code === WorkflowDiagnosticCodeEnum.edgeCreatesCycle
      )
    ).toEqual([]);
    expect(withCatch).toEqual(caught);

    withCatch.executionEdges[1].source = { kind: 'next', nodeId: 'target' };
    const successful = structuredClone(withCatch);
    expect(
      validateWorkflow(withCatch, { invalidReferencePolicy: 'error' }).filter(
        (issue) => issue.code === WorkflowDiagnosticCodeEnum.edgeCreatesCycle
      )
    ).toEqual([]);
    expect(withCatch).toEqual(successful);
  });

  it('reports incomplete variable update rows', async () => {
    const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };
    const start = await applyWorkflowCommand({
      document: createWorkflowDocument(),
      command: {
        type: 'node.add',
        nodeId: 'start',
        template: parseNodeTemplateRef('builtin:workflow-start')
      },
      dependencies
    });
    const update = await applyWorkflowCommand({
      document: start.document,
      command: {
        type: 'node.add',
        nodeId: 'update',
        template: parseNodeTemplateRef('builtin:variable-update'),
        connectFrom: { kind: 'next', nodeId: 'start' }
      },
      dependencies
    });

    const codes = validateWorkflow(update.document, { invalidReferencePolicy: 'error' }).map(
      (item) => item.code
    );
    expect(codes).toContain(WorkflowDiagnosticCodeEnum.variableUpdateTargetMissing);
    expect(codes).toContain(WorkflowDiagnosticCodeEnum.variableUpdateValueMissing);
  });

  it('reports malformed and non-upstream references', () => {
    const malformed: WorkflowDocument = structuredClone(WorkflowDocumentSchema.parse(aiWorkflow));
    const input = malformed.nodes
      .find((node) => node.nodeId === 'ai')!
      .inputs.find((item) => item.key === 'userChatInput')!;
    input.value = ['missing'];
    expect(
      validateWorkflow(malformed, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).toContain(WorkflowDiagnosticCodeEnum.referenceFormatInvalid);

    input.value = ['ai', 'answerText'];
    expect(
      validateWorkflow(malformed, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).toContain(WorkflowDiagnosticCodeEnum.referenceSourceNotUpstream);
  });

  it('explains how to repair a disconnected reference without allowing cross-scope edges', () => {
    const document = WorkflowDocumentSchema.parse(aiWorkflow);
    document.executionEdges = [];

    const diagnostic = validateWorkflow(document, { invalidReferencePolicy: 'error' }).find(
      (item) => item.code === WorkflowDiagnosticCodeEnum.referenceSourceNotUpstream
    );
    expect(diagnostic).toMatchObject({
      nodeId: 'ai',
      params: {
        sourceNodeId: 'start',
        remediation: expect.stringContaining("using 'edge.connect'")
      }
    });
    expect(diagnostic?.params?.remediation).toContain('For nodes in the same scope');
    expect(diagnostic?.params?.remediation).toContain('Do not add cross-scope execution edges.');
  });

  it('accepts missing external bindings and aggregate Start references', async () => {
    const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };
    const start = await applyWorkflowCommand({
      document: createWorkflowDocument(),
      command: {
        type: 'node.add',
        nodeId: 'start',
        template: parseNodeTemplateRef('builtin:workflow-start')
      },
      dependencies
    });
    const search = await applyWorkflowCommand({
      document: start.document,
      command: {
        type: 'node.add',
        nodeId: 'search',
        template: parseNodeTemplateRef('builtin:dataset-search'),
        connectFrom: { kind: 'next', nodeId: 'start' }
      },
      dependencies
    });

    expect(validateWorkflow(search.document, { invalidReferencePolicy: 'error' })).toEqual([]);
  });

  it('allows a downstream AI node to use retrieval results with or without a quote reference', async () => {
    const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };
    const start = await applyWorkflowCommand({
      document: createWorkflowDocument(),
      command: {
        type: 'node.add',
        nodeId: 'start',
        template: parseNodeTemplateRef('builtin:workflow-start')
      },
      dependencies
    });
    const search = await applyWorkflowCommand({
      document: start.document,
      command: {
        type: 'node.add',
        nodeId: 'search',
        template: parseNodeTemplateRef('builtin:dataset-search'),
        connectFrom: { kind: 'next', nodeId: 'start' }
      },
      dependencies
    });
    const ai = await applyWorkflowCommand({
      document: search.document,
      command: {
        type: 'node.add',
        nodeId: 'ai',
        template: parseNodeTemplateRef('builtin:ai-chat'),
        connectFrom: { kind: 'next', nodeId: 'search' }
      },
      dependencies
    });

    expect(validateWorkflow(ai.document, { invalidReferencePolicy: 'error' })).toEqual([]);

    const linked = await applyWorkflowCommand({
      document: ai.document,
      command: {
        type: 'input.ref',
        nodeId: 'ai',
        inputKey: NodeInputKeyEnum.aiChatDatasetQuote,
        ref: { nodeId: 'search', outputKey: NodeOutputKeyEnum.datasetQuoteQA }
      },
      dependencies
    });

    expect(validateWorkflow(linked.document, { invalidReferencePolicy: 'error' })).toEqual([]);
  });

  it('returns schema diagnostics instead of throwing', () => {
    expect(
      validateWorkflow({ schemaVersion: 'wrong' } as never, { invalidReferencePolicy: 'error' })[0]
        ?.code
    ).toBe(WorkflowDiagnosticCodeEnum.schemaInvalid);
  });

  it('reports duplicate and invalid execution edges', () => {
    const broken: WorkflowDocument = structuredClone(WorkflowDocumentSchema.parse(aiWorkflow));
    broken.executionEdges.push(structuredClone(broken.executionEdges[0]));
    broken.executionEdges.push({
      source: { kind: 'next', nodeId: 'missing' },
      target: { kind: 'target', nodeId: 'ai' }
    });
    const codes = validateWorkflow(broken, { invalidReferencePolicy: 'error' }).map(
      (item) => item.code
    );
    expect(codes).toContain(WorkflowDiagnosticCodeEnum.edgeDuplicated);
    expect(codes).toContain(WorkflowDiagnosticCodeEnum.nodeNotFound);
    expect(codes).not.toContain(WorkflowDiagnosticCodeEnum.edgeInvalid);
  });

  it('validates global references, reference types and deleted relation leftovers', () => {
    const broken: WorkflowDocument = structuredClone(WorkflowDocumentSchema.parse(staticWorkflow));
    broken.chatConfig.variables = [
      {
        key: 'count',
        label: 'Count',
        description: 'Counter',
        type: VariableInputEnum.numberInput,
        valueType: WorkflowIOValueTypeEnum.number
      }
    ];
    const answer = broken.nodes.find((node) => node.nodeId === 'answer')!;
    answer.parentNodeId = 'deleted-parent';
    const textInput = broken.nodes.find((node) => node.nodeId === 'text')!.inputs[0];
    textInput.renderTypeList.push(FlowNodeInputTypeEnum.reference);
    textInput.value = [VARIABLE_NODE_ID, 'count'];
    textInput.selectedType = FlowNodeInputTypeEnum.reference;
    const codes = validateWorkflow(broken, { invalidReferencePolicy: 'error' }).map(
      (item) => item.code
    );
    expect(codes).toContain(WorkflowDiagnosticCodeEnum.parentNodeNotFound);
    expect(codes).toContain(WorkflowDiagnosticCodeEnum.referenceTypeMismatch);

    textInput.value = [VARIABLE_NODE_ID, 'deleted-variable'];
    expect(
      validateWorkflow(broken, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).toContain(WorkflowDiagnosticCodeEnum.referenceOutputNotFound);
  });

  it.each([
    {
      flowNodeType: FlowNodeTypeEnum.httpRequest468,
      code: WorkflowDiagnosticCodeEnum.requiredInputMissing
    },
    {
      flowNodeType: FlowNodeTypeEnum.contentExtract,
      code: WorkflowDiagnosticCodeEnum.extractFieldsRequired
    },
    {
      flowNodeType: FlowNodeTypeEnum.datasetConcatNode,
      code: WorkflowDiagnosticCodeEnum.requiredInputMissing
    }
  ])('requires Web-specific local configuration on $flowNodeType', ({ flowNodeType, code }) => {
    expect(
      validateWorkflow(makeDocument({ flowNodeType }), { invalidReferencePolicy: 'error' })
    ).toEqual([expect.objectContaining({ nodeId: 'target', code })]);
  });

  it('accepts local HTTP and extraction configuration when filled', () => {
    const http = makeDocument({
      flowNodeType: FlowNodeTypeEnum.httpRequest468,
      inputs: [
        {
          key: NodeInputKeyEnum.httpReqUrl,
          label: 'URL',
          renderTypeList: [FlowNodeInputTypeEnum.input],
          valueType: WorkflowIOValueTypeEnum.string,
          required: true,
          value: 'https://example.com'
        }
      ]
    });
    expect(validateWorkflow(http, { invalidReferencePolicy: 'error' })).toEqual([]);
    const extract = makeDocument({
      flowNodeType: FlowNodeTypeEnum.contentExtract,
      inputs: [
        {
          key: NodeInputKeyEnum.extractKeys,
          label: '',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          valueType: WorkflowIOValueTypeEnum.any,
          value: [{ key: 'text', valueType: WorkflowIOValueTypeEnum.string }]
        }
      ]
    });
    expect(validateWorkflow(extract, { invalidReferencePolicy: 'error' })).toEqual([]);
  });

  it('accepts a workflow tool input as the root entry while retaining the single-entry constraint', () => {
    const document = makeDocument();
    document.nodes[0].flowNodeType = FlowNodeTypeEnum.pluginInput;
    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([]);
    document.nodes.push({
      nodeId: 'another-start',
      name: '',
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      inputs: [],
      outputs: []
    });
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).toContain(WorkflowDiagnosticCodeEnum.startCountInvalid);
  });

  it('rejects disconnected nodes and cycles', () => {
    const document = makeDocument();
    document.executionEdges = [];
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((item) => [
        item.nodeId,
        item.code
      ])
    ).toEqual([
      ['start', WorkflowDiagnosticCodeEnum.nodeIsolated],
      ['target', WorkflowDiagnosticCodeEnum.nodeNotReachable]
    ]);
    document.nodes[1].flowNodeType = FlowNodeTypeEnum.textEditor;
    document.nodes.push({ ...document.nodes[1], nodeId: 'other' });
    document.executionEdges.push(
      { source: { kind: 'next', nodeId: 'target' }, target: { kind: 'target', nodeId: 'other' } },
      { source: { kind: 'next', nodeId: 'other' }, target: { kind: 'target', nodeId: 'target' } }
    );
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' })
        .filter((item) => item.code === WorkflowDiagnosticCodeEnum.nodeNotReachable)
        .map((item) => item.nodeId)
    ).toEqual(['target', 'other']);
  });

  it.each([FlowNodeTypeEnum.workflowStart, FlowNodeTypeEnum.pluginInput])(
    'always blocks an isolated %s and accepts a connected entry',
    (flowNodeType) => {
      const document = makeDocument();
      document.nodes[0].flowNodeType = flowNodeType;
      expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([]);
      document.executionEdges = [];
      document.nodes = [document.nodes[0]];
      expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([
        { code: WorkflowDiagnosticCodeEnum.nodeIsolated, severity: 'error', nodeId: 'start' }
      ]);
    }
  );

  it('does not let an invalid edge make an isolated entry runnable or duplicate orphan issues', () => {
    const document = makeDocument();
    document.executionEdges[0].source = { kind: 'branch', nodeId: 'start', branchKey: 'deleted' };
    document.nodes.push({
      nodeId: 'comment',
      name: '',
      flowNodeType: FlowNodeTypeEnum.comment,
      inputs: [],
      outputs: []
    });
    const issues = validateWorkflow(document, { invalidReferencePolicy: 'error' });
    expect(issues.filter((item) => item.code === WorkflowDiagnosticCodeEnum.nodeIsolated)).toEqual([
      { code: WorkflowDiagnosticCodeEnum.nodeIsolated, severity: 'error', nodeId: 'start' }
    ]);
    expect(issues.filter((item) => item.nodeId === 'target')).toEqual([
      {
        code: WorkflowDiagnosticCodeEnum.nodeNotReachable,
        severity: 'error',
        nodeId: 'target',
        params: { reason: 'no_upstream' }
      }
    ]);
  });

  it('checks nested children from their local entry and retains container consistency checks', () => {
    const document = makeDocument({
      flowNodeType: FlowNodeTypeEnum.loop,
      inputs: [
        {
          key: NodeInputKeyEnum.childrenNodeIdList,
          label: '',
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          value: ['nested-start', 'nested-end', 'orphan']
        }
      ]
    });
    for (const [nodeId, flowNodeType] of [
      ['nested-start', FlowNodeTypeEnum.nestedStart],
      ['nested-end', FlowNodeTypeEnum.nestedEnd],
      ['orphan', FlowNodeTypeEnum.answerNode]
    ] as const) {
      document.nodes.push({
        nodeId,
        name: nodeId,
        flowNodeType,
        parentNodeId: 'target',
        inputs: [],
        outputs: []
      });
    }
    document.executionEdges.push({
      source: { kind: 'next', nodeId: 'nested-start' },
      target: { kind: 'target', nodeId: 'nested-end' }
    });
    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([
      expect.objectContaining({
        nodeId: 'orphan',
        code: WorkflowDiagnosticCodeEnum.nodeNotReachable
      })
    ]);
    const disconnected = { ...document, executionEdges: [document.executionEdges[0]] };
    expect(
      validateWorkflow(disconnected, { invalidReferencePolicy: 'error' }).filter(
        (item) => item.code === WorkflowDiagnosticCodeEnum.nodeIsolated
      )
    ).toEqual([
      { code: WorkflowDiagnosticCodeEnum.nodeIsolated, severity: 'error', nodeId: 'nested-start' }
    ]);
    document.nodes[1].inputs[0].value = [];
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).toContain(WorkflowDiagnosticCodeEnum.containerChildrenOutOfSync);
  });

  it.each([
    {
      variable: ['deleted', 'text'],
      value: ['string', 'value'],
      renderType: FlowNodeInputTypeEnum.input,
      expected: [WorkflowDiagnosticCodeEnum.variableUpdateTargetMissing]
    },
    {
      variable: ['start', 'text'],
      value: ['deleted', 'text'],
      renderType: FlowNodeInputTypeEnum.reference,
      expected: [WorkflowDiagnosticCodeEnum.variableUpdateValueMissing]
    },
    {
      variable: ['start', 'text'],
      value: [
        ['start', 'text'],
        ['deleted', 'text']
      ],
      renderType: FlowNodeInputTypeEnum.reference,
      expected: [WorkflowDiagnosticCodeEnum.variableUpdateValueMissing]
    },
    {
      variable: ['start', 'text'],
      renderType: FlowNodeInputTypeEnum.input,
      arrayMode: 'clear',
      expected: []
    },
    {
      variable: ['start', 'text'],
      renderType: FlowNodeInputTypeEnum.input,
      booleanMode: 'true',
      expected: []
    }
  ])('checks live references in variable update rows: %j', ({ expected, ...row }) => {
    const document = makeDocument({
      flowNodeType: FlowNodeTypeEnum.variableUpdate,
      inputs: [
        {
          key: NodeInputKeyEnum.updateList,
          label: '',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: [row]
        }
      ]
    });
    document.nodes[0].outputs.push({
      key: 'text',
      id: 'legacy-text',
      label: '',
      type: FlowNodeOutputTypeEnum.static
    });
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' })
        .filter(
          (item) =>
            item.code === WorkflowDiagnosticCodeEnum.variableUpdateEmpty ||
            item.code === WorkflowDiagnosticCodeEnum.variableUpdateItemInvalid ||
            item.code === WorkflowDiagnosticCodeEnum.variableUpdateTargetMissing ||
            item.code === WorkflowDiagnosticCodeEnum.variableUpdateValueMissing
        )
        .map((item) => item.code)
    ).toEqual(expected);
  });

  it('retains additional Core checks for duplicate options and form output contracts', () => {
    const select = makeDocument({
      flowNodeType: FlowNodeTypeEnum.userSelect,
      inputs: [
        {
          key: NodeInputKeyEnum.userSelectOptions,
          label: '',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: [
            { key: 'same', value: 'one' },
            { key: 'same', value: 'two' }
          ]
        }
      ]
    });
    expect(
      validateWorkflow(select, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).toContain(WorkflowDiagnosticCodeEnum.branchConfigurationInvalid);
    const form = makeDocument({
      flowNodeType: FlowNodeTypeEnum.formInput,
      inputs: [
        {
          key: NodeInputKeyEnum.userInputForms,
          label: '',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: [{ key: 'missing-output' }]
        }
      ]
    });
    expect(
      validateWorkflow(form, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).toContain(WorkflowDiagnosticCodeEnum.formInputConfigurationInvalid);
  });

  it('accepts dynamic choices from upstream or global variables and validates their shared branch', () => {
    const document = makeDocument({
      flowNodeType: FlowNodeTypeEnum.userSelect,
      inputs: [
        {
          key: NodeInputKeyEnum.userSelectOptions,
          label: 'Options',
          renderTypeList: [FlowNodeInputTypeEnum.custom, FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          valueType: WorkflowIOValueTypeEnum.any,
          required: true,
          value: [['start', 'choices']]
        }
      ]
    });
    document.nodes[0].outputs.push({
      id: 'choices',
      key: 'choices',
      label: 'Choices',
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.arrayString
    });
    document.nodes.push({
      nodeId: 'answer',
      name: 'Answer',
      flowNodeType: FlowNodeTypeEnum.answerNode,
      inputs: [],
      outputs: []
    });
    const source = getDefaultExecutionSourcePort(document, 'target');
    expect(source).toEqual({
      kind: 'branch',
      nodeId: 'target',
      branchKey: USER_SELECT_REFERENCE_HANDLE_KEY
    });
    const edge = { source, target: { kind: 'target' as const, nodeId: 'answer' } };
    document.executionEdges.push(edge);
    expect(decompileStoreEdge(compileExecutionEdge(edge, document), document)).toEqual(edge);
    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([]);

    document.chatConfig.variables = [
      {
        key: 'options',
        label: 'Options',
        description: 'Dynamic choices',
        type: VariableInputEnum.input,
        valueType: WorkflowIOValueTypeEnum.arrayString
      }
    ];
    // 和选择器一致，混合列表保留至少一个可用引用即可；运行前无法知道动态选项的实际分支。
    document.nodes[1].inputs[0].value = [
      ['deleted', 'choices'],
      [VARIABLE_NODE_ID, 'options']
    ];
    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([]);
    document.executionEdges[1].source = { kind: 'branch', nodeId: 'target', branchKey: 'stale' };
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((issue) => issue.code)
    ).toContain(WorkflowDiagnosticCodeEnum.branchKeyNotFound);

    document.nodes[1].inputs[0].selectedType = FlowNodeInputTypeEnum.custom;
    document.nodes[1].inputs[0].value = [{ key: 'literal', value: 'Literal choice' }];
    expect(getDefaultExecutionSourcePort(document, 'target')).toEqual({
      kind: 'branch',
      nodeId: 'target',
      branchKey: 'literal'
    });
    document.executionEdges[1].source = {
      kind: 'branch',
      nodeId: 'target',
      branchKey: USER_SELECT_REFERENCE_HANDLE_KEY
    };
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((issue) => issue.code)
    ).toContain(WorkflowDiagnosticCodeEnum.branchKeyNotFound);
  });

  it.each([
    { invalid: true },
    { id: NodeOutputKeyEnum.addOutputParam },
    { type: FlowNodeOutputTypeEnum.error },
    { valueType: WorkflowIOValueTypeEnum.arrayBoolean }
  ])('rejects dynamic choices from an unselectable output: %j', (output) => {
    const document = makeDocument({
      flowNodeType: FlowNodeTypeEnum.userSelect,
      inputs: [
        {
          key: NodeInputKeyEnum.userSelectOptions,
          label: 'Options',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.any,
          required: true,
          value: [['start', output.id ?? 'choices']]
        }
      ]
    });
    document.nodes[0].outputs.push({
      id: 'choices',
      key: 'choices',
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.arrayString,
      ...output
    });
    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([
      expect.objectContaining({
        code: WorkflowDiagnosticCodeEnum.branchConfigurationInvalid,
        inputKey: NodeInputKeyEnum.userSelectOptions,
        params: { reason: 'empty' }
      })
    ]);
  });

  it('retains conditional-loop system nodes and break requirements', () => {
    const document = makeDocument({
      flowNodeType: FlowNodeTypeEnum.loopRun,
      inputs: [
        {
          key: NodeInputKeyEnum.loopRunMode,
          label: '',
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          value: LoopRunModeEnum.conditional
        },
        {
          key: NodeInputKeyEnum.childrenNodeIdList,
          label: '',
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          value: []
        }
      ]
    });
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).toEqual(
      expect.arrayContaining([
        WorkflowDiagnosticCodeEnum.containerSystemChildInvalid,
        WorkflowDiagnosticCodeEnum.conditionalLoopBreakRequired
      ])
    );
    document.nodes.push(
      {
        nodeId: 'loop-start',
        name: '',
        flowNodeType: FlowNodeTypeEnum.loopRunStart,
        parentNodeId: 'target',
        inputs: [],
        outputs: []
      },
      {
        nodeId: 'break',
        name: '',
        flowNodeType: FlowNodeTypeEnum.loopRunBreak,
        parentNodeId: 'target',
        inputs: [],
        outputs: []
      }
    );
    document.nodes[1].inputs[1].value = ['loop-start', 'break'];
    document.executionEdges.push({
      source: { kind: 'next', nodeId: 'loop-start' },
      target: { kind: 'target', nodeId: 'break' }
    });
    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([]);
  });

  it('retains invalid-parent and missing-system-parent checks while leaving resource state to Web', () => {
    const document = makeDocument({
      parentNodeId: 'start',
      pluginData: { error: 'tool_load_failed' }
    });
    document.nodes.push({
      nodeId: 'loose-start',
      name: '',
      flowNodeType: FlowNodeTypeEnum.nestedStart,
      inputs: [],
      outputs: []
    });
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).toEqual(
      expect.arrayContaining([
        WorkflowDiagnosticCodeEnum.parentNotContainer,
        WorkflowDiagnosticCodeEnum.systemOrBreakParentRequired,
        WorkflowDiagnosticCodeEnum.edgeCrossScope
      ])
    );
    expect(
      validateWorkflow(makeDocument({ pluginData: { error: 'tool_missing' } }), {
        invalidReferencePolicy: 'error'
      })
    ).toEqual([]);
  });

  it('only checks models when the caller supplies model checking context and does not duplicate required issues', () => {
    const document = makeDocument({
      flowNodeType: FlowNodeTypeEnum.pluginModule,
      inputs: [
        {
          key: 'customModel',
          label: 'Custom model',
          renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
          valueType: WorkflowIOValueTypeEnum.string,
          required: true
        }
      ]
    });
    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([]);
    expect(
      validateWorkflow(document, {
        invalidReferencePolicy: 'error',
        modelCheck: { templates: [], modelData: { references: [], defaultModelIds: {} } }
      })
    ).toEqual([
      expect.objectContaining({
        code: WorkflowDiagnosticCodeEnum.modelRequired,
        nodeId: 'target',
        inputKey: 'customModel'
      })
    ]);
    document.nodes[1].inputs[0].value = 'not-in-the-catalog';
    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([]);
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error', modelCheck: { templates: [] } })
    ).toEqual([]);
    expect(
      validateWorkflow(document, {
        invalidReferencePolicy: 'error',
        modelCheck: { templates: [], modelData: { references: [], defaultModelIds: {} } }
      })
    ).toEqual([
      expect.objectContaining({
        code: WorkflowDiagnosticCodeEnum.modelUnavailable,
        inputKey: 'customModel'
      })
    ]);
  });

  it('requires a variable update row and rejects malformed rows without throwing', () => {
    const document = makeDocument({
      flowNodeType: FlowNodeTypeEnum.variableUpdate,
      inputs: [
        {
          key: NodeInputKeyEnum.updateList,
          label: '',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: []
        }
      ]
    });
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).toEqual(
      expect.arrayContaining([
        WorkflowDiagnosticCodeEnum.variableUpdateTargetMissing,
        WorkflowDiagnosticCodeEnum.variableUpdateValueMissing
      ])
    );
    document.nodes[1].inputs[0].value = [null];
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).toContain(WorkflowDiagnosticCodeEnum.variableUpdateItemInvalid);
  });

  it('preserves stricter empty-branch checks and accepts conditions that need no comparison value', () => {
    const document = makeDocument({
      flowNodeType: FlowNodeTypeEnum.ifElseNode,
      inputs: [
        {
          key: NodeInputKeyEnum.ifElseList,
          label: '',
          renderTypeList: [FlowNodeInputTypeEnum.custom],
          value: []
        }
      ]
    });
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).toContain(WorkflowDiagnosticCodeEnum.branchConfigurationInvalid);
    document.nodes[1].inputs[0].value = [
      { list: [{ variable: ['start', 'text'], condition: VariableConditionEnum.isEmpty }] }
    ];
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).not.toContain(WorkflowDiagnosticCodeEnum.branchConfigurationInvalid);
    document.nodes[1].inputs[0].value = [{ list: [{ variable: ['start', 'text'] }] }];
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).toContain(WorkflowDiagnosticCodeEnum.branchConfigurationInvalid);
  });

  it('requires a tool or the sandbox option on tool calls', () => {
    const document = makeDocument({ flowNodeType: FlowNodeTypeEnum.toolCall });
    expect(
      validateWorkflow(document, { invalidReferencePolicy: 'error' }).map((item) => item.code)
    ).toContain(WorkflowDiagnosticCodeEnum.toolRequired);
    document.nodes[1].inputs.push({
      key: NodeInputKeyEnum.useAgentSandbox,
      label: '',
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    });
    expect(validateWorkflow(document, { invalidReferencePolicy: 'error' })).toEqual([]);
  });
});

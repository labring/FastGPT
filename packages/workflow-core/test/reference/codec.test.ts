import {
  DatasetTagFilterLogicEnum,
  DatasetTagFilterValueModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { NodeInputKeyEnum, VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowDocumentSchema } from '@fastgpt/global/core/workflow/type/document';
import {
  decodeWorkflowNodeReferences,
  encodeWorkflowNodeReferences
} from '../../src/reference/codec';
import commonLinearWorkflow from '../fixtures/common-linear/workflow.json';
import { compileStoreWorkflow } from '../../src/store/compile';
import { decompileStoreWorkflow } from '../../src/store/decompile';
import { getWorkflowInputReferenceDiagnostics } from '../../src/reference/validation';
import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { describe, expect, it } from 'vitest';

describe('workflow reference codec', () => {
  const createNodes = () => {
    const document = WorkflowDocumentSchema.parse(commonLinearWorkflow);
    const answerInput = document.nodes
      .find((node) => node.nodeId === 'answer')!
      .inputs.find((input) => input.key === 'text')!;
    answerInput.value = ['code', 'result'];

    const httpHeaderInput = document.nodes
      .find((node) => node.nodeId === 'http')!
      .inputs.find((input) => input.key === 'system_httpHeader')!;
    httpHeaderInput.defaultValue = ['code', 'result'];
    httpHeaderInput.value = [
      {
        key: 'x-result',
        value:
          'Result: {{$code.result$}}; Global: {{$VARIABLE_NODE_ID.globalResult$}}; Missing: {{$missing.result$}}',
        nested: {
          refs: [
            ['code', 'result'],
            [VARIABLE_NODE_ID, 'globalResult'],
            ['missing', 'result']
          ]
        }
      }
    ];
    return document.nodes;
  };

  it('encodes output keys and text interpolation without changing literal header arrays', () => {
    const nodes = createNodes();
    const encodedNodes = encodeWorkflowNodeReferences(nodes);
    const encodedAnswerInput = encodedNodes
      .find((node) => node.nodeId === 'answer')!
      .inputs.find((input) => input.key === 'text')!;
    const encodedHeaderInput = encodedNodes
      .find((node) => node.nodeId === 'http')!
      .inputs.find((input) => input.key === 'system_httpHeader')!;
    const encodedHeaders = encodedHeaderInput.value as Array<{
      value: string;
      nested: { refs: string[][] };
    }>;

    expect(encodedAnswerInput.value).toEqual(['code', 'qLUQfhG0ILRX']);
    expect(encodedHeaderInput.defaultValue).toEqual(['code', 'result']);
    expect(encodedHeaders[0].value).toBe(
      'Result: {{$code.qLUQfhG0ILRX$}}; Global: {{$VARIABLE_NODE_ID.globalResult$}}; Missing: {{$missing.result$}}'
    );
    expect(encodedHeaders[0].nested.refs).toEqual([
      ['code', 'result'],
      [VARIABLE_NODE_ID, 'globalResult'],
      ['missing', 'result']
    ]);
    expect(
      nodes.find((node) => node.nodeId === 'answer')!.inputs.find((input) => input.key === 'text')!
        .value
    ).toEqual(['code', 'result']);
  });

  it('decodes output ids back to stable output keys', () => {
    const nodes = createNodes();
    expect(decodeWorkflowNodeReferences(encodeWorkflowNodeReferences(nodes))).toEqual(nodes);
  });

  it('preserves interpolated IDs when the output key contains the interpolation delimiter', () => {
    const nodes = encodeWorkflowNodeReferences(createNodes());
    const output = nodes
      .find(({ nodeId }) => nodeId === 'code')!
      .outputs.find(({ key }) => key === 'result')!;
    output.key = 'result$';
    expect(encodeWorkflowNodeReferences(decodeWorkflowNodeReferences(nodes))).toEqual(nodes);
  });

  it.each(['present', 'cleared', 'omitted'])(
    'distinguishes a deleted output ID from a same-key replacement with snapshots %s',
    (snapshotState) => {
      const store = compileStoreWorkflow(WorkflowDocumentSchema.parse(commonLinearWorkflow));
      const replacement = store.nodes
        .find(({ nodeId }) => nodeId === 'code')!
        .outputs.find(({ key }) => key === 'result')!;
      const previousReference: [string, string] = ['code', 'result'];
      const readAnswer = ({ nodes }: Pick<typeof store, 'nodes'>) =>
        nodes.find(({ nodeId }) => nodeId === 'answer')!.inputs.find(({ key }) => key === 'text')!;
      const answer = readAnswer(store);
      answer.value = [previousReference, ['code', replacement.id]];
      answer.defaultValue = `{{$code.result$}} / {{$code.${replacement.id}$}}`;
      if (snapshotState === 'present') {
        store.referenceSnapshots = [{ reference: previousReference, outputLabel: 'Old result' }];
      } else if (snapshotState === 'cleared') {
        store.referenceSnapshots = [];
      }

      const document = decompileStoreWorkflow({ workflow: store });
      const local = readAnswer(document);
      const [historical, current] = local.value;
      expect(current).toEqual(['code', replacement.key]);
      const check = (value: unknown) =>
        getWorkflowInputReferenceDiagnostics({
          document,
          nodeId: 'answer',
          input: { ...local, value }
        });
      expect(check(historical).map(({ code }) => code)).toEqual([
        WorkflowDiagnosticCodeEnum.referenceOutputNotFound
      ]);
      expect(check(current)).toEqual([]);
      expect(readAnswer(compileStoreWorkflow(document))).toEqual(answer);
    }
  );

  it('encodes dynamic form references while preserving manual default options', () => {
    const nodes = createNodes();
    const forms = [
      {
        type: FlowNodeInputTypeEnum.multipleSelect,
        list: [{ label: 'Example: {{$code.result$}}', value: '{{$code.result$}}' }],
        defaultValue: ['code', 'result']
      },
      {
        type: FlowNodeInputTypeEnum.select,
        listInputType: FlowNodeInputTypeEnum.reference,
        listReference: [['code', 'result']]
      }
    ];
    nodes.push({
      nodeId: 'form',
      name: 'Form',
      flowNodeType: FlowNodeTypeEnum.formInput,
      inputs: [
        {
          key: NodeInputKeyEnum.userInputForms,
          label: 'Form inputs',
          renderTypeList: [],
          value: forms,
          defaultValue: forms
        }
      ],
      outputs: []
    });

    const encoded = encodeWorkflowNodeReferences(nodes);
    const formInput = encoded.at(-1)?.inputs[0];
    const encodedForms = [forms[0], { ...forms[1], listReference: [['code', 'qLUQfhG0ILRX']] }];
    expect(formInput?.value).toEqual(encodedForms);
    expect(formInput?.defaultValue).toEqual(encodedForms);
    expect(decodeWorkflowNodeReferences(encoded)).toEqual(nodes);
  });

  it('does not rewrite manual user-select text that looks like interpolation', () => {
    const nodes = createNodes();
    const options = [{ key: 'example', value: '示例：{{$code.result$}}' }];
    nodes.push({
      nodeId: 'select',
      name: 'Select',
      flowNodeType: FlowNodeTypeEnum.userSelect,
      inputs: [
        {
          key: NodeInputKeyEnum.userSelectOptions,
          label: 'Options',
          renderTypeList: [FlowNodeInputTypeEnum.custom, FlowNodeInputTypeEnum.reference],
          value: options
        }
      ],
      outputs: []
    });

    expect(encodeWorkflowNodeReferences(nodes).at(-1)?.inputs[0].value).toEqual(options);
  });

  it('encodes structured dataset references and retains literal tags', () => {
    const nodes = createNodes();
    const sourceRef = ['code', 'result'];
    const encodedRef = ['code', 'qLUQfhG0ILRX'];
    const manual = { valueMode: DatasetTagFilterValueModeEnum.input, value: sourceRef };
    const filter = {
      logic: DatasetTagFilterLogicEnum.AND,
      conditions: [manual, { valueMode: DatasetTagFilterValueModeEnum.reference, value: sourceRef }]
    };
    nodes.push(
      {
        nodeId: 'dataset',
        name: 'Dataset search',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [
          {
            key: NodeInputKeyEnum.collectionFilterMatch,
            label: 'Filter',
            renderTypeList: [FlowNodeInputTypeEnum.datasetTagFilter],
            value: filter
          }
        ],
        outputs: []
      },
      {
        nodeId: 'agent',
        name: 'Agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetParams,
            label: 'Dataset settings',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            value: { collectionFilterMatch: sourceRef }
          }
        ],
        outputs: []
      }
    );
    const encoded = encodeWorkflowNodeReferences(nodes);
    expect(encoded.at(-2)?.inputs[0].value).toEqual({
      ...filter,
      conditions: [manual, { ...filter.conditions[1], value: encodedRef }]
    });
    expect(encoded.at(-1)?.inputs[0].value).toEqual({ collectionFilterMatch: encodedRef });
    expect(decodeWorkflowNodeReferences(encoded)).toEqual(nodes);
  });

  it('round-trips a legacy whole-filter reference on a standalone dataset node', () => {
    const nodes = createNodes();
    nodes.push({
      nodeId: 'dataset',
      name: 'Dataset search',
      flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
      inputs: [
        {
          key: NodeInputKeyEnum.collectionFilterMatch,
          label: 'Filter',
          renderTypeList: [FlowNodeInputTypeEnum.datasetTagFilter, FlowNodeInputTypeEnum.reference],
          value: ['code', 'result']
        }
      ],
      outputs: []
    });

    const encoded = encodeWorkflowNodeReferences(nodes);
    expect(encoded.at(-1)?.inputs[0].value).toEqual(['code', 'qLUQfhG0ILRX']);
    expect(decodeWorkflowNodeReferences(encoded)).toEqual(nodes);
  });

  it('preserves absent fields and encodes legacy variable updates without an explicit mode', () => {
    const nodes = createNodes();
    const updateList = [
      { variable: [VARIABLE_NODE_ID, 'target'], value: ['code', 'result'] },
      { variable: [VARIABLE_NODE_ID, 'empty'] }
    ];
    nodes.push({
      nodeId: 'update',
      name: 'Update',
      flowNodeType: FlowNodeTypeEnum.variableUpdate,
      inputs: [
        {
          key: NodeInputKeyEnum.updateList,
          label: 'Updates',
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          value: updateList
        }
      ],
      outputs: []
    });
    const encoded = encodeWorkflowNodeReferences(nodes);
    expect(encoded.at(-1)?.inputs[0].value).toStrictEqual([
      { ...updateList[0], value: ['code', 'qLUQfhG0ILRX'] },
      updateList[1]
    ]);
    expect(decodeWorkflowNodeReferences(encoded)).toStrictEqual(nodes);
  });

  it('preserves historical references through StoreWorkflow and CLI document conversion', () => {
    const referenceSnapshots = [
      { reference: ['removed', 'output'] as [string, string], sourceLabel: 'Historical output' }
    ];
    const workflow = { nodes: createNodes(), edges: [], chatConfig: {}, referenceSnapshots };

    const document = decompileStoreWorkflow({ workflow });
    expect(document.referenceSnapshots).toEqual(referenceSnapshots);
    expect(compileStoreWorkflow(document).referenceSnapshots).toEqual(referenceSnapshots);
  });
});

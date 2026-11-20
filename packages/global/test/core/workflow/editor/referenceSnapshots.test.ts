import { describe, expect, it } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { createWorkflowEditor } from '@fastgpt/global/common/workflow/editor/runtime/runtime';
import { getWorkflowReferenceItemsFromValue } from '@fastgpt/global/common/workflow/reference';
import type { CanonicalWorkflowData } from '@fastgpt/global/core/workflow/migration/schema';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type {
  WorkflowCommand,
  WorkflowRuntimePort
} from '@fastgpt/global/core/workflow/editor/types';

/** 快照夹具：start -> mid -> (answer, extra)，两个 consumer 共用 mid 的同一个输出。 */
const createSnapshotRuntime = (): WorkflowRuntimePort => {
  const answerInput = () => ({
    key: NodeInputKeyEnum.answerText,
    label: 'Answer',
    renderTypeList: [FlowNodeInputTypeEnum.reference],
    selectedType: FlowNodeInputTypeEnum.reference,
    valueType: WorkflowIOValueTypeEnum.string
  });
  const editor = createWorkflowEditor({
    nodes: [
      {
        nodeId: 'start',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        name: 'Start',
        inputs: [],
        outputs: [
          {
            id: 'userChatInput',
            key: 'userChatInput',
            type: FlowNodeOutputTypeEnum.source,
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'User Question'
          }
        ]
      },
      {
        nodeId: 'mid',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Middle',
        avatar: 'core/workflow/template/answer',
        inputs: [],
        outputs: [
          {
            id: 'text',
            key: 'text',
            type: FlowNodeOutputTypeEnum.source,
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'Middle Text'
          }
        ]
      },
      {
        nodeId: 'answer',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Answer',
        inputs: [answerInput()],
        outputs: []
      },
      {
        nodeId: 'extra',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Extra',
        inputs: [answerInput()],
        outputs: []
      }
    ],
    edges: [],
    chatConfig: {}
  });
  editor.dispatch([
    {
      type: 'connectEdge',
      edge: { source: 'start', target: 'mid', sourceHandle: 'source', targetHandle: 'target' }
    },
    {
      type: 'connectEdge',
      edge: { source: 'mid', target: 'answer', sourceHandle: 'source', targetHandle: 'target' }
    },
    {
      type: 'connectEdge',
      edge: { source: 'mid', target: 'extra', sourceHandle: 'source', targetHandle: 'target' }
    }
  ] satisfies readonly WorkflowCommand[]);
  // 连线之后再写引用值，避免与 workflowStart 自动填充互相干扰。
  ['answer', 'extra'].forEach((nodeId) => {
    editor.dispatch({
      type: 'updateField',
      nodeId,
      fieldKey: NodeInputKeyEnum.answerText,
      value: [['mid', 'text']]
    });
  });
  return editor;
};

const MID_SNAPSHOT = {
  reference: ['mid', 'text'],
  sourceLabel: 'Middle',
  outputLabel: 'Middle Text',
  icon: 'core/workflow/template/answer'
};

it('keeps dynamic form option references and treats manual default selections as literals', () => {
  const editor = createSnapshotRuntime();
  const { nodes } = editor.getWorkflowData();
  const source = nodes.find((node) => node.nodeId === 'mid')!;
  const start = nodes.find((node) => node.nodeId === 'start')!;
  const form = {
    nodeId: 'form',
    name: 'Form',
    flowNodeType: FlowNodeTypeEnum.formInput,
    inputs: [
      {
        key: NodeInputKeyEnum.userInputForms,
        label: 'Fields',
        renderTypeList: [FlowNodeInputTypeEnum.custom],
        value: [
          {
            key: 'manual',
            label: 'Manual',
            type: FlowNodeInputTypeEnum.multipleSelect,
            listInputType: FlowNodeInputTypeEnum.input,
            list: [{ label: '示例：{{$missing.result$}}', value: '{{$missing.result$}}' }],
            defaultValue: ['north', 'south']
          },
          {
            key: 'dynamic',
            label: 'Dynamic',
            type: FlowNodeInputTypeEnum.select,
            listInputType: FlowNodeInputTypeEnum.reference,
            listReference: [['mid', 'text']]
          }
        ]
      }
    ],
    outputs: []
  };
  editor.dispose();
  const runtime = createWorkflowEditor({
    nodes: [start, source, form],
    edges: [{ source: 'mid', target: 'form', sourceHandle: 'source', targetHandle: 'target' }],
    chatConfig: {}
  });
  const initialIssueCodes = runtime.getNode('form')?.issues.map((issue) => issue.code);
  expect(runtime.dispatch({ type: 'removeNodes', nodeIds: ['mid'] }).ok).toBe(true);
  expect(runtime.getWorkflowData().referenceSnapshots).toEqual([MID_SNAPSHOT]);
  expect(initialIssueCodes).not.toContain('invalid_reference');
});

it('keeps manual user-select text outside validation and the reference graph', () => {
  const fixture = createSnapshotRuntime();
  const { nodes } = fixture.getWorkflowData();
  fixture.dispose();
  const runtime = createWorkflowEditor({
    nodes: [
      ...nodes.filter(({ nodeId }) => nodeId === 'start' || nodeId === 'mid'),
      {
        nodeId: 'select',
        name: 'Select',
        flowNodeType: FlowNodeTypeEnum.userSelect,
        inputs: [
          {
            key: NodeInputKeyEnum.userSelectOptions,
            label: 'Options',
            renderTypeList: [FlowNodeInputTypeEnum.custom, FlowNodeInputTypeEnum.reference],
            value: [{ key: 'example', value: '示例：{{$mid.text$}}' }]
          }
        ],
        outputs: []
      }
    ],
    edges: [
      { source: 'start', target: 'mid', sourceHandle: 'source', targetHandle: 'target' },
      { source: 'mid', target: 'select', sourceHandle: 'source', targetHandle: 'target' }
    ],
    chatConfig: {}
  });

  expect(runtime.dispatch({ type: 'removeNodes', nodeIds: ['mid'] }).ok).toBe(true);
  expect(runtime.getNode('select')?.issues).not.toContainEqual(
    expect.objectContaining({ code: 'invalid_reference' })
  );
  expect(
    runtime.getField({ nodeId: 'select', fieldKey: NodeInputKeyEnum.userSelectOptions })?.references
  ).toEqual([]);
  expect(runtime.getWorkflowData().referenceSnapshots).toEqual([]);
});

const joinReference = (reference: readonly (string | undefined)[]) =>
  reference.join(String.fromCharCode(0));

/** 出站不变量：导出的每条快照都必须「实时来源已不可解析且仍有 consumer」，否则就是孤立索引。 */
const expectNoOrphanSnapshots = (data: CanonicalWorkflowData) => {
  const outputsByNode = new Map(data.nodes.map((node) => [node.nodeId, node.outputs]));
  const consumerKeys = new Set(
    data.nodes.flatMap((node) =>
      node.inputs.flatMap((input) =>
        getWorkflowReferenceItemsFromValue(input.value, { includeCanonicalReferences: true }).map(
          (reference) => joinReference(reference)
        )
      )
    )
  );
  // 先确认这批用例真的产出了快照，避免断言空数组而空过。
  expect(data.referenceSnapshots.length).toBeGreaterThan(0);
  data.referenceSnapshots.forEach((snapshot) => {
    // 仍有 consumer 引用它
    expect(consumerKeys.has(joinReference(snapshot.reference))).toBe(true);
    // 来源确实已不可解析：节点被删，或节点还在但该输出已不存在
    const outputs = outputsByNode.get(snapshot.reference[0]);
    expect(outputs?.some((output) => output.id === snapshot.reference[1])).toBeFalsy();
  });
};

/** geometry 只改 Node View，导出里的 position 跟着变；断言结构不变时要先剥掉它。 */
const withoutPosition = (nodes: CanonicalWorkflowData['nodes']) =>
  nodes.map(({ position: _position, ...node }) => node);

describe('reference snapshots', () => {
  const query = { nodeId: 'answer', fieldKey: NodeInputKeyEnum.answerText };
  const extraQuery = { nodeId: 'extra', fieldKey: NodeInputKeyEnum.answerText };
  const midToAnswer: StoreEdgeItemType = {
    source: 'mid',
    target: 'answer',
    sourceHandle: 'source',
    targetHandle: 'target'
  };

  it.each([{ ref: ['mid', 'text'] }, { ref: [['mid', 'text']] }])(
    'extracts workflow references from secret values: %j',
    (value) => {
      expect(getWorkflowReferenceItemsFromValue(value, { includeSecretReferences: true })).toEqual([
        ['mid', 'text']
      ]);
    }
  );

  it('captures one snapshot per missing source and shares it across consumers', () => {
    const editor = createSnapshotRuntime();
    expect(editor.getWorkflowData().referenceSnapshots).toEqual([]);
    expect(editor.getField(query)?.references[0]).toEqual(
      expect.objectContaining({ code: 'valid', sourceLabel: 'Middle' })
    );

    expect(editor.dispatch({ type: 'removeNodes', nodeIds: ['mid'] }).ok).toBe(true);

    // 来源被删后状态仍带历史名字与图标，UI 因此不会渲染成空白 chip
    expect(editor.getField(query)?.references[0]).toEqual(
      expect.objectContaining({ code: 'invalid_reference', ...MID_SNAPSHOT })
    );
    expect(editor.getField(extraQuery)?.references[0]).toEqual(
      expect.objectContaining({ code: 'invalid_reference', ...MID_SNAPSHOT })
    );

    // 两个 consumer 共用同一条快照
    const data = editor.getWorkflowData();
    expect(data.referenceSnapshots).toEqual([MID_SNAPSHOT]);
    expectNoOrphanSnapshots(data);
  });

  it('keeps snapshot cache reads isolated across restore, undo, redo and export', () => {
    const editor = createSnapshotRuntime();
    editor.dispatch({ type: 'removeNodes', nodeIds: ['mid'] });
    expect(editor.getWorkflowData().referenceSnapshots).toEqual([MID_SNAPSHOT]);
    expect(editor.getField(query)?.references[0]).toEqual(
      expect.objectContaining({ code: 'invalid_reference', ...MID_SNAPSHOT })
    );

    editor.dispatch({
      type: 'addNode',
      node: {
        nodeId: 'mid',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Restored Middle',
        inputs: [],
        outputs: [
          {
            id: 'text',
            key: 'text',
            type: FlowNodeOutputTypeEnum.source,
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'Restored Text'
          }
        ]
      }
    });
    expect(editor.getField(query)?.references[0]).toEqual(
      expect.objectContaining({ sourceLabel: 'Restored Middle', outputLabel: 'Restored Text' })
    );
    expect(editor.getWorkflowData().referenceSnapshots).toEqual([]);

    expect(editor.undo().ok).toBe(true);
    expect(editor.getWorkflowData().referenceSnapshots).toEqual([MID_SNAPSHOT]);
    expect(editor.getField(query)?.references[0]).toEqual(
      expect.objectContaining({ code: 'invalid_reference', ...MID_SNAPSHOT })
    );

    expect(editor.redo().ok).toBe(true);
    expect(editor.getWorkflowData().referenceSnapshots).toEqual([]);
  });

  it('restores snapshots together with the document through undo and redo', () => {
    const editor = createSnapshotRuntime();
    editor.dispatch({ type: 'removeNodes', nodeIds: ['mid'] });

    expect(editor.undo().ok).toBe(true);
    expect(editor.getWorkflowData().referenceSnapshots).toEqual([]);
    expect(editor.getField(query)?.references[0]).toEqual(
      expect.objectContaining({ code: 'valid', sourceLabel: 'Middle' })
    );

    expect(editor.redo().ok).toBe(true);
    const data = editor.getWorkflowData();
    expect(data.referenceSnapshots).toEqual([MID_SNAPSHOT]);
    expect(editor.getField(query)?.references[0]).toEqual(
      expect.objectContaining({ code: 'invalid_reference', ...MID_SNAPSHOT })
    );
    expectNoOrphanSnapshots(data);
  });

  it('keeps snapshots untouched for a pure geometry transaction', () => {
    const editor = createSnapshotRuntime();
    editor.dispatch({ type: 'removeNodes', nodeIds: ['mid'] });
    const before = editor.getWorkflowData();

    expect(
      editor.dispatch({ type: 'commitGeometry', nodeId: 'answer', position: { x: 20, y: 30 } }).ok
    ).toBe(true);

    const after = editor.getWorkflowData();
    // geometry 事务不扫描来源，快照与其它结构原样保留
    expect(after.referenceSnapshots).toEqual([MID_SNAPSHOT]);
    expect(withoutPosition(after.nodes)).toEqual(withoutPosition(before.nodes));
    expect(after.edges).toEqual(before.edges);
    expect(after.chatConfig).toEqual(before.chatConfig);
    expect(editor.getNodeView('answer')?.position).toEqual({ x: 20, y: 30 });
  });

  it('compacts snapshots without touching nodes, edges, chatConfig or value order', () => {
    const editor = createSnapshotRuntime();
    // 留一条与 mid 无关的边，确认压缩不会顺带动到 edges
    editor.dispatch({
      type: 'connectEdge',
      edge: { source: 'start', target: 'answer', sourceHandle: 'source', targetHandle: 'target' }
    });
    editor.dispatch({ type: 'removeNodes', nodeIds: ['mid'] });

    const first = editor.getWorkflowData();
    expect(first.nodes.map((node) => node.nodeId)).toEqual(['start', 'answer', 'extra']);
    expect(first.edges.map((edge) => [edge.source, edge.target])).toEqual([['start', 'answer']]);
    expect(first.chatConfig).toEqual({});
    // 出站裁剪已删：失效引用原样留在字段值里，快照才有 consumer
    expect(first.nodes[1].inputs[0].value).toEqual([['mid', 'text']]);
    expect(first.referenceSnapshots).toEqual([MID_SNAPSHOT]);
    expectNoOrphanSnapshots(first);

    // 压缩是纯读操作：重复导出稳定，且不改动文档里的其它根字段
    expect(editor.getWorkflowData()).toEqual(first);

    editor.dispatch({ type: 'updateField', ...query, value: [] });
    const withOneConsumer = editor.getWorkflowData();
    expect(withOneConsumer.referenceSnapshots).toEqual([MID_SNAPSHOT]);
    expectNoOrphanSnapshots(withOneConsumer);

    editor.dispatch({ type: 'updateField', ...extraQuery, value: [] });
    const emptied = editor.getWorkflowData();
    expect(emptied.referenceSnapshots).toEqual([]);
    expect(emptied.nodes.map((node) => node.nodeId)).toEqual(first.nodes.map((n) => n.nodeId));
    expect(emptied.edges).toEqual(first.edges);
    expect(emptied.chatConfig).toEqual(first.chatConfig);
    expect(emptied.nodes[2].inputs[0].value).toEqual([]);
  });

  it('re-evaluates reference reachability when edges are disconnected and reconnected', () => {
    const editor = createSnapshotRuntime();
    expect(editor.getField(query)?.references[0]).toEqual(
      expect.objectContaining({ code: 'valid', sourceLabel: 'Middle' })
    );

    // 断边后上游可达性记忆化必须作废，否则状态会停在过期的 valid
    expect(editor.dispatch({ type: 'disconnectEdge', edge: midToAnswer }).ok).toBe(true);
    expect(editor.getField(query)?.references[0]).toEqual(
      expect.objectContaining({ code: 'unreachable_reference', sourceLabel: 'Middle' })
    );

    expect(editor.dispatch({ type: 'connectEdge', edge: midToAnswer }).ok).toBe(true);
    expect(editor.getField(query)?.references[0]).toEqual(
      expect.objectContaining({ code: 'valid', sourceLabel: 'Middle' })
    );
  });
});

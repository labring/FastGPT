import { describe, expect, it } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { createWorkflowEditor } from '@fastgpt/global/core/workflow/editor/runtime/runtime';
import { getWorkflowReferenceItemsFromValue } from '@fastgpt/global/core/workflow/editor/utils';
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

  it('reads live metadata and stops exporting the snapshot once the source is back', () => {
    const editor = createSnapshotRuntime();
    editor.dispatch({ type: 'removeNodes', nodeIds: ['mid'] });
    expect(editor.getWorkflowData().referenceSnapshots).toEqual([MID_SNAPSHOT]);

    editor.dispatch({
      type: 'addNode',
      node: {
        nodeId: 'mid',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Renamed Middle',
        inputs: [],
        outputs: [
          {
            id: 'text',
            key: 'text',
            type: FlowNodeOutputTypeEnum.source,
            valueType: WorkflowIOValueTypeEnum.string,
            label: 'Renamed Text'
          }
        ]
      }
    });

    // 来源恢复后读实时元数据，出站也不再带这条快照
    expect(editor.getField(query)?.references[0]).toEqual(
      expect.objectContaining({ sourceLabel: 'Renamed Middle', outputLabel: 'Renamed Text' })
    );
    expect(editor.getWorkflowData().referenceSnapshots).toEqual([]);
  });

  it('keeps snapshot cache reads isolated across restore, undo, redo and export', () => {
    const editor = createSnapshotRuntime();
    editor.dispatch({ type: 'removeNodes', nodeIds: ['mid'] });
    expect(editor.getWorkflowData().referenceSnapshots).toEqual([MID_SNAPSHOT]);

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
    expect(editor.getWorkflowData().referenceSnapshots).toEqual([]);

    expect(editor.undo().ok).toBe(true);
    expect(editor.getWorkflowData().referenceSnapshots).toEqual([MID_SNAPSHOT]);

    expect(editor.redo().ok).toBe(true);
    expect(editor.getWorkflowData().referenceSnapshots).toEqual([]);
  });

  it('drops the snapshot from the export once the last consumer is gone', () => {
    const editor = createSnapshotRuntime();
    editor.dispatch({ type: 'removeNodes', nodeIds: ['mid'] });

    // 还剩一个 consumer：快照保留
    editor.dispatch({ type: 'updateField', ...query, value: [] });
    const withOneConsumer = editor.getWorkflowData();
    expect(withOneConsumer.referenceSnapshots).toEqual([MID_SNAPSHOT]);
    expectNoOrphanSnapshots(withOneConsumer);

    // consumer 全部消失：出站时被剔除，不留孤立索引
    editor.dispatch({ type: 'updateField', ...extraQuery, value: [] });
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

  it('does not let snapshot cache writes change an undoable document', () => {
    const editor = createSnapshotRuntime();
    editor.dispatch({ type: 'removeNodes', nodeIds: ['mid'] });

    // 先命中快照缓存，再恢复来源；旧实现会直接 delete 历史文档共享的 Map。
    expect(editor.getField(query)?.references[0]).toEqual(
      expect.objectContaining({ code: 'invalid_reference', ...MID_SNAPSHOT })
    );
    editor.dispatch({
      type: 'addNode',
      node: {
        nodeId: 'mid',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Middle',
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
      }
    });

    expect(editor.undo().ok).toBe(true);
    expect(editor.getField(query)?.references[0]).toEqual(
      expect.objectContaining({ code: 'invalid_reference', ...MID_SNAPSHOT })
    );
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

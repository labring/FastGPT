// adapter handle 行为测试：节点句柄的 updateNode 提交语义与失败路径。
import { describe, expect, it, vi } from 'vitest';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';
import { hydrateRuntime } from '@/web/core/workflow/editor/codec';
import { createWorkflowEditorAdapter } from '@/web/core/workflow/editor/react/workflowEditorAdapter';

const t = ((key: string) => key) as never;

const createStoreWorkflow = () => ({
  nodes: [
    {
      nodeId: 'start',
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      name: 'Start',
      position: { x: 0, y: 0 },
      inputs: [],
      outputs: [{ id: NodeOutputKeyEnum.userChatInput, key: NodeOutputKeyEnum.userChatInput }]
    },
    {
      nodeId: 'answer',
      flowNodeType: FlowNodeTypeEnum.answerNode,
      name: 'Answer',
      position: { x: 100, y: 0 },
      inputs: [
        {
          key: 'extraText',
          renderTypeList: ['input'],
          valueType: 'string',
          label: 'Extra',
          value: 'before'
        }
      ],
      outputs: []
    }
  ],
  edges: [
    {
      source: 'start',
      target: 'answer',
      sourceHandle: getHandleId('start', 'source', NodeOutputKeyEnum.userChatInput),
      targetHandle: 'answer-target-left'
    }
  ],
  chatConfig: {}
});

describe('WorkflowNodeHandle.updateNode', () => {
  it('submits the whole record array but records the diff per field', () => {
    const runtime = hydrateRuntime({ input: createStoreWorkflow(), t });
    const adapter = createWorkflowEditorAdapter(runtime);
    const handle = adapter.getNodeSnapshot('answer')!;
    const inputs = handle.data.inputs as FlowNodeInputItemType[];
    expect(inputs.length).toBeGreaterThan(1);

    // 完整数组提交：只改其中一条记录的 value，其余原样回传。
    const nextInputs = inputs.map((input, index) =>
      index === 0 ? { ...input, value: 'changed' } : input
    );
    const res = handle.updateNode(() => ({ inputs: nextInputs }));

    expect(res.ok).toBe(true);
    expect(res.change?.changedRecords.fieldIds).toEqual([
      { nodeId: 'answer', key: inputs[0].key, kind: 'input' }
    ]);
    expect(res.change?.changedRecords.nodeIds).toEqual(['answer']);
    expect((runtime.getNode('answer')!.inputs as FlowNodeInputItemType[])[0].value).toBe('changed');

    adapter.dispose();
    runtime.dispose();
  });

  it('skips history when the submitted array equals the document', () => {
    const runtime = hydrateRuntime({ input: createStoreWorkflow(), t });
    const adapter = createWorkflowEditorAdapter(runtime);
    const handle = adapter.getNodeSnapshot('answer')!;

    const res = handle.updateNode((current) => ({ inputs: current.inputs }));

    expect(res.ok).toBe(true);
    expect(res.change).toBeUndefined();
    expect(runtime.getHistory().canUndo).toBe(false);

    adapter.dispose();
    runtime.dispose();
  });

  it('commits disconnectEdges and the patch as a single undoable transaction', () => {
    const runtime = hydrateRuntime({ input: createStoreWorkflow(), t });
    const adapter = createWorkflowEditorAdapter(runtime);
    const handle = adapter.getNodeSnapshot('answer')!;
    const undoCount = runtime.getHistory().undoCount;

    // 删除/替换输出字段时连线要和 patch 同事务消失，否则撤销要按两下。
    const res = handle.updateNode(() => ({ name: 'Renamed' }), {
      disconnectEdges: [{ index: 0 }]
    });

    expect(res.ok).toBe(true);
    expect(runtime.getWorkflow().edges).toHaveLength(0);
    expect(runtime.getNode('answer')!.name).toBe('Renamed');
    expect(runtime.getHistory().undoCount).toBe(undoCount + 1);

    runtime.undo();
    expect(runtime.getWorkflow().edges).toHaveLength(1);
    expect(runtime.getNode('answer')!.name).toBe('Answer');

    adapter.dispose();
    runtime.dispose();
  });

  it('batches standalone edge disconnects into one history entry', () => {
    const runtime = hydrateRuntime({ input: createStoreWorkflow(), t });
    const adapter = createWorkflowEditorAdapter(runtime);
    const undoCount = runtime.getHistory().undoCount;

    const res = adapter.getWorkflowSnapshot().disconnectEdges([{ index: 0 }]);

    expect(res.ok).toBe(true);
    expect(runtime.getHistory().undoCount).toBe(undoCount + 1);
    expect(runtime.getWorkflow().edges).toHaveLength(0);

    runtime.undo();
    expect(runtime.getWorkflow().edges).toHaveLength(1);

    adapter.dispose();
    runtime.dispose();
  });

  it('returns not_found for a missing node and drops the handle', () => {
    const runtime = hydrateRuntime({ input: createStoreWorkflow(), t });
    const adapter = createWorkflowEditorAdapter(runtime);

    expect(adapter.getNodeSnapshot('missing')).toBeUndefined();

    const handle = adapter.getNodeSnapshot('answer')!;
    const removeRes = adapter.getWorkflowSnapshot().removeNodes(['answer']);
    expect(removeRes.ok).toBe(true);

    // 节点删除后旧句柄仍可调用，但 Runtime 拒绝写入且不产生历史。
    const undoCount = runtime.getHistory().undoCount;
    const staleRes = handle.updateNode(() => ({ name: 'Renamed' }));
    expect(staleRes.ok).toBe(false);
    expect(staleRes.error?.code).toBe('not_found');
    expect(runtime.getHistory().undoCount).toBe(undoCount);
    expect(adapter.getNodeSnapshot('answer')).toBeUndefined();

    adapter.dispose();
    runtime.dispose();
  });
});

describe('WorkflowEditorAdapter issue updates', () => {
  it('notifies field and reference consumers when issue-only state changes', () => {
    let issueListener: ((update: { nodeIds: string[] }) => void) | undefined;
    let field = { nodeId: 'consumer', key: 'input', kind: 'input', data: { references: [] } };
    const runtime = {
      getWorkflow: () => ({ nodes: [], edges: [], chatConfig: {} }),
      getGraphQueries: () => ({}),
      subscribe: () => () => undefined,
      subscribeIssues: (listener: (update: { nodeIds: string[] }) => void) => {
        issueListener = listener;
        return () => undefined;
      },
      getField: () => field,
      getReferenceOptions: () => []
    } as unknown as WorkflowRuntimePort;
    const adapter = createWorkflowEditorAdapter(runtime);
    const fieldListener = vi.fn();
    const referenceListener = vi.fn();

    adapter.subscribeField({ nodeId: 'consumer', fieldKey: 'input', kind: 'input' }, fieldListener);
    adapter.subscribeReferenceOptions(referenceListener);

    field = {
      ...field,
      data: { references: [{ code: 'valid' }] }
    };
    issueListener?.({ nodeIds: ['source'] });

    expect(fieldListener).toHaveBeenCalledTimes(1);
    expect(referenceListener).toHaveBeenCalledTimes(1);
    adapter.dispose();
  });
});

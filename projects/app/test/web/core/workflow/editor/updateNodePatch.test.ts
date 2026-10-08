import { describe, expect, it } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { createWorkflowEditor } from '@fastgpt/global/core/workflow/editor/runtime/runtime';
import { createWorkflowEditorAdapter } from '@/web/core/workflow/editor/react/workflowEditorAdapter';

/** 两个可编辑引用输入的最小节点：复现同一节点多行同时整表回写 inputs 的场景。 */
const createAdapter = () => {
  const runtime = createWorkflowEditor({
    nodes: [
      {
        nodeId: 'code',
        flowNodeType: FlowNodeTypeEnum.code,
        name: 'Code',
        inputs: ['fieldA', 'fieldB'].map((key) => ({
          key,
          label: key,
          canEdit: true,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          valueType: WorkflowIOValueTypeEnum.arrayString,
          value: [['source', key]]
        })),
        outputs: []
      }
    ],
    edges: [],
    chatConfig: {}
  });
  return { runtime, adapter: createWorkflowEditorAdapter(runtime, false) };
};

const getLabel = (runtime: ReturnType<typeof createWorkflowEditor>, key: string) =>
  runtime.getNode('code')?.inputs.find((input) => input.key === key)?.label;

describe('updateNode patch', () => {
  it('resolves the patch against the record at dispatch time', () => {
    const { runtime, adapter } = createAdapter();
    const handle = adapter.getNodeSnapshot('code')!;

    // 同一 tick 内多行都整表回写：patch 在派发瞬间求值，两笔改动都要落地，不互相覆盖。
    handle.updateNode((current) => ({
      inputs: current.inputs.map((input) =>
        input.key === 'fieldA' ? { ...input, label: 'A1' } : input
      )
    }));
    handle.updateNode((current) => ({
      inputs: current.inputs.map((input) =>
        input.key === 'fieldB' ? { ...input, label: 'B1' } : input
      )
    }));

    expect(getLabel(runtime, 'fieldA')).toBe('A1');
    expect(getLabel(runtime, 'fieldB')).toBe('B1');
    // 整表回写没有波及未命中的字段值
    expect(runtime.getNode('code')?.inputs.find((i) => i.key === 'fieldA')?.value).toEqual([
      ['source', 'fieldA']
    ]);

    adapter.dispose();
  });
});

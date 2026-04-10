import { describe, it, expect } from 'vitest';
import { resolveArrayItemValueType } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/Loop/parallelRun.utils';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';

// ─── helpers ──────────────────────────────────────────────────────────────────

const makeNode = (
  nodeId: string,
  outputs: { id: string; valueType: WorkflowIOValueTypeEnum }[]
): RuntimeNodeItemType => ({
  nodeId,
  name: nodeId,
  avatar: '',
  flowNodeType: 'chatNode' as any,
  showStatus: false,
  isEntry: false,
  inputs: [],
  outputs: outputs.map((o) => ({
    id: o.id,
    key: o.id,
    label: '',
    type: 'static' as any,
    valueType: o.valueType
  }))
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parallelRun.utils', () => {
  // ────────────────────────────────────────────────────────────────────────────
  describe('resolveArrayItemValueType', () => {
    const getNodeById = (id: string) => nodes.find((n) => n.nodeId === id);

    const nodes: RuntimeNodeItemType[] = [
      makeNode('node-string', [{ id: 'out1', valueType: WorkflowIOValueTypeEnum.arrayString }]),
      makeNode('node-object', [{ id: 'out2', valueType: WorkflowIOValueTypeEnum.arrayObject }])
    ];

    it('引用到 arrayString 输出 → 返回 string', () => {
      const result = resolveArrayItemValueType({
        arrayReferenceValue: [['node-string', 'out1']],
        nodeIds: ['node-string'],
        globalVariables: [],
        getNodeById
      });
      expect(result).toBe(WorkflowIOValueTypeEnum.string);
    });

    it('引用到 arrayObject 输出 → 返回 object', () => {
      const result = resolveArrayItemValueType({
        arrayReferenceValue: [['node-object', 'out2']],
        nodeIds: ['node-object'],
        globalVariables: [],
        getNodeById
      });
      expect(result).toBe(WorkflowIOValueTypeEnum.object);
    });

    it('空引用 / undefined → 返回 any', () => {
      const result = resolveArrayItemValueType({
        arrayReferenceValue: undefined,
        nodeIds: [],
        globalVariables: [],
        getNodeById
      });
      expect(result).toBe(WorkflowIOValueTypeEnum.any);
    });

    it('引用到不存在的节点 → 返回 any', () => {
      const result = resolveArrayItemValueType({
        arrayReferenceValue: [['non-existent', 'out']],
        nodeIds: ['non-existent'],
        globalVariables: [],
        getNodeById
      });
      expect(result).toBe(WorkflowIOValueTypeEnum.any);
    });
  });
});

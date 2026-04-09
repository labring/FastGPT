import { describe, it, expect } from 'vitest';
import {
  resolveParallelConcurrency,
  resolveArrayItemValueType,
  validateConcurrencyInput
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/Loop/parallelRun.utils';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';

// ─── helpers ──────────────────────────────────────────────────────────────────

const makeInput = (key: string, value?: any): FlowNodeInputItemType => ({
  key,
  renderTypeList: [],
  valueType: WorkflowIOValueTypeEnum.any,
  label: '',
  value
});

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
  describe('resolveParallelConcurrency', () => {
    it('inputs 里没有 parallelRunMaxConcurrency → 默认 5', () => {
      const inputs: FlowNodeInputItemType[] = [];
      expect(resolveParallelConcurrency(inputs, 10)).toBe(5);
    });

    it('有合法值 3，env 10 → 返回 3', () => {
      const inputs: FlowNodeInputItemType[] = [
        makeInput(NodeInputKeyEnum.parallelRunMaxConcurrency, 3)
      ];
      expect(resolveParallelConcurrency(inputs, 10)).toBe(3);
    });

    it('值 > envMax → clamp 到 envMax', () => {
      const inputs: FlowNodeInputItemType[] = [
        makeInput(NodeInputKeyEnum.parallelRunMaxConcurrency, 100)
      ];
      expect(resolveParallelConcurrency(inputs, 5)).toBe(5);
    });

    it('值 < 1 → 返回 1', () => {
      const inputs: FlowNodeInputItemType[] = [
        makeInput(NodeInputKeyEnum.parallelRunMaxConcurrency, 0)
      ];
      expect(resolveParallelConcurrency(inputs, 10)).toBe(1);
    });

    it('envMax undefined → 使用默认上限 10', () => {
      const inputs: FlowNodeInputItemType[] = [
        makeInput(NodeInputKeyEnum.parallelRunMaxConcurrency, 7)
      ];
      expect(resolveParallelConcurrency(inputs, undefined)).toBe(7);
    });

    it('小数 1.5 → 向下取整为 1', () => {
      const inputs: FlowNodeInputItemType[] = [
        makeInput(NodeInputKeyEnum.parallelRunMaxConcurrency, 1.5)
      ];
      expect(resolveParallelConcurrency(inputs, 10)).toBe(1);
    });

    it('小数 10.9 → 向下取整为 10', () => {
      const inputs: FlowNodeInputItemType[] = [
        makeInput(NodeInputKeyEnum.parallelRunMaxConcurrency, 10.9)
      ];
      expect(resolveParallelConcurrency(inputs, 20)).toBe(10);
    });

    it('envMax=3（<5）→ 用户输入 5 被 clamp 到 3（尊重管理员配置）', () => {
      const inputs: FlowNodeInputItemType[] = [
        makeInput(NodeInputKeyEnum.parallelRunMaxConcurrency, 5)
      ];
      expect(resolveParallelConcurrency(inputs, 3)).toBe(3);
    });

    it('envMax=150（>100）→ 压缩到 100', () => {
      const inputs: FlowNodeInputItemType[] = [
        makeInput(NodeInputKeyEnum.parallelRunMaxConcurrency, 120)
      ];
      expect(resolveParallelConcurrency(inputs, 150)).toBe(100);
    });
  });

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

  // ────────────────────────────────────────────────────────────────────────────
  describe('validateConcurrencyInput', () => {
    it('正数 ≤ envMax → valid=true', () => {
      const result = validateConcurrencyInput(5, 10);
      expect(result.valid).toBe(true);
    });

    it('等于 envMax → valid=true', () => {
      const result = validateConcurrencyInput(10, 10);
      expect(result.valid).toBe(true);
    });

    it('超过 envMax → valid=false，clamped=envMax', () => {
      const result = validateConcurrencyInput(20, 10);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.clamped).toBe(10);
      }
    });

    it('负数 → valid=false', () => {
      const result = validateConcurrencyInput(-1, 10);
      expect(result.valid).toBe(false);
    });

    it('非数字（字符串）→ valid=false', () => {
      const result = validateConcurrencyInput('abc', 10);
      expect(result.valid).toBe(false);
    });

    it('字符串数字（"5"）→ valid=true（修复：不应被拒绝）', () => {
      const result = validateConcurrencyInput('5', 10);
      expect(result.valid).toBe(true);
    });

    it('0 → valid=false', () => {
      const result = validateConcurrencyInput(0, 10);
      expect(result.valid).toBe(false);
    });

    it('小数 1.5 → valid=false，clamped=1', () => {
      const result = validateConcurrencyInput(1.5, 10);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.clamped).toBe(1);
      }
    });

    it('小数 10.9 → valid=false，clamped=10', () => {
      const result = validateConcurrencyInput(10.9, 20);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.clamped).toBe(10);
      }
    });
  });
});

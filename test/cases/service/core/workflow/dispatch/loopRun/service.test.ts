import { describe, it, expect } from 'vitest';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  extractFinishedNodeIds,
  hasLoopRunBreakChild,
  injectLoopRunStart,
  isLoopBreakHit,
  pickCustomOutputInputs,
  readCustomOutputSnapshot
} from '@fastgpt/service/core/workflow/dispatch/loopRun/service';

// ─── helpers ──────────────────────────────────────────────────────────────────

const makeInput = (
  override: Partial<FlowNodeInputItemType> & { key: string }
): FlowNodeInputItemType => ({
  renderTypeList: [],
  valueType: 'any' as any,
  label: '',
  ...override
});

const makeNode = (
  nodeId: string,
  flowNodeType: FlowNodeTypeEnum,
  opts: {
    inputs?: { key: string; value?: any }[];
    outputs?: { id: string; key: string; value?: any }[];
    isEntry?: boolean;
  } = {}
): RuntimeNodeItemType => ({
  nodeId,
  name: nodeId,
  avatar: '',
  flowNodeType,
  showStatus: false,
  isEntry: opts.isEntry ?? false,
  inputs: (opts.inputs ?? []).map((i) => makeInput({ key: i.key, value: i.value })),
  outputs: (opts.outputs ?? []).map((o) => ({
    id: o.id,
    key: o.key,
    label: '',
    type: 'static' as any,
    valueType: 'any' as any,
    value: o.value
  }))
});

const makeResponse = (override: Partial<ChatHistoryItemResType>): ChatHistoryItemResType =>
  ({
    nodeId: 'n',
    moduleType: FlowNodeTypeEnum.chatNode,
    moduleName: 'n',
    ...override
  }) as ChatHistoryItemResType;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('loopRun/service', () => {
  describe('pickCustomOutputInputs', () => {
    const makeDynamicOutput = (key: string): FlowNodeOutputItemType => ({
      id: key,
      key,
      label: key,
      type: FlowNodeOutputTypeEnum.dynamic,
      valueType: 'any' as any
    });

    it('只返回同时满足 canEdit=true 且存在 dynamic output 镜像的 input', () => {
      const inputs: FlowNodeInputItemType[] = [
        makeInput({ key: 'staticInput' }),
        makeInput({ key: 'userField1', canEdit: true }),
        makeInput({ key: 'userField2', canEdit: true }),
        makeInput({ key: 'anotherStatic' })
      ];
      const outputs = [makeDynamicOutput('userField1'), makeDynamicOutput('userField2')];
      const result = pickCustomOutputInputs(inputs, outputs);
      expect(result.map((i) => i.key)).toEqual(['userField1', 'userField2']);
    });

    it('空输入列表返回空数组', () => {
      expect(pickCustomOutputInputs([], [])).toEqual([]);
    });

    it('无任何 canEdit 返回空数组', () => {
      const inputs = [makeInput({ key: 'a' }), makeInput({ key: 'b' })];
      expect(pickCustomOutputInputs(inputs, [])).toEqual([]);
    });

    it('canEdit 为 true 但没有对应 dynamic output → 排除（避免未来 canEdit 配置项误混入）', () => {
      const inputs: FlowNodeInputItemType[] = [
        makeInput({ key: 'configField', canEdit: true }),
        makeInput({ key: 'outputField', canEdit: true })
      ];
      const outputs = [makeDynamicOutput('outputField')];
      const result = pickCustomOutputInputs(inputs, outputs);
      expect(result.map((i) => i.key)).toEqual(['outputField']);
    });

    it('output 类型非 dynamic（如 static / error）不计入镜像', () => {
      const inputs: FlowNodeInputItemType[] = [makeInput({ key: 'userField1', canEdit: true })];
      const outputs: FlowNodeOutputItemType[] = [
        {
          id: 'userField1',
          key: 'userField1',
          label: 'userField1',
          type: FlowNodeOutputTypeEnum.static,
          valueType: 'any' as any
        }
      ];
      expect(pickCustomOutputInputs(inputs, outputs)).toEqual([]);
    });
  });

  describe('extractFinishedNodeIds', () => {
    it('把 flowResponses 里带 nodeId 的项汇总到 Set', () => {
      const responses = [
        makeResponse({ nodeId: 'n1' }),
        makeResponse({ nodeId: 'n2' }),
        makeResponse({ nodeId: 'n1' }) // 重复
      ];
      const result = extractFinishedNodeIds(responses);
      expect(result).toEqual(new Set(['n1', 'n2']));
    });

    it('空数组返回空 Set', () => {
      expect(extractFinishedNodeIds([])).toEqual(new Set());
    });
  });

  describe('readCustomOutputSnapshot', () => {
    const nodeA = makeNode('A', FlowNodeTypeEnum.chatNode, {
      outputs: [{ id: 'outA', key: 'outA', value: 'valueFromA' }]
    });
    const nodeB = makeNode('B', FlowNodeTypeEnum.chatNode, {
      outputs: [{ id: 'outB', key: 'outB', value: 'valueFromB' }]
    });

    it('成功轮（不传 finishedNodeIds）- 所有字段读取引用值', () => {
      const customOutputInputs: FlowNodeInputItemType[] = [
        makeInput({ key: 'a', canEdit: true, value: ['A', 'outA'] }),
        makeInput({ key: 'b', canEdit: true, value: ['B', 'outB'] })
      ];
      const snapshot = readCustomOutputSnapshot({
        customOutputInputs,
        runtimeNodes: [nodeA, nodeB],
        variables: {}
      });
      expect(snapshot).toEqual({ a: 'valueFromA', b: 'valueFromB' });
    });

    it('失败轮 - 目标节点未在 finishedNodeIds → undefined；在集合内 → 正常读取', () => {
      const customOutputInputs: FlowNodeInputItemType[] = [
        makeInput({ key: 'a', canEdit: true, value: ['A', 'outA'] }),
        makeInput({ key: 'b', canEdit: true, value: ['B', 'outB'] })
      ];
      const snapshot = readCustomOutputSnapshot({
        customOutputInputs,
        runtimeNodes: [nodeA, nodeB],
        variables: {},
        finishedNodeIds: new Set(['A']) // 只有 A 跑过
      });
      expect(snapshot).toEqual({ a: 'valueFromA', b: undefined });
    });

    it('失败轮 - 全空 finishedNodeIds → 全部 undefined', () => {
      const customOutputInputs: FlowNodeInputItemType[] = [
        makeInput({ key: 'a', canEdit: true, value: ['A', 'outA'] })
      ];
      const snapshot = readCustomOutputSnapshot({
        customOutputInputs,
        runtimeNodes: [nodeA],
        variables: {},
        finishedNodeIds: new Set()
      });
      expect(snapshot).toEqual({ a: undefined });
    });

    it('全局变量引用 VARIABLE_NODE_ID 不受 finishedNodeIds 过滤', () => {
      const customOutputInputs: FlowNodeInputItemType[] = [
        makeInput({ key: 'g', canEdit: true, value: ['VARIABLE_NODE_ID', 'globalKey'] })
      ];
      const snapshot = readCustomOutputSnapshot({
        customOutputInputs,
        runtimeNodes: [],
        variables: { globalKey: 'globalValue' },
        finishedNodeIds: new Set()
      });
      expect(snapshot).toEqual({ g: 'globalValue' });
    });

    it('空声明列表 → 空快照', () => {
      const snapshot = readCustomOutputSnapshot({
        customOutputInputs: [],
        runtimeNodes: [],
        variables: {}
      });
      expect(snapshot).toEqual({});
    });

    it('引用循环体外的节点 - 不在 childrenNodeIdList 内 → 跳过 finishedNodeIds 过滤', () => {
      // A: 循环体外的节点（如 代码运行#3），其 output 在迭代中被 变量更新 追加写入
      // B: 循环体内跑过的节点
      const customOutputInputs: FlowNodeInputItemType[] = [
        makeInput({ key: 'a', canEdit: true, value: ['A', 'outA'] }),
        makeInput({ key: 'b', canEdit: true, value: ['B', 'outB'] })
      ];
      const snapshot = readCustomOutputSnapshot({
        customOutputInputs,
        runtimeNodes: [nodeA, nodeB],
        variables: {},
        finishedNodeIds: new Set(['B']), // 只有 B（循环体内）跑过
        childrenNodeIdList: ['B'] // A 在循环体外
      });
      expect(snapshot).toEqual({ a: 'valueFromA', b: 'valueFromB' });
    });

    it('引用循环体内跳过的节点 - 在 childrenNodeIdList 内但未跑 → undefined', () => {
      const customOutputInputs: FlowNodeInputItemType[] = [
        makeInput({ key: 'a', canEdit: true, value: ['A', 'outA'] }),
        makeInput({ key: 'b', canEdit: true, value: ['B', 'outB'] })
      ];
      const snapshot = readCustomOutputSnapshot({
        customOutputInputs,
        runtimeNodes: [nodeA, nodeB],
        variables: {},
        finishedNodeIds: new Set(['B']),
        childrenNodeIdList: ['A', 'B'] // 都在循环体内，A 本轮未跑
      });
      expect(snapshot).toEqual({ a: undefined, b: 'valueFromB' });
    });
  });

  describe('injectLoopRunStart', () => {
    const makeLoopStartNode = () =>
      makeNode('start1', FlowNodeTypeEnum.loopRunStart, {
        inputs: [
          { key: NodeInputKeyEnum.loopRunMode },
          { key: NodeInputKeyEnum.nestedStartInput },
          { key: NodeInputKeyEnum.nestedStartIndex }
        ]
      });

    it('array 模式 - 注入 item + index（0-based）并 mark entry', () => {
      const startNode = makeLoopStartNode();
      const otherNode = makeNode('other', FlowNodeTypeEnum.chatNode);

      injectLoopRunStart({
        nodes: [startNode, otherNode],
        childrenNodeIdList: ['start1', 'other'],
        mode: LoopRunModeEnum.array,
        item: 'hello',
        index: 2,
        iteration: 3
      });

      expect(startNode.isEntry).toBe(true);
      const inputs = Object.fromEntries(startNode.inputs.map((i) => [i.key, i.value]));
      expect(inputs[NodeInputKeyEnum.loopRunMode]).toBe(LoopRunModeEnum.array);
      expect(inputs[NodeInputKeyEnum.nestedStartInput]).toBe('hello');
      expect(inputs[NodeInputKeyEnum.nestedStartIndex]).toBe(2);
      // 非 loopRunStart 节点不被标记
      expect(otherNode.isEntry).toBe(false);
    });

    it('conditional 模式 - 注入 iteration（1-based），item 为 undefined', () => {
      const startNode = makeLoopStartNode();
      injectLoopRunStart({
        nodes: [startNode],
        childrenNodeIdList: ['start1'],
        mode: LoopRunModeEnum.conditional,
        iteration: 5
      });
      const inputs = Object.fromEntries(startNode.inputs.map((i) => [i.key, i.value]));
      expect(inputs[NodeInputKeyEnum.loopRunMode]).toBe(LoopRunModeEnum.conditional);
      expect(inputs[NodeInputKeyEnum.nestedStartInput]).toBeUndefined();
      expect(inputs[NodeInputKeyEnum.nestedStartIndex]).toBe(5);
    });

    it('不在 childrenNodeIdList 内的 loopRunStart 节点不被触达', () => {
      const startNode = makeLoopStartNode(); // nodeId = 'start1'
      injectLoopRunStart({
        nodes: [startNode],
        childrenNodeIdList: ['other'],
        mode: LoopRunModeEnum.array,
        item: 'x',
        index: 0,
        iteration: 1
      });
      expect(startNode.isEntry).toBe(false);
      // inputs 原状
      const inputs = Object.fromEntries(startNode.inputs.map((i) => [i.key, i.value]));
      expect(inputs[NodeInputKeyEnum.nestedStartInput]).toBeUndefined();
    });
  });

  describe('hasLoopRunBreakChild', () => {
    it('childrenNodeIdList 内有 loopRunBreak 节点 → true', () => {
      const nodes = [
        makeNode('loopRun', FlowNodeTypeEnum.loopRun),
        makeNode('break1', FlowNodeTypeEnum.loopRunBreak),
        makeNode('chat1', FlowNodeTypeEnum.chatNode)
      ];
      expect(hasLoopRunBreakChild(nodes, ['break1', 'chat1'])).toBe(true);
    });

    it('childrenNodeIdList 内无 loopRunBreak 节点 → false', () => {
      const nodes = [
        makeNode('loopRun', FlowNodeTypeEnum.loopRun),
        makeNode('chat1', FlowNodeTypeEnum.chatNode)
      ];
      expect(hasLoopRunBreakChild(nodes, ['chat1'])).toBe(false);
    });

    it('loopRunBreak 存在但不在 childrenNodeIdList → false', () => {
      const nodes = [
        makeNode('loopRun', FlowNodeTypeEnum.loopRun),
        makeNode('break1', FlowNodeTypeEnum.loopRunBreak), // 属于别的 loopRun
        makeNode('chat1', FlowNodeTypeEnum.chatNode)
      ];
      expect(hasLoopRunBreakChild(nodes, ['chat1'])).toBe(false);
    });

    it('空 childrenNodeIdList → false', () => {
      const nodes = [makeNode('break1', FlowNodeTypeEnum.loopRunBreak)];
      expect(hasLoopRunBreakChild(nodes, [])).toBe(false);
    });
  });

  describe('isLoopBreakHit', () => {
    it('含 loopRunBreak moduleType 响应 → true', () => {
      const responses = [
        makeResponse({ moduleType: FlowNodeTypeEnum.chatNode }),
        makeResponse({ moduleType: FlowNodeTypeEnum.loopRunBreak })
      ];
      expect(isLoopBreakHit(responses)).toBe(true);
    });

    it('无 loopRunBreak → false', () => {
      expect(isLoopBreakHit([makeResponse({ moduleType: FlowNodeTypeEnum.chatNode })])).toBe(false);
    });

    it('空数组 → false', () => {
      expect(isLoopBreakHit([])).toBe(false);
    });
  });
});

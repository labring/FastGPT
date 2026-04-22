import { describe, it, expect, vi } from 'vitest';
import { getNestedEndOutputValue } from '@fastgpt/service/core/workflow/dispatch/loop/service';
import {
  collectResponseFeedbacks,
  injectNestedStartInputs,
  pushSubWorkflowUsage
} from '@fastgpt/service/core/workflow/dispatch/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { DispatchFlowResponse } from '@fastgpt/service/core/workflow/dispatch/type';

// ─── helpers ──────────────────────────────────────────────────────────────────

const makeNode = (
  nodeId: string,
  flowNodeType: FlowNodeTypeEnum,
  inputs: { key: string; value?: any }[] = [],
  isEntry = false
): RuntimeNodeItemType => ({
  nodeId,
  name: nodeId,
  avatar: '',
  flowNodeType,
  showStatus: false,
  isEntry,
  inputs: inputs.map((i) => ({
    key: i.key,
    renderTypeList: [],
    valueType: 'any',
    label: '',
    value: i.value
  })),
  outputs: []
});

const makeDispatchFlowResponse = (
  overrides: Partial<DispatchFlowResponse> = {}
): DispatchFlowResponse => ({
  flowResponses: [],
  flowUsages: [],
  debugResponse: { storeNodes: [], storeEdges: [] } as any,
  workflowInteractiveResponse: undefined,
  [DispatchNodeResponseKeyEnum.toolResponses]: [] as any,
  [DispatchNodeResponseKeyEnum.assistantResponses]: [],
  [DispatchNodeResponseKeyEnum.runTimes]: 1,
  [DispatchNodeResponseKeyEnum.newVariables]: {},
  durationSeconds: 0,
  ...overrides
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('loop/service', () => {
  // ────────────────────────────────────────────────────────────────────────────
  describe('injectNestedStartInputs', () => {
    const makeStartNode = () =>
      makeNode('start', FlowNodeTypeEnum.nestedStart, [
        { key: NodeInputKeyEnum.nestedStartInput, value: '' },
        { key: NodeInputKeyEnum.nestedStartIndex, value: 0 }
      ]);

    it('nestedStart 节点的 isEntry 被设为 true', () => {
      const nodes = [makeStartNode()];
      injectNestedStartInputs({ nodes, childrenNodeIdList: ['start'], item: 'item-a', index: 0 });
      expect(nodes[0].isEntry).toBe(true);
    });

    it('nestedStartInput 被设为传入的 item', () => {
      const nodes = [makeStartNode()];
      injectNestedStartInputs({ nodes, childrenNodeIdList: ['start'], item: 'hello', index: 0 });
      const val = nodes[0].inputs.find((i) => i.key === NodeInputKeyEnum.nestedStartInput)?.value;
      expect(val).toBe('hello');
    });

    it('nestedStartIndex 被设为 index + 1（1-based）', () => {
      const nodes = [makeStartNode()];
      injectNestedStartInputs({ nodes, childrenNodeIdList: ['start'], item: 'x', index: 2 });
      const val = nodes[0].inputs.find((i) => i.key === NodeInputKeyEnum.nestedStartIndex)?.value;
      expect(val).toBe(3);
    });

    it('index=0 时，nestedStartIndex 被设为 1', () => {
      const nodes = [makeStartNode()];
      injectNestedStartInputs({ nodes, childrenNodeIdList: ['start'], item: 'x', index: 0 });
      const val = nodes[0].inputs.find((i) => i.key === NodeInputKeyEnum.nestedStartIndex)?.value;
      expect(val).toBe(1);
    });

    it('不在 childrenNodeIdList 中的节点不被修改', () => {
      const outsideNode = makeNode('outside', FlowNodeTypeEnum.chatNode, [], false);
      const nodes = [outsideNode];
      injectNestedStartInputs({ nodes, childrenNodeIdList: ['start'], item: 'x', index: 0 });
      expect(nodes[0].isEntry).toBe(false);
    });

    it('只有 nestedStart 类型的子节点被设为 entry', () => {
      const startNode = makeStartNode();
      const endNode = makeNode('end', FlowNodeTypeEnum.nestedEnd);
      const nodes = [startNode, endNode];
      injectNestedStartInputs({ nodes, childrenNodeIdList: ['start', 'end'], item: 'x', index: 0 });
      expect(nodes[0].isEntry).toBe(true);
      expect(nodes[1].isEntry).toBe(false); // nestedEnd 不是 entry
    });

    it('直接 mutate 原数组（不克隆）', () => {
      const nodes = [makeStartNode()];
      const ref = nodes[0];
      injectNestedStartInputs({ nodes, childrenNodeIdList: ['start'], item: 'mutated', index: 0 });
      // 同一引用被修改
      expect(ref.isEntry).toBe(true);
      expect(ref.inputs.find((i) => i.key === NodeInputKeyEnum.nestedStartInput)?.value).toBe(
        'mutated'
      );
    });

    it('item 为对象时正确注入', () => {
      const nodes = [makeStartNode()];
      const item = { id: 1, name: 'test' };
      injectNestedStartInputs({ nodes, childrenNodeIdList: ['start'], item, index: 0 });
      const val = nodes[0].inputs.find((i) => i.key === NodeInputKeyEnum.nestedStartInput)?.value;
      expect(val).toBe(item);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('getNestedEndOutputValue', () => {
    it('存在 nestedEnd 节点 → 返回其 loopOutputValue', () => {
      const response = makeDispatchFlowResponse({
        flowResponses: [
          { moduleType: FlowNodeTypeEnum.nestedEnd, loopOutputValue: 'result', id: 'end' } as any
        ]
      });
      expect(getNestedEndOutputValue(response)).toBe('result');
    });

    it('loopOutputValue 为 null → 返回 null', () => {
      const response = makeDispatchFlowResponse({
        flowResponses: [
          { moduleType: FlowNodeTypeEnum.nestedEnd, loopOutputValue: null, id: 'end' } as any
        ]
      });
      expect(getNestedEndOutputValue(response)).toBeNull();
    });

    it('无 nestedEnd 节点 → 返回 undefined', () => {
      const response = makeDispatchFlowResponse({
        flowResponses: [{ moduleType: FlowNodeTypeEnum.chatNode, id: 'llm' } as any]
      });
      expect(getNestedEndOutputValue(response)).toBeUndefined();
    });

    it('flowResponses 为空 → 返回 undefined', () => {
      const response = makeDispatchFlowResponse({ flowResponses: [] });
      expect(getNestedEndOutputValue(response)).toBeUndefined();
    });

    it('loopOutputValue 为数组时正确返回', () => {
      const arr = [1, 2, 3];
      const response = makeDispatchFlowResponse({
        flowResponses: [
          { moduleType: FlowNodeTypeEnum.nestedEnd, loopOutputValue: arr, id: 'end' } as any
        ]
      });
      expect(getNestedEndOutputValue(response)).toBe(arr);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('pushSubWorkflowUsage', () => {
    it('返回 flowUsages 中 totalPoints 之和', () => {
      const usagePush = vi.fn();
      const response = makeDispatchFlowResponse({
        flowUsages: [
          { totalPoints: 10, moduleName: 'a' } as any,
          { totalPoints: 5, moduleName: 'b' } as any
        ]
      });
      const pts = pushSubWorkflowUsage({ usagePush, response, name: 'myNode', iteration: 0 });
      expect(pts).toBe(15);
    });

    it('调用 usagePush 一次，参数包含 totalPoints 和正确的 moduleName', () => {
      const usagePush = vi.fn();
      const response = makeDispatchFlowResponse({
        flowUsages: [{ totalPoints: 7, moduleName: 'x' } as any]
      });
      pushSubWorkflowUsage({ usagePush, response, name: 'loopNode', iteration: 3 });
      expect(usagePush).toHaveBeenCalledOnce();
      expect(usagePush).toHaveBeenCalledWith([{ totalPoints: 7, moduleName: 'loopNode-3' }]);
    });

    it('flowUsages 为空时返回 0', () => {
      const usagePush = vi.fn();
      const response = makeDispatchFlowResponse({ flowUsages: [] });
      const pts = pushSubWorkflowUsage({ usagePush, response, name: 'node', iteration: 0 });
      expect(pts).toBe(0);
      expect(usagePush).toHaveBeenCalledWith([{ totalPoints: 0, moduleName: 'node-0' }]);
    });

    it('iteration 正确拼接到 moduleName', () => {
      const usagePush = vi.fn();
      const response = makeDispatchFlowResponse({
        flowUsages: [{ totalPoints: 1, moduleName: 'z' } as any]
      });
      pushSubWorkflowUsage({ usagePush, response, name: 'parallel', iteration: 99 });
      expect(usagePush).toHaveBeenCalledWith([{ totalPoints: 1, moduleName: 'parallel-99' }]);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('collectResponseFeedbacks', () => {
    it('有 customFeedbacks → 追加到 target', () => {
      const target: string[] = ['existing'];
      const response = makeDispatchFlowResponse({
        [DispatchNodeResponseKeyEnum.customFeedbacks]: ['fb1', 'fb2']
      });
      const result = collectResponseFeedbacks(response, target);
      expect(result).toEqual(['existing', 'fb1', 'fb2']);
      expect(result).toBe(target); // 返回同一引用
    });

    it('customFeedbacks 为空数组 → target 不变', () => {
      const target: string[] = ['existing'];
      const response = makeDispatchFlowResponse({
        [DispatchNodeResponseKeyEnum.customFeedbacks]: []
      });
      collectResponseFeedbacks(response, target);
      expect(target).toEqual(['existing']);
    });

    it('无 customFeedbacks 字段 → target 不变', () => {
      const target: string[] = ['existing'];
      const response = makeDispatchFlowResponse();
      collectResponseFeedbacks(response, target);
      expect(target).toEqual(['existing']);
    });

    it('target 为空时正确追加', () => {
      const target: string[] = [];
      const response = makeDispatchFlowResponse({
        [DispatchNodeResponseKeyEnum.customFeedbacks]: ['only-one']
      });
      collectResponseFeedbacks(response, target);
      expect(target).toEqual(['only-one']);
    });

    it('多次调用累积正确', () => {
      const target: string[] = [];
      const r1 = makeDispatchFlowResponse({
        [DispatchNodeResponseKeyEnum.customFeedbacks]: ['a']
      });
      const r2 = makeDispatchFlowResponse({
        [DispatchNodeResponseKeyEnum.customFeedbacks]: ['b', 'c']
      });
      collectResponseFeedbacks(r1, target);
      collectResponseFeedbacks(r2, target);
      expect(target).toEqual(['a', 'b', 'c']);
    });
  });
});

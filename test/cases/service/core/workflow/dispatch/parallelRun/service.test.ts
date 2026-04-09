import { describe, it, expect } from 'vitest';
import {
  clampParallelConcurrency,
  buildTaskRuntimeContext,
  cloneTaskVariables,
  parseTaskResponse,
  parseTaskError,
  aggregateParallelResults,
  type ParallelTaskResult
} from '@fastgpt/service/core/workflow/dispatch/parallelRun/service';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, ParallelRunStatusEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
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

const makeEdge = (source: string, target: string): StoreEdgeItemType => ({
  source,
  sourceHandle: `${source}-right`,
  target,
  targetHandle: `${target}-left`
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

describe('parallelRun/service', () => {
  // ────────────────────────────────────────────────────────────────────────────
  describe('clampParallelConcurrency', () => {
    it('用户未指定（undefined）→ 默认 5', () => {
      expect(clampParallelConcurrency(undefined, 10)).toBe(5);
    });

    it('用户 3，env 10 → 返回 3', () => {
      expect(clampParallelConcurrency(3, 10)).toBe(3);
    });

    it('用户 100，env 10 → clamp 到 10', () => {
      expect(clampParallelConcurrency(100, 10)).toBe(10);
    });

    it('用户 0 → 返回 1（最小值）', () => {
      expect(clampParallelConcurrency(0, 10)).toBe(1);
    });

    it('用户 -5 → 返回 1（最小值）', () => {
      expect(clampParallelConcurrency(-5, 10)).toBe(1);
    });

    it('env 未指定（undefined）→ 默认 env 上限为 10', () => {
      expect(clampParallelConcurrency(3, undefined)).toBe(3);
    });

    it('两者都未指定 → 默认 5', () => {
      expect(clampParallelConcurrency(undefined, undefined)).toBe(5);
    });

    it('用户 5，env 5 → 返回 5（等于上限）', () => {
      expect(clampParallelConcurrency(5, 5)).toBe(5);
    });

    it('用户 1.5 → 向下取整为 1', () => {
      expect(clampParallelConcurrency(1.5, 10)).toBe(1);
    });

    it('用户 10.9 → 向下取整为 10', () => {
      expect(clampParallelConcurrency(10.9, 20)).toBe(10);
    });

    it('env 上限 3（<5）→ 自动提升到最小 5', () => {
      expect(clampParallelConcurrency(5, 3)).toBe(5);
    });

    it('env 上限 150（>100）→ 压缩到 100', () => {
      expect(clampParallelConcurrency(120, 150)).toBe(100);
    });

    it('用户 NaN → 使用默认值 5', () => {
      expect(clampParallelConcurrency(NaN, 10)).toBe(5);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('buildTaskRuntimeContext', () => {
    const childrenNodeIdList = ['start', 'end'];

    const startNode = makeNode('start', FlowNodeTypeEnum.nestedStart, [
      { key: NodeInputKeyEnum.nestedStartInput, value: '' },
      { key: NodeInputKeyEnum.nestedStartIndex, value: 0 }
    ]);
    const endNode = makeNode('end', FlowNodeTypeEnum.nestedEnd);
    const outsideNode = makeNode('outside', FlowNodeTypeEnum.chatNode);

    const runtimeNodes = [startNode, endNode, outsideNode];
    const storeEdges: StoreEdgeItemType[] = [makeEdge('start', 'end')];

    it('克隆后修改 taskRuntimeNodes 不影响原始 runtimeNodes（深拷贝验证）', () => {
      const { taskRuntimeNodes } = buildTaskRuntimeContext({
        runtimeNodes,
        runtimeEdges: storeEdges,
        childrenNodeIdList,
        item: 'test',
        index: 0
      });

      // 修改克隆节点
      taskRuntimeNodes[0].name = 'MUTATED';

      // 原始节点不受影响
      expect(runtimeNodes[0].name).toBe('start');
    });

    it('nestedStart 子节点 isEntry 被设为 true', () => {
      const { taskRuntimeNodes } = buildTaskRuntimeContext({
        runtimeNodes,
        runtimeEdges: storeEdges,
        childrenNodeIdList,
        item: 'hello',
        index: 0
      });

      const clonedStart = taskRuntimeNodes.find((n) => n.nodeId === 'start');
      expect(clonedStart?.isEntry).toBe(true);
    });

    it('nestedStart 的 nestedStartInput 被设为当前 item', () => {
      const { taskRuntimeNodes } = buildTaskRuntimeContext({
        runtimeNodes,
        runtimeEdges: storeEdges,
        childrenNodeIdList,
        item: 'my-item',
        index: 0
      });

      const clonedStart = taskRuntimeNodes.find((n) => n.nodeId === 'start');
      const inputVal = clonedStart?.inputs.find(
        (i) => i.key === NodeInputKeyEnum.nestedStartInput
      )?.value;
      expect(inputVal).toBe('my-item');
    });

    it('nestedStart 的 nestedStartIndex 被设为 index + 1（1-based）', () => {
      const { taskRuntimeNodes } = buildTaskRuntimeContext({
        runtimeNodes,
        runtimeEdges: storeEdges,
        childrenNodeIdList,
        item: 'x',
        index: 2
      });

      const clonedStart = taskRuntimeNodes.find((n) => n.nodeId === 'start');
      const indexVal = clonedStart?.inputs.find(
        (i) => i.key === NodeInputKeyEnum.nestedStartIndex
      )?.value;
      expect(indexVal).toBe(3); // index 2 → 2+1=3
    });

    it('不在 childrenNodeIdList 中的节点不被设为 entry', () => {
      const { taskRuntimeNodes } = buildTaskRuntimeContext({
        runtimeNodes,
        runtimeEdges: storeEdges,
        childrenNodeIdList,
        item: 'x',
        index: 0
      });

      const outsideClone = taskRuntimeNodes.find((n) => n.nodeId === 'outside');
      expect(outsideClone?.isEntry).toBe(false);
    });

    it('runtimeEdges 经 storeEdges2RuntimeEdges 转换后独立克隆（修改不影响原始）', () => {
      const { taskRuntimeEdges } = buildTaskRuntimeContext({
        runtimeNodes,
        runtimeEdges: storeEdges,
        childrenNodeIdList,
        item: 'x',
        index: 0
      });

      // 转换后应有 status 字段
      expect(taskRuntimeEdges[0]).toHaveProperty('status', 'waiting');

      // 修改克隆边不影响原始 storeEdges
      (taskRuntimeEdges[0] as any).source = 'MUTATED';
      expect(storeEdges[0].source).toBe('start');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('cloneTaskVariables (TC0034 — 外部变量隔离)', () => {
    it('返回值与原对象不是同一引用', () => {
      const original = { foo: 'bar', count: 1 };
      const cloned = cloneTaskVariables(original);

      expect(cloned).not.toBe(original);
      expect(cloned).toEqual(original);
    });

    it('修改克隆对象的顶层 key 不影响原对象', () => {
      const original = { foo: 'bar', count: 1 };
      const cloned = cloneTaskVariables(original);

      cloned.foo = 'MUTATED';
      cloned.count = 999;

      expect(original.foo).toBe('bar');
      expect(original.count).toBe(1);
    });

    it('在克隆对象新增 key 不影响原对象', () => {
      const original: Record<string, any> = { existing: 1 };
      const cloned = cloneTaskVariables(original);

      cloned.newKey = 'added';

      expect(original.newKey).toBeUndefined();
      expect(Object.keys(original)).toEqual(['existing']);
    });

    it('空变量表 → 克隆为空对象', () => {
      const original = {};
      const cloned = cloneTaskVariables(original);

      expect(cloned).toEqual({});
      expect(cloned).not.toBe(original);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('parseTaskResponse', () => {
    it('无 interactive，有 nestedEnd → success=true，data 为 loopOutputValue', () => {
      const response = makeDispatchFlowResponse({
        flowResponses: [
          {
            moduleType: FlowNodeTypeEnum.nestedEnd,
            loopOutputValue: 'result-data',
            id: 'end'
          } as any
        ]
      });

      const result = parseTaskResponse({ index: 0, response });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('result-data');
        expect(result.index).toBe(0);
      }
    });

    it('有 workflowInteractiveResponse → success=false（静默忽略）', () => {
      const response = makeDispatchFlowResponse({
        workflowInteractiveResponse: { type: 'formInput', params: {} } as any
      });

      const result = parseTaskResponse({ index: 1, response });
      expect(result.success).toBe(false);
      expect(result.index).toBe(1);
    });

    it('无 nestedEnd 响应 → success=true，data=undefined', () => {
      const response = makeDispatchFlowResponse({
        flowResponses: [{ moduleType: FlowNodeTypeEnum.chatNode, id: 'llm' } as any]
      });

      const result = parseTaskResponse({ index: 2, response });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeUndefined();
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('parseTaskError', () => {
    it('包装 Error 对象 → success=false, error=message', () => {
      const err = new Error('something went wrong');
      const result = parseTaskError(0, err);

      expect(result.success).toBe(false);
      expect(result.index).toBe(0);
      if (!result.success) {
        expect(result.error).toBe('something went wrong');
      }
    });

    it('包装字符串 → success=false, error=string', () => {
      const result = parseTaskError(1, 'string error');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('string error');
      }
    });

    it('包装 undefined → success=false, error 为字符串', () => {
      const result = parseTaskError(2, undefined);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(typeof result.error).toBe('string');
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('aggregateParallelResults', () => {
    const successResult0: ParallelTaskResult = {
      success: true,
      index: 0,
      data: 'data-0',
      response: makeDispatchFlowResponse({
        flowUsages: [{ totalPoints: 10, moduleName: 'llm' } as any],
        [DispatchNodeResponseKeyEnum.assistantResponses]: [
          { type: 'text', text: { content: 'hi' } } as any
        ],
        [DispatchNodeResponseKeyEnum.customFeedbacks]: ['fb1'],
        flowResponses: [{ id: 'n0' } as any]
      })
    };

    const failResult1: ParallelTaskResult = { success: false, index: 1, error: 'task failed' };

    const successResult2: ParallelTaskResult = {
      success: true,
      index: 2,
      data: 'data-2',
      response: makeDispatchFlowResponse({
        flowUsages: [{ totalPoints: 5, moduleName: 'llm' } as any],
        [DispatchNodeResponseKeyEnum.assistantResponses]: [],
        flowResponses: [{ id: 'n2' } as any]
      })
    };

    it('全部成功 → filteredArray 全部 + fullDetail 全 success', () => {
      const { filteredArray, fullDetail } = aggregateParallelResults([
        successResult0,
        successResult2
      ]);

      expect(filteredArray).toHaveLength(2);
      expect(filteredArray).toEqual(['data-0', 'data-2']);
      expect(fullDetail.every((d) => d.success)).toBe(true);
    });

    it('混合成功/失败 → filteredArray 只含成功项（顺序保留），fullDetail 保留全部', () => {
      const { filteredArray, fullDetail } = aggregateParallelResults([
        successResult0,
        failResult1,
        successResult2
      ]);

      expect(filteredArray).toEqual(['data-0', 'data-2']);
      expect(fullDetail).toHaveLength(3);
      expect(fullDetail[1].success).toBe(false);
      expect(fullDetail[1].error).toBe('task failed');
    });

    it('全部失败 → filteredArray=[]，fullDetail 全 failed', () => {
      const { filteredArray, fullDetail } = aggregateParallelResults([failResult1]);

      expect(filteredArray).toHaveLength(0);
      expect(fullDetail).toHaveLength(1);
      expect(fullDetail[0].success).toBe(false);
    });

    it('totalPoints 累加正确', () => {
      const { totalPoints } = aggregateParallelResults([
        successResult0,
        failResult1,
        successResult2
      ]);

      expect(totalPoints).toBe(15); // 10 + 0 + 5
    });

    it('customFeedbacks 合并（只含成功任务）', () => {
      const { customFeedbacks } = aggregateParallelResults([
        successResult0,
        failResult1,
        successResult2
      ]);

      expect(customFeedbacks).toEqual(['fb1']);
    });

    it('responseDetails / assistantResponses 按顺序累加', () => {
      const { responseDetails, assistantResponses } = aggregateParallelResults([
        successResult0,
        successResult2
      ]);

      expect(responseDetails).toHaveLength(2); // 1 from index 0, 1 from index 2
      expect(assistantResponses).toHaveLength(1); // only index 0 has assistant response
    });

    it('全部成功 → fullResultsArray 每项 {success:true, message:"", data}', () => {
      const { fullResultsArray } = aggregateParallelResults([successResult0, successResult2]);

      expect(fullResultsArray).toEqual([
        { success: true, message: '', data: 'data-0' },
        { success: true, message: '', data: 'data-2' }
      ]);
    });

    it('混合成功/失败 → fullResultsArray 按输入顺序，失败项 data=null、message=错误信息', () => {
      const { fullResultsArray } = aggregateParallelResults([
        successResult0,
        failResult1,
        successResult2
      ]);

      expect(fullResultsArray).toHaveLength(3);
      expect(fullResultsArray[0]).toEqual({ success: true, message: '', data: 'data-0' });
      expect(fullResultsArray[1]).toEqual({ success: false, message: 'task failed', data: null });
      expect(fullResultsArray[2]).toEqual({ success: true, message: '', data: 'data-2' });
    });

    it('全部失败 → fullResultsArray 全为 {success:false, data:null}', () => {
      const { fullResultsArray } = aggregateParallelResults([failResult1]);

      expect(fullResultsArray).toEqual([{ success: false, message: 'task failed', data: null }]);
    });

    it('失败项 error=undefined → message 为空字符串', () => {
      const failNoError: ParallelTaskResult = { success: false, index: 0 };
      const { fullResultsArray } = aggregateParallelResults([failNoError]);

      expect(fullResultsArray[0]).toEqual({ success: false, message: '', data: null });
    });

    it('全部成功 → status = allSuccess', () => {
      const { status } = aggregateParallelResults([successResult0, successResult2]);

      expect(status).toBe(ParallelRunStatusEnum.allSuccess);
    });

    it('混合成功/失败 → status = partialFailure', () => {
      const { status } = aggregateParallelResults([successResult0, failResult1, successResult2]);

      expect(status).toBe(ParallelRunStatusEnum.partialFailure);
    });

    it('全部失败 → status = allFailure', () => {
      const { status } = aggregateParallelResults([failResult1]);

      expect(status).toBe(ParallelRunStatusEnum.allFailure);
    });

    it('乱序输入 → 输出按输入 index 排序', () => {
      // 故意以 index 2 → 0 的顺序传入
      const { filteredArray, fullResultsArray } = aggregateParallelResults([
        successResult2,
        successResult0
      ]);

      expect(filteredArray).toEqual(['data-0', 'data-2']);
      expect(fullResultsArray.map((r) => r.data)).toEqual(['data-0', 'data-2']);
    });
  });
});

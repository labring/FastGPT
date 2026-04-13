import { describe, it, expect } from 'vitest';
import {
  clampParallelConcurrency,
  buildTaskRuntimeContext,
  parseTaskResponse,
  parseTaskError,
  aggregateParallelResults,
  type ParallelTaskResult
} from '@fastgpt/service/core/workflow/dispatch/parallelRun/service';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, ParallelRunStatusEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
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

const makeEdge = (source: string, target: string): RuntimeEdgeItemType => ({
  source,
  sourceHandle: `${source}-right`,
  target,
  targetHandle: `${target}-left`,
  status: 'waiting'
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

    it('env 上限 3（<5）→ 用户输入 5 被 clamp 到 3（尊重管理员配置）', () => {
      expect(clampParallelConcurrency(5, 3)).toBe(3);
    });

    it('env 上限 150 → 用户 120 被 clamp 到 120（完全依赖 env）', () => {
      expect(clampParallelConcurrency(120, 150)).toBe(120);
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
    const runtimeEdges: RuntimeEdgeItemType[] = [makeEdge('start', 'end')];

    it('克隆后修改 taskRuntimeNodes 不影响原始 runtimeNodes（深拷贝验证）', () => {
      const { taskRuntimeNodes } = buildTaskRuntimeContext({
        runtimeNodes,
        runtimeEdges,
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
        runtimeEdges,
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
        runtimeEdges,
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
        runtimeEdges,
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

    it('容器外的节点不被包含在 taskRuntimeNodes 中（仅克隆子节点）', () => {
      const { taskRuntimeNodes } = buildTaskRuntimeContext({
        runtimeNodes,
        runtimeEdges,
        childrenNodeIdList,
        item: 'x',
        index: 0
      });

      // 'outside' 不在 childrenNodeIdList 中，不应出现在克隆结果里
      const outsideClone = taskRuntimeNodes.find((n) => n.nodeId === 'outside');
      expect(outsideClone).toBeUndefined();
      // 只有 childrenNodeIdList 内的节点被克隆
      expect(taskRuntimeNodes.map((n) => n.nodeId).sort()).toEqual(['end', 'start']);
    });

    it('runtimeEdges 独立克隆（修改克隆边不影响原始）', () => {
      const { taskRuntimeEdges } = buildTaskRuntimeContext({
        runtimeNodes,
        runtimeEdges,
        childrenNodeIdList,
        item: 'x',
        index: 0
      });

      // 克隆后应保留 status 字段
      expect(taskRuntimeEdges[0]).toHaveProperty('status', 'waiting');

      // 修改克隆边不影响原始 runtimeEdges
      (taskRuntimeEdges[0] as any).source = 'MUTATED';
      expect(runtimeEdges[0].source).toBe('start');
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

    it('无 nestedEnd 响应 → success=false（子工作流未到达终点）', () => {
      const response = makeDispatchFlowResponse({
        flowResponses: [{ moduleType: FlowNodeTypeEnum.chatNode, id: 'llm' } as any]
      });

      const result = parseTaskResponse({ index: 2, response });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('parallel_task_not_reach_end');
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
      totalPoints: 10,
      response: makeDispatchFlowResponse({
        flowUsages: [{ totalPoints: 10, moduleName: 'llm' } as any],
        [DispatchNodeResponseKeyEnum.assistantResponses]: [
          { type: 'text', text: { content: 'hi' } } as any
        ],
        [DispatchNodeResponseKeyEnum.customFeedbacks]: ['fb1'],
        flowResponses: [{ id: 'n0' } as any]
      })
    };

    const failResult1: ParallelTaskResult = {
      success: false,
      index: 1,
      error: 'task failed',
      totalPoints: 0
    };

    const successResult2: ParallelTaskResult = {
      success: true,
      index: 2,
      data: 'data-2',
      totalPoints: 5,
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
      const failNoError: ParallelTaskResult = { success: false, index: 0, totalPoints: 0 };
      const { fullResultsArray } = aggregateParallelResults([failNoError]);

      expect(fullResultsArray[0]).toEqual({ success: false, message: '', data: null });
    });

    it('全部成功 → status = success', () => {
      const { status } = aggregateParallelResults([successResult0, successResult2]);

      expect(status).toBe(ParallelRunStatusEnum.success);
    });

    it('混合成功/失败 → status = partial_success', () => {
      const { status } = aggregateParallelResults([successResult0, failResult1, successResult2]);

      expect(status).toBe(ParallelRunStatusEnum.partial_success);
    });

    it('全部失败 → status = failed', () => {
      const { status } = aggregateParallelResults([failResult1]);

      expect(status).toBe(ParallelRunStatusEnum.failed);
    });

    it('重试场景：totalPoints 反映所有 attempt 的累计值，而非仅最后一次', () => {
      // 模拟一个任务重试了 2 次：每次消耗 8 pts，totalPoints 已在调用方累计为 24
      const retriedResult: ParallelTaskResult = {
        success: true,
        index: 0,
        data: 'retry-data',
        totalPoints: 24, // 3 attempts × 8 pts
        response: makeDispatchFlowResponse({
          // response 里的 flowUsages 只反映最后一次 attempt（8 pts）
          flowUsages: [{ totalPoints: 8, moduleName: 'llm' } as any],
          flowResponses: [{ id: 'n0' } as any]
        })
      };

      const { totalPoints } = aggregateParallelResults([retriedResult]);
      // 应等于 totalPoints 字段（24），而非从 flowUsages 重算的 8
      expect(totalPoints).toBe(24);
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

import { describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import type { WorkflowVariableStateLike } from '@fastgpt/service/core/workflow/types/runtime';
import {
  createNodeSummary,
  createWorkflowRuntimeSummary
} from '@fastgpt/service/core/workflow/dispatch/utils/summary';

const { childRun } = vi.hoisted(() => ({ childRun: vi.fn() }));

// 只替换子工作流边界，保留生产 batchRun、并发钳制、快照 getter 和结果汇总。
vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({ runWorkflow: childRun }));

import { dispatchParallelRun } from '@fastgpt/service/core/workflow/dispatch/parallelRun/runParallelRun';

/** 每个子任务独占变量副本，保证真实并行调度不依赖共享可变状态。 */
const createVariableState = (values: Record<string, unknown> = {}): WorkflowVariableStateLike => ({
  get: (key) => values[key],
  set: async (key, value) => {
    values[key] = value;
    return value;
  },
  getStoreValue: (key) => values[key],
  getFileStoreValueByRuntimeUrl: () => undefined,
  toRuntimeRecord: () => ({ ...values }),
  toStoreRecord: () => ({ ...values }),
  clone: () => createVariableState({ ...values })
});

describe('dispatchParallelRun runtime concurrency', () => {
  it('uses the current instance cap in the real task pool and preserves every result', async () => {
    const previousConfig = global.systemInstanceConfig;

    try {
      for (const cap of [1, 2]) {
        global.systemInstanceConfig = resolveSystemInstanceConfig({
          performance: { workflow: { maxLoopTimes: 10, parallelMaxConcurrency: cap } }
        });
        let active = 0;
        let peak = 0;
        let started = 0;
        const releaseTasks: Array<() => void> = [];
        childRun.mockReset();
        childRun.mockImplementation(async () => {
          const index = started++;
          active++;
          peak = Math.max(peak, active);
          await new Promise<void>((resolve) => {
            releaseTasks[index] = resolve;
          });
          active--;
          return {
            flowUsages: [],
            debugResponse: {
              memoryEdges: [],
              memoryNodes: [],
              entryNodeIds: [],
              nodeResponses: {}
            },
            toolResponse: null,
            assistantResponses: [],
            runTimes: 1,
            newVariables: {},
            workflowRuntimeSummary: {
              ...createWorkflowRuntimeSummary(),
              hasNestedEnd: true,
              nestedEndOutput: index
            },
            durationSeconds: 0
          };
        });
        const node = {
          nodeId: 'parallel',
          name: 'Parallel',
          avatar: '',
          flowNodeType: FlowNodeTypeEnum.parallelRun,
          showStatus: true,
          isEntry: true,
          inputs: [],
          outputs: []
        };
        const pending = dispatchParallelRun({
          params: {
            loopInputArray: ['first', 'second', 'third'],
            [NodeInputKeyEnum.childrenNodeIdList]: [],
            [NodeInputKeyEnum.parallelRunMaxConcurrency]: 10,
            [NodeInputKeyEnum.parallelRunMaxRetryTimes]: 0
          },
          node,
          runtimeNodes: [node],
          runtimeNodesMap: new Map([[node.nodeId, node]]),
          runtimeEdges: [],
          variableState: createVariableState(),
          usagePush: vi.fn(),
          nodeSummary: createNodeSummary(),
          checkIsStopping: () => false
        } as any);

        // 任务必须真正停在子运行里；没有释放前，只能领取实例配置允许的数量。
        await vi.waitFor(() => expect(started).toBe(cap));
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(started).toBe(cap);
        expect(active).toBe(cap);
        expect(peak).toBe(cap);

        for (let index = 0; index < 3; index++) {
          await vi.waitFor(() => expect(releaseTasks[index]).toBeTypeOf('function'));
          releaseTasks[index]();
        }
        const result = await pending;
        expect(childRun).toHaveBeenCalledTimes(3);
        expect(peak).toBe(cap);
        expect(active).toBe(0);
        expect(result.data[NodeOutputKeyEnum.parallelSuccessResults]).toEqual([0, 1, 2]);
        expect(result.data[NodeOutputKeyEnum.parallelFullResults]).toEqual([
          { success: true, message: '', data: 0 },
          { success: true, message: '', data: 1 },
          { success: true, message: '', data: 2 }
        ]);
      }
    } finally {
      global.systemInstanceConfig = previousConfig;
    }
  });
});

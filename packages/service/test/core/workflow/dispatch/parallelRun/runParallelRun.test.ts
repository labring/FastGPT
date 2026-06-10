import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  ParallelRunStatusEnum
} from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { DispatchFlowResponse } from '@fastgpt/service/core/workflow/dispatch/type';
import { summarizeRuntimeNodeResponses } from '@fastgpt/service/core/workflow/dispatch/utils';

const runWorkflowMock = vi.fn();

vi.mock('@fastgpt/global/common/system/utils', () => ({
  batchRun: async (list: any[], handler: (item: any, index: number) => Promise<any>) =>
    Promise.all(list.map((item, index) => handler(item, index)))
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  runWorkflow: (args: any) => runWorkflowMock(args)
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    WORKFLOW_MAX_LOOP_TIMES: 10,
    WORKFLOW_PARALLEL_MAX_CONCURRENCY: 3
  }
}));

import { dispatchParallelRun } from '@fastgpt/service/core/workflow/dispatch/parallelRun/runParallelRun';

const makeNode = (): RuntimeNodeItemType =>
  ({
    nodeId: 'parallelRun1',
    name: 'ParallelRun',
    avatar: '',
    flowNodeType: FlowNodeTypeEnum.parallelRun,
    showStatus: true,
    isEntry: true,
    catchError: false,
    inputs: [],
    outputs: []
  }) as RuntimeNodeItemType;

const makeResponseItem = (
  nodeId: string,
  override: Partial<ChatHistoryItemResType> = {}
): ChatHistoryItemResType =>
  ({
    id: nodeId,
    nodeId,
    moduleType: FlowNodeTypeEnum.chatNode,
    moduleName: nodeId,
    ...override
  }) as ChatHistoryItemResType;

const makeDispatchFlowResponse = (
  overrides: Partial<DispatchFlowResponse> & { nodeResponses?: ChatHistoryItemResType[] } = {}
): DispatchFlowResponse => {
  const { nodeResponses = [], ...rest } = overrides;
  return {
    flowUsages: [],
    debugResponse: { memoryEdges: [], memoryNodes: [], entryNodeIds: [], nodeResponses: {} },
    workflowInteractiveResponse: undefined,
    [DispatchNodeResponseKeyEnum.toolResponse]: null,
    [DispatchNodeResponseKeyEnum.assistantResponses]: [],
    [DispatchNodeResponseKeyEnum.runTimes]: 1,
    [DispatchNodeResponseKeyEnum.newVariables]: {},
    runtimeNodeResponseSummary: summarizeRuntimeNodeResponses(undefined, nodeResponses),
    durationSeconds: 0,
    ...rest
  } as DispatchFlowResponse;
};

const makeVariableState = () =>
  ({
    clone: () => makeVariableState(),
    toRuntimeRecord: () => ({}),
    toStoreRecord: () => ({})
  }) as any;

const makeProps = (override: Record<string, any> = {}) => {
  const runtimeNodes = [makeNode()];
  const node = runtimeNodes[0];

  return {
    params: {
      loopInputArray: ['a'],
      [NodeInputKeyEnum.childrenNodeIdList]: [],
      [NodeInputKeyEnum.parallelRunMaxConcurrency]: 1,
      [NodeInputKeyEnum.parallelRunMaxRetryTimes]: 0
    },
    node,
    runtimeNodes,
    runtimeNodesMap: new Map(runtimeNodes.map((item) => [item.nodeId, item])),
    runtimeEdges: [],
    variableState: makeVariableState(),
    usagePush: vi.fn(),
    checkIsStopping: () => false,
    ...override
  } as any;
};

describe('dispatchParallelRun', () => {
  beforeEach(() => {
    runWorkflowMock.mockReset();
  });

  it('共用 nodeResponseWriter 时写入任务包装节点，父响应只保留轻量统计', async () => {
    const nodeResponseWriter = {
      recordWithParent: vi.fn().mockResolvedValue([])
    };
    runWorkflowMock.mockResolvedValue(
      makeDispatchFlowResponse({
        nodeResponses: [
          makeResponseItem('chatNode', { totalPoints: 2, childTotalPoints: 3 }),
          makeResponseItem('nestedEnd', {
            moduleType: FlowNodeTypeEnum.nestedEnd,
            totalPoints: 1,
            loopOutputValue: 'done'
          })
        ],
        flowUsages: [{ moduleName: 'parallel', totalPoints: 3 }] as any
      })
    );

    const result: any = await dispatchParallelRun(
      makeProps({
        nodeResponseWriter,
        nodeResponseParentId: 'parallel-parent-response'
      })
    );

    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];
    expect(result.data[NodeOutputKeyEnum.parallelSuccessResults]).toEqual(['done']);
    expect(result.data[NodeOutputKeyEnum.parallelStatus]).toBe(ParallelRunStatusEnum.success);
    expect(runWorkflowMock.mock.calls[0][0].nodeResponseParentId).toBe(
      'parallel-parent-response_task_0'
    );
    expect(nodeResponseWriter.recordWithParent).toHaveBeenCalledTimes(1);
    expect(nodeResponseWriter.recordWithParent.mock.calls[0][1]).toBe('parallel-parent-response');
    expect(nodeResponseWriter.recordWithParent.mock.calls[0][0][0]).toMatchObject({
      id: 'parallel-parent-response_task_0',
      childResponseCount: 2,
      childrenResponses: undefined
    });
    expect(
      nodeResponseWriter.recordWithParent.mock.calls[0][0][0].childTotalPoints
    ).toBeUndefined();
    expect(nodeResponse.totalPoints).toBe(3);
    expect(nodeResponse.childTotalPoints).toBeUndefined();
    expect(nodeResponse.parallelDetail).toBeUndefined();
  });

  it('重试成功时保留失败 attempt 详情并写入最终成功 attempt', async () => {
    const nodeResponseWriter = {
      recordWithParent: vi.fn().mockResolvedValue([])
    };
    runWorkflowMock
      .mockResolvedValueOnce(
        makeDispatchFlowResponse({
          nodeResponses: [
            makeResponseItem('failed-node', {
              id: 'failed-node-response',
              parentId: 'parallelRun1_task_0_attempt_0',
              error: 'failed'
            })
          ]
        })
      )
      .mockResolvedValueOnce(
        makeDispatchFlowResponse({
          nodeResponses: [
            makeResponseItem('chatNode', { totalPoints: 2 }),
            makeResponseItem('nestedEnd', {
              moduleType: FlowNodeTypeEnum.nestedEnd,
              totalPoints: 1,
              loopOutputValue: 'done'
            })
          ]
        })
      );

    const result: any = await dispatchParallelRun(
      makeProps({
        params: {
          loopInputArray: ['a'],
          [NodeInputKeyEnum.childrenNodeIdList]: [],
          [NodeInputKeyEnum.parallelRunMaxConcurrency]: 1,
          [NodeInputKeyEnum.parallelRunMaxRetryTimes]: 1
        },
        nodeResponseWriter,
        nodeResponseParentId: 'parallel-parent-response'
      })
    );

    expect(runWorkflowMock.mock.calls.map((call) => call[0].nodeResponseParentId)).toEqual([
      'parallel-parent-response_task_0_attempt_0',
      'parallel-parent-response_task_0_attempt_1'
    ]);
    expect(nodeResponseWriter.recordWithParent).toHaveBeenCalledTimes(2);
    expect(nodeResponseWriter.recordWithParent.mock.calls.map((call) => call[0][0].id)).toEqual([
      'parallel-parent-response_task_0_attempt_0',
      'parallel-parent-response_task_0_attempt_1'
    ]);
    expect(nodeResponseWriter.recordWithParent.mock.calls[0][0][0]).toMatchObject({
      id: 'parallel-parent-response_task_0_attempt_0',
      error: expect.any(String)
    });
    expect(nodeResponseWriter.recordWithParent.mock.calls[1][0][0]).toMatchObject({
      id: 'parallel-parent-response_task_0_attempt_1',
      loopOutputValue: 'done'
    });
    expect(result.data[NodeOutputKeyEnum.parallelSuccessResults]).toEqual(['done']);
  });

  it('无父 nodeResponseId 时保持旧的 nodeId 前缀', async () => {
    runWorkflowMock.mockResolvedValue(
      makeDispatchFlowResponse({
        nodeResponses: [
          makeResponseItem('nestedEnd', {
            moduleType: FlowNodeTypeEnum.nestedEnd,
            loopOutputValue: 'done'
          })
        ]
      })
    );

    await dispatchParallelRun(makeProps());

    expect(runWorkflowMock.mock.calls[0][0].nodeResponseParentId).toBe('parallelRun1_task_0');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
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

const makeVariableState = (runtimeVariables: Record<string, unknown> = {}) =>
  ({
    clone: vi.fn(() => makeVariableState(runtimeVariables)),
    get: vi.fn((key: string) => runtimeVariables[key]),
    set: vi.fn(async (key: string, value: unknown) => {
      runtimeVariables[key] = value;
      return value;
    }),
    getStoreValue: vi.fn((key: string) => runtimeVariables[key]),
    getFileStoreValueByRuntimeUrl: vi.fn(),
    toRuntimeRecord: () => ({ ...runtimeVariables }),
    toStoreRecord: () => ({ ...runtimeVariables })
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

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('任务包装节点独立计时，不累加子节点 runningTime', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValue(2250);
    const nodeResponseWriter = {
      recordWithParent: vi.fn().mockResolvedValue([])
    };
    runWorkflowMock.mockResolvedValue(
      makeDispatchFlowResponse({
        nodeResponses: [
          makeResponseItem('chatNode', { runningTime: 10 }),
          makeResponseItem('nestedEnd', {
            moduleType: FlowNodeTypeEnum.nestedEnd,
            runningTime: 20,
            loopOutputValue: 'done'
          })
        ]
      })
    );

    await dispatchParallelRun(
      makeProps({
        nodeResponseWriter,
        nodeResponseParentId: 'parallel-parent-response'
      })
    );

    expect(nodeResponseWriter.recordWithParent.mock.calls[0][0][0].runningTime).toBe(1.25);
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

  it('成功任务结束后把 clone 中的全局变量提交回父状态', async () => {
    const taskVariableState = makeVariableState({ count: 0 });
    const parentVariableState = makeVariableState({ count: 0 });
    const originalSet = parentVariableState.set;
    parentVariableState.clone = vi.fn(() => taskVariableState);
    parentVariableState.set = vi.fn((key: string, value: unknown) => originalSet(key, value));
    runWorkflowMock.mockImplementation(async (args: any) => {
      await args.variableState.set('count', 2);
      return makeDispatchFlowResponse({
        nodeResponses: [
          makeResponseItem('nestedEnd', {
            moduleType: FlowNodeTypeEnum.nestedEnd,
            loopOutputValue: 'done'
          })
        ]
      });
    });

    await dispatchParallelRun(
      makeProps({
        variableState: parentVariableState
      })
    );

    expect(parentVariableState.set).toHaveBeenCalledWith('count', 2);
    expect(parentVariableState.get('count')).toBe(2);
  });

  it('成功任务只提交实际变化变量，避免覆盖其他任务已写回的变量', async () => {
    const task0VariableState = makeVariableState({ first: 0, second: 0 });
    const task1VariableState = makeVariableState({ first: 0, second: 0 });
    const parentVariableState = makeVariableState({ first: 0, second: 0 });
    parentVariableState.clone = vi
      .fn()
      .mockReturnValueOnce(task0VariableState)
      .mockReturnValueOnce(task1VariableState);
    runWorkflowMock.mockImplementation(async (args: any) => {
      if (args.nodeResponseParentId.endsWith('_task_0')) {
        await args.variableState.set('first', 1);
      } else {
        await args.variableState.set('second', 2);
      }

      return makeDispatchFlowResponse({
        nodeResponses: [
          makeResponseItem('nestedEnd', {
            moduleType: FlowNodeTypeEnum.nestedEnd,
            loopOutputValue: 'done'
          })
        ]
      });
    });

    await dispatchParallelRun(
      makeProps({
        params: {
          loopInputArray: ['a', 'b'],
          [NodeInputKeyEnum.childrenNodeIdList]: [],
          [NodeInputKeyEnum.parallelRunMaxConcurrency]: 2,
          [NodeInputKeyEnum.parallelRunMaxRetryTimes]: 0
        },
        variableState: parentVariableState
      })
    );

    expect(parentVariableState.get('first')).toBe(1);
    expect(parentVariableState.get('second')).toBe(2);
  });

  it('成功任务会把变量更新写到外部节点的 output 同步回父运行态', async () => {
    runWorkflowMock.mockImplementation((args: any) => {
      const externalNode = args.runtimeNodes.find((node: any) => node.nodeId === 'externalText');
      externalNode.outputs[0].value = `updated-${args.nodeResponseParentId}`;
      if (unchangedExternalNode) {
        unchangedExternalNode.outputs[0].value = 'changed-by-sibling';
      }

      return Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [
            makeResponseItem('nestedEnd', {
              moduleType: FlowNodeTypeEnum.nestedEnd,
              loopOutputValue: 'done'
            })
          ]
        })
      );
    });
    const props = makeProps();
    props.runtimeNodes.push({
      nodeId: 'externalText',
      name: 'External Text',
      avatar: '',
      flowNodeType: FlowNodeTypeEnum.textEditor,
      showStatus: false,
      isEntry: false,
      catchError: false,
      inputs: [],
      outputs: [
        {
          id: 'text',
          key: 'text',
          label: 'text',
          type: FlowNodeOutputTypeEnum.static,
          valueType: 'string' as any,
          value: 'before'
        }
      ]
    });
    props.runtimeNodes.push({
      nodeId: 'unchangedExternal',
      name: 'Unchanged External',
      avatar: '',
      flowNodeType: FlowNodeTypeEnum.textEditor,
      showStatus: false,
      isEntry: false,
      catchError: false,
      inputs: [],
      outputs: [
        {
          id: 'text',
          key: 'text',
          label: 'text',
          type: FlowNodeOutputTypeEnum.static,
          valueType: 'string' as any,
          value: 'before'
        }
      ]
    });
    const unchangedExternalNode = props.runtimeNodes.find(
      (node: RuntimeNodeItemType) => node.nodeId === 'unchangedExternal'
    );

    await dispatchParallelRun(props);

    const externalNode = props.runtimeNodes.find(
      (node: RuntimeNodeItemType) => node.nodeId === 'externalText'
    );

    expect(externalNode?.outputs[0].value).toBe('updated-parallelRun1_task_0');
    expect(unchangedExternalNode?.outputs[0].value).toBe('changed-by-sibling');
  });

  it('失败任务不会把外部节点 output 更新同步回父运行态', async () => {
    runWorkflowMock.mockImplementation((args: any) => {
      const externalNode = args.runtimeNodes.find((node: any) => node.nodeId === 'externalText');
      externalNode.outputs[0].value = 'failed-update';

      return Promise.resolve(
        makeDispatchFlowResponse({
          nodeResponses: [
            makeResponseItem('failed-node', {
              error: 'failed'
            })
          ]
        })
      );
    });
    const props = makeProps();
    props.runtimeNodes.push({
      nodeId: 'externalText',
      name: 'External Text',
      avatar: '',
      flowNodeType: FlowNodeTypeEnum.textEditor,
      showStatus: false,
      isEntry: false,
      catchError: false,
      inputs: [],
      outputs: [
        {
          id: 'text',
          key: 'text',
          label: 'text',
          type: FlowNodeOutputTypeEnum.static,
          valueType: 'string' as any,
          value: 'before'
        }
      ]
    });

    await dispatchParallelRun(props);

    const externalNode = props.runtimeNodes.find(
      (node: RuntimeNodeItemType) => node.nodeId === 'externalText'
    );

    expect(externalNode?.outputs[0].value).toBe('before');
  });

  it('失败 attempt 不提交全局变量更新，重试成功后只提交成功 attempt 的更新', async () => {
    const failedClone = makeVariableState({ count: 0 });
    const successClone = makeVariableState({ count: 0 });
    const parentVariableState = makeVariableState({ count: 0 });
    const originalSet = parentVariableState.set;
    parentVariableState.clone = vi
      .fn()
      .mockReturnValueOnce(failedClone)
      .mockReturnValueOnce(successClone);
    parentVariableState.set = vi.fn((key: string, value: unknown) => originalSet(key, value));
    runWorkflowMock
      .mockImplementationOnce(async (args: any) => {
        await args.variableState.set('count', 1);
        return makeDispatchFlowResponse({
          nodeResponses: [
            makeResponseItem('failed-node', {
              error: 'failed'
            })
          ]
        });
      })
      .mockImplementationOnce(async (args: any) => {
        await args.variableState.set('count', 2);
        return makeDispatchFlowResponse({
          nodeResponses: [
            makeResponseItem('nestedEnd', {
              moduleType: FlowNodeTypeEnum.nestedEnd,
              loopOutputValue: 'done'
            })
          ]
        });
      });

    await dispatchParallelRun(
      makeProps({
        params: {
          loopInputArray: ['a'],
          [NodeInputKeyEnum.childrenNodeIdList]: [],
          [NodeInputKeyEnum.parallelRunMaxConcurrency]: 1,
          [NodeInputKeyEnum.parallelRunMaxRetryTimes]: 1
        },
        variableState: parentVariableState
      })
    );

    expect(parentVariableState.set).toHaveBeenCalledTimes(1);
    expect(parentVariableState.set).toHaveBeenCalledWith('count', 2);
    expect(parentVariableState.get('count')).toBe(2);
  });
});

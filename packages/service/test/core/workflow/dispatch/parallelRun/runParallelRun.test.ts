import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

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
import {
  createNodeSummary,
  createWorkflowRuntimeSummary,
  summarizeRuntimeNodeResponses
} from '@fastgpt/service/core/workflow/dispatch/utils/summary';

const runWorkflowMock = vi.fn();

vi.mock('@fastgpt/global/common/system/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/global/common/system/utils')>()),
  batchRun: async (list: any[], handler: (item: any, index: number) => Promise<any>) =>
    Promise.all(list.map((item, index) => handler(item, index)))
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  runWorkflow: (args: any) => runWorkflowMock(args)
}));

vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    ...actual,
    serviceEnv: {
      ...actual.serviceEnv,
      WORKFLOW_MAX_LOOP_TIMES: 10,
      WORKFLOW_PARALLEL_MAX_CONCURRENCY: 3
    }
  };
});

import { dispatchParallelRun } from '@fastgpt/service/core/workflow/dispatch/parallelRun/runParallelRun';
import { UserConfigError } from '@fastgpt/global/common/error/utils';

const createNodeResponseSinkMock = () => ({
  publish: vi.fn(async (inputs: Array<{ response: ChatHistoryItemResType; parentId?: string }>) =>
    inputs.map(({ response, parentId }) => ({
      ...response,
      ...(parentId && !response.parentId ? { parentId } : {})
    }))
  )
});

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
    workflowRuntimeSummary: summarizeRuntimeNodeResponses(undefined, nodeResponses),
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
    nodeSummary: createNodeSummary(),
    checkIsStopping: () => false,
    ...override
  } as any;
};

describe('dispatchParallelRun', () => {
  it.each([new Error('task state clone failed'), undefined])(
    'returns task-local exceptions to dispatch without logging or merging them: %s',
    async (error) => {
      const warn = vi.spyOn(getLogger(LogCategories.MODULE.WORKFLOW.DISPATCH), 'warn');
      warn.mockClear();
      const props = makeProps();
      props.params.loopInputArray = ['a', 'b'];
      props.variableState.clone.mockImplementation(() => {
        throw error;
      });
      try {
        const result = await dispatchParallelRun(props);
        expect(Object.hasOwn(result, 'rawError')).toBe(true);
        expect(result.rawError).toBe(error);
        expect(warn).not.toHaveBeenCalled();
        expect(Object.hasOwn(props.nodeSummary, 'error')).toBe(false);
        expect(runWorkflowMock).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    }
  );

  it('does not return an old task-local exception after a successful retry', async () => {
    const props = makeProps();
    props.params.parallelRunMaxRetryTimes = 1;
    props.variableState.clone.mockImplementationOnce(() => {
      throw new Error('transient state clone failure');
    });
    runWorkflowMock.mockResolvedValueOnce(
      makeDispatchFlowResponse({
        nodeResponses: [
          makeResponseItem('nestedEnd', {
            moduleType: FlowNodeTypeEnum.nestedEnd,
            loopOutputValue: 'recovered'
          })
        ]
      })
    );

    const result = await dispatchParallelRun(props);

    expect(props.variableState.clone).toHaveBeenCalledTimes(2);
    expect(Object.hasOwn(result, 'rawError')).toBe(false);
    expect(Object.hasOwn(props.nodeSummary, 'error')).toBe(false);
    expect(result.data?.[NodeOutputKeyEnum.parallelStatus]).toBe(ParallelRunStatusEnum.success);
    expect(result.data?.[NodeOutputKeyEnum.parallelSuccessResults]).toEqual(['recovered']);
  });

  it.each([false, true])(
    'aggregates child task status without promoting its raw exception: fails=%s',
    async (fails) => {
      const error = new UserConfigError('Invalid key');
      runWorkflowMock.mockResolvedValueOnce(
        makeDispatchFlowResponse({
          nodeResponses: [
            makeResponseItem(
              fails ? 'chatNode' : 'nestedEnd',
              fails
                ? { error: error.message }
                : { moduleType: FlowNodeTypeEnum.nestedEnd, loopOutputValue: 'done' }
            )
          ]
        })
      );
      const props = makeProps();
      const result = await dispatchParallelRun(props);
      expect(Object.hasOwn(result, 'rawError')).toBe(false);
      expect(Object.hasOwn(props.nodeSummary, 'error')).toBe(false);
      expect(result.data?.[NodeOutputKeyEnum.parallelStatus]).toBe(
        fails ? ParallelRunStatusEnum.failed : ParallelRunStatusEnum.success
      );
      if (fails) {
        expect(result.data?.[NodeOutputKeyEnum.parallelFullResults]).toMatchObject([
          { success: false, message: error.message }
        ]);
      }

      expect(result.responseData).not.toHaveProperty('error');
    }
  );

  beforeEach(() => {
    runWorkflowMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('共用 nodeResponseSink 时发布任务包装节点，父响应只保留轻量统计', async () => {
    const nodeResponseSink = createNodeResponseSinkMock();
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

    const props = makeProps({
      nodeResponseSink,
      nodeResponseParentId: 'parallel-parent-response'
    });
    const result: any = await dispatchParallelRun(props);

    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];
    expect(result.data[NodeOutputKeyEnum.parallelSuccessResults]).toEqual(['done']);
    expect(result.data[NodeOutputKeyEnum.parallelStatus]).toBe(ParallelRunStatusEnum.success);
    expect(result[DispatchNodeResponseKeyEnum.toolResponse]).toEqual(
      result.data[NodeOutputKeyEnum.parallelFullResults]
    );
    expect(runWorkflowMock.mock.calls[0][0].nodeResponseParentId).toBe(
      'parallel-parent-response_task_0'
    );
    expect(nodeResponseSink.publish).toHaveBeenCalledTimes(1);
    expect(nodeResponseSink.publish.mock.calls[0][0][0].parentId).toBe('parallel-parent-response');
    expect(nodeResponseSink.publish.mock.calls[0][0][0].response).toMatchObject({
      id: 'parallel-parent-response_task_0',
      childResponseCount: 2,
      childrenResponses: undefined
    });
    expect(nodeResponseSink.publish.mock.calls[0][0][0].response.childTotalPoints).toBeUndefined();
    expect(nodeResponseSink.publish.mock.calls[0][0][0].response.totalPoints).toBeUndefined();
    expect(nodeResponse.totalPoints).toBeUndefined();
    expect(props.nodeSummary.totalPoints).toBe(3);
    expect(nodeResponse.childTotalPoints).toBeUndefined();
    expect(nodeResponse.parallelDetail).toBeUndefined();
  });

  it('任务包装节点独立计时，不累加子节点 runningTime', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValue(2250);
    const nodeResponseSink = createNodeResponseSinkMock();
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
        nodeResponseSink,
        nodeResponseParentId: 'parallel-parent-response'
      })
    );

    expect(nodeResponseSink.publish.mock.calls[0][0][0].response.runningTime).toBe(1.25);
  });

  it('重试成功时保留失败 attempt 详情并写入最终成功 attempt', async () => {
    const nodeResponseSink = createNodeResponseSinkMock();
    runWorkflowMock
      .mockResolvedValueOnce(
        makeDispatchFlowResponse({
          workflowRuntimeSummary: {
            ...createWorkflowRuntimeSummary(),
            errorCount: 1,
            llmInputTokens: 11,
            llmOutputTokens: 2
          },
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
          workflowRuntimeSummary: {
            ...createWorkflowRuntimeSummary(),
            hasNestedEnd: true,
            nestedEndOutput: 'done',
            llmInputTokens: 23,
            llmOutputTokens: 5
          },
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

    const props = makeProps({
      params: {
        loopInputArray: ['a'],
        [NodeInputKeyEnum.childrenNodeIdList]: [],
        [NodeInputKeyEnum.parallelRunMaxConcurrency]: 1,
        [NodeInputKeyEnum.parallelRunMaxRetryTimes]: 1
      },
      nodeResponseSink,
      nodeResponseParentId: 'parallel-parent-response'
    });
    const result: any = await dispatchParallelRun(props);

    expect(runWorkflowMock.mock.calls.map((call) => call[0].nodeResponseParentId)).toEqual([
      'parallel-parent-response_task_0_attempt_0',
      'parallel-parent-response_task_0_attempt_1'
    ]);
    expect(nodeResponseSink.publish).toHaveBeenCalledTimes(2);
    expect(nodeResponseSink.publish.mock.calls.map((call) => call[0][0].response.id)).toEqual([
      'parallel-parent-response_task_0_attempt_0',
      'parallel-parent-response_task_0_attempt_1'
    ]);
    expect(nodeResponseSink.publish.mock.calls[0][0][0].response).toMatchObject({
      id: 'parallel-parent-response_task_0_attempt_0',
      error: expect.any(String)
    });
    expect(nodeResponseSink.publish.mock.calls[1][0][0].response).toMatchObject({
      id: 'parallel-parent-response_task_0_attempt_1',
      loopOutputValue: 'done'
    });
    expect(result.data[NodeOutputKeyEnum.parallelSuccessResults]).toEqual(['done']);
    expect(props.nodeSummary).toMatchObject({
      llmInputTokens: 34,
      llmOutputTokens: 7,
      errorCount: 0,
      hasNestedEnd: false
    });
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

  it('并发任务各自 fork 独立 memoryState，重试与失败隔离，并按任务索引顺序确定性合并成功任务的 system_memories', async () => {
    const parentMemoryState = (
      await import('@fastgpt/service/core/workflow/dispatch/utils/memories')
    ).WorkflowMemoryState.fromRecord({
      'app:app_1:extract1': { memory: 'baseline' }
    });
    const seenTaskMemories: any[] = [];

    runWorkflowMock.mockImplementation(async (args: any) => {
      // 每个并发任务都只能看到父 baseline，看不到其他并发任务的未提交写入
      seenTaskMemories.push(
        args.memoryState.readNodeMemory({
          runningAppInfo: { sourceType: 'app', sourceId: 'app_1' },
          nodeId: 'extract1'
        })
      );

      if (args.nodeResponseParentId.endsWith('_task_0_attempt_0')) {
        args.memoryState.merge({
          'app:app_1:extract1': { memory: 'failed-attempt' },
          'app:app_1:branch0': { memory: 'failed-branch0' }
        });
        return makeDispatchFlowResponse({
          [DispatchNodeResponseKeyEnum.memories]: args.memoryState.getDelta(),
          nodeResponses: [makeResponseItem('failed-node', { error: 'failed' })]
        });
      }
      if (args.nodeResponseParentId.endsWith('_task_0_attempt_1')) {
        args.memoryState.merge({
          'app:app_1:extract1': { memory: 'task0-recovered' },
          'app:app_1:branch0': { memory: 'task0-branch' }
        });
        return makeDispatchFlowResponse({
          [DispatchNodeResponseKeyEnum.memories]: args.memoryState.getDelta(),
          nodeResponses: [
            makeResponseItem('nestedEnd', {
              moduleType: FlowNodeTypeEnum.nestedEnd,
              loopOutputValue: 'done-0'
            })
          ]
        });
      }
      if (args.nodeResponseParentId.includes('_task_1')) {
        args.memoryState.merge({
          'app:app_1:extract1': { memory: 'task1-ok' },
          'app:app_1:branch1': { memory: 'task1-branch' }
        });
        return makeDispatchFlowResponse({
          [DispatchNodeResponseKeyEnum.memories]: args.memoryState.getDelta(),
          nodeResponses: [
            makeResponseItem('nestedEnd', {
              moduleType: FlowNodeTypeEnum.nestedEnd,
              loopOutputValue: 'done-1'
            })
          ]
        });
      }
      args.memoryState.merge({
        'app:app_1:extract1': { memory: 'task2-failed' },
        'app:app_1:branch2': { memory: 'task2-branch' }
      });
      return makeDispatchFlowResponse({
        [DispatchNodeResponseKeyEnum.memories]: args.memoryState.getDelta(),
        nodeResponses: [makeResponseItem('failed-node', { error: 'failed' })]
      });
    });

    const result: any = await dispatchParallelRun(
      makeProps({
        memoryState: parentMemoryState,
        params: {
          loopInputArray: ['a', 'b', 'c'],
          [NodeInputKeyEnum.childrenNodeIdList]: [],
          [NodeInputKeyEnum.parallelRunMaxConcurrency]: 3,
          [NodeInputKeyEnum.parallelRunMaxRetryTimes]: 1
        }
      })
    );

    expect(seenTaskMemories.every((item) => item?.memory === 'baseline')).toBe(true);
    expect(result[DispatchNodeResponseKeyEnum.memories]).toEqual({
      'app:app_1:extract1': { memory: 'task1-ok' },
      'app:app_1:branch0': { memory: 'task0-branch' },
      'app:app_1:branch1': { memory: 'task1-branch' }
    });
  });
});

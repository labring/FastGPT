import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloneDeep } from 'lodash-es';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum,
  LoopRunModeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { WorkflowVariableStateLike } from '@fastgpt/service/core/workflow/types/runtime';
import { runWorkflow } from '@fastgpt/service/core/workflow/dispatch';
import { callbackMap } from '@fastgpt/service/core/workflow/dispatch/constants';
import { createNode, createEdge } from '../utils';

/** 每个任务必须得到独立变量副本；只有成功任务的差量会提交到父作用域。 */
const createVariables = (
  values: Record<string, unknown> = { last: 'seed' }
): WorkflowVariableStateLike => ({
  get: (key) => values[key],
  set: async (key, value) => {
    values[key] = value;
    return value;
  },
  getStoreValue: (key) => values[key],
  getFileStoreValueByRuntimeUrl: () => undefined,
  toRuntimeRecord: () => cloneDeep(values),
  toStoreRecord: () => cloneDeep(values),
  clone: () => createVariables(cloneDeep(values))
});

const input = (key: string, value: unknown, reference = false): FlowNodeInputItemType => ({
  key,
  label: key,
  renderTypeList: [reference ? FlowNodeInputTypeEnum.reference : FlowNodeInputTypeEnum.input],
  valueType: WorkflowIOValueTypeEnum.any,
  value
});
const output = (key: string) => ({
  id: key,
  key,
  label: key,
  type: FlowNodeOutputTypeEnum.static,
  valueType: WorkflowIOValueTypeEnum.any
});

/** 构造两轮循环，每轮通过真实调度队列运行一个两任务并行容器；没有 AI 或网络节点。 */
const createGraph = (concurrency = 2) => {
  const loop = createNode('loop', FlowNodeTypeEnum.loopRun);
  loop.isEntry = true;
  loop.inputs = [
    input(NodeInputKeyEnum.loopRunMode, LoopRunModeEnum.array),
    input(NodeInputKeyEnum.loopRunInputArray, [
      [1, 2],
      [3, 4]
    ]),
    input(NodeInputKeyEnum.childrenNodeIdList, ['loop-start', 'parallel']),
    {
      ...input('result', ['parallel', NodeOutputKeyEnum.parallelSuccessResults], true),
      canEdit: true
    }
  ];
  loop.outputs = [{ ...output('result'), type: FlowNodeOutputTypeEnum.dynamic }];
  const start = createNode('loop-start', FlowNodeTypeEnum.loopRunStart);
  start.inputs = [
    input(NodeInputKeyEnum.loopRunMode, LoopRunModeEnum.array),
    input(NodeInputKeyEnum.nestedStartInput, undefined),
    input(NodeInputKeyEnum.nestedStartIndex, undefined)
  ];
  start.outputs = [output(NodeOutputKeyEnum.currentItem), output(NodeOutputKeyEnum.currentIndex)];
  const parallel = createNode('parallel', FlowNodeTypeEnum.parallelRun);
  parallel.inputs = [
    input(NodeInputKeyEnum.nestedInputArray, ['loop-start', NodeOutputKeyEnum.currentItem], true),
    input(NodeInputKeyEnum.childrenNodeIdList, ['task-start', 'task', 'task-end']),
    input(NodeInputKeyEnum.parallelRunMaxConcurrency, concurrency),
    input(NodeInputKeyEnum.parallelRunMaxRetryTimes, 0)
  ];
  parallel.outputs = [
    output(NodeOutputKeyEnum.parallelSuccessResults),
    output(NodeOutputKeyEnum.parallelFullResults),
    output(NodeOutputKeyEnum.parallelStatus)
  ];
  const taskStart = createNode('task-start', FlowNodeTypeEnum.nestedStart);
  taskStart.inputs = [
    input(NodeInputKeyEnum.nestedStartInput, undefined),
    input(NodeInputKeyEnum.nestedStartIndex, undefined)
  ];
  taskStart.outputs = [
    output(NodeOutputKeyEnum.nestedStartInput),
    output(NodeOutputKeyEnum.nestedStartIndex)
  ];
  const task = createNode('task', FlowNodeTypeEnum.textEditor);
  task.inputs = [input('item', ['task-start', NodeOutputKeyEnum.nestedStartInput], true)];
  task.outputs = [output(NodeOutputKeyEnum.text)];
  const end = createNode('task-end', FlowNodeTypeEnum.nestedEnd);
  end.inputs = [input(NodeInputKeyEnum.nestedEndInput, ['task', NodeOutputKeyEnum.text], true)];
  return {
    runtimeNodes: [loop, start, parallel, taskStart, task, end],
    runtimeEdges: [
      createEdge('loop-start', 'parallel'),
      createEdge('task-start', 'task'),
      createEdge('task', 'task-end')
    ]
  };
};

const run = (graph: ReturnType<typeof createGraph>, overrides: Record<string, unknown> = {}) =>
  runWorkflow({
    apiVersion: 'v2',
    mode: 'chat',
    runningAppInfo: {
      id: '67e0d5535c02d1d5cdede721',
      sourceId: '67e0d5535c02d1d5cdede721',
      name: 'nested parallel',
      teamId: '654a4107c32f3bf5f998452f',
      tmbId: '65ab7007462ada7dbb899948'
    },
    runningUserInfo: {
      teamId: '654a4107c32f3bf5f998452f',
      tmbId: '65ab7007462ada7dbb899948',
      teamName: 'team',
      memberName: 'member',
      contact: '',
      username: 'user'
    },
    uid: 'nested-parallel-test',
    lang: 'zh-CN',
    histories: [],
    query: [],
    variables: {},
    chatConfig: {},
    variableState: createVariables(),
    externalProvider: {},
    workflowDispatchDeep: 0,
    maxRunTimes: 100,
    stream: false,
    responseDetail: true,
    responseAllData: true,
    checkIsStopping: () => false,
    ...graph,
    ...overrides
  } as Parameters<typeof runWorkflow>[0]);

describe('parallelRun nested in loopRun (real workflow queue)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('runs both iterations with bounded concurrency, isolated task variables and ordered results', async () => {
    const seen: Array<{ item: number; before: unknown }> = [];
    let active = 0;
    let peak = 0;
    let release: (() => void) | undefined;
    vi.spyOn(callbackMap, FlowNodeTypeEnum.textEditor).mockImplementation(
      async ({ params, variableState }) => {
        const item = params.item as number;
        seen.push({ item, before: variableState.get('last') });
        active++;
        peak = Math.max(peak, active);
        await variableState.set('last', item);
        // 每轮第一个任务等待第二个任务进入，保证实测并发和变量副本隔离。
        if (item % 2 === 1)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        else release?.();
        active--;
        return { data: { [NodeOutputKeyEnum.text]: item } };
      }
    );
    const graph = createGraph();
    const variables = createVariables();
    const result = await run(graph, { variableState: variables });
    expect(result.workflowRuntimeSummary.hasError).toBe(false);
    expect(peak).toBe(2);
    expect(seen.map(({ item }) => item).sort()).toEqual([1, 2, 3, 4]);
    expect(seen.slice(0, 2).map(({ before }) => before)).toEqual(['seed', 'seed']);
    expect(seen[2].before).toBe(seen[3].before);
    expect([1, 2]).toContain(seen[2].before);
    expect([3, 4]).toContain(variables.get('last'));
    const loop = graph.runtimeNodes[0];
    expect(loop.outputs[0].value).toEqual([3, 4]);
    expect(
      graph.runtimeNodes
        .find((n) => n.nodeId === 'task-start')
        ?.inputs.find((i) => i.key === NodeInputKeyEnum.nestedStartInput)?.value
    ).toBeUndefined();
  });

  it('does not schedule remaining tasks or the next iteration after cancellation', async () => {
    let stopped = false;
    const dispatch = vi
      .spyOn(callbackMap, FlowNodeTypeEnum.textEditor)
      .mockImplementation(async ({ params }) => {
        stopped = true;
        return { data: { [NodeOutputKeyEnum.text]: params.item } };
      });
    await run(createGraph(1), { checkIsStopping: () => stopped });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('discards failed task writes and stops after the failed outer iteration', async () => {
    const variables = createVariables();
    const beforeValues: unknown[] = [];
    vi.spyOn(callbackMap, FlowNodeTypeEnum.textEditor).mockImplementation(
      async ({ params, variableState }) => {
        beforeValues.push(variableState.get('last'));
        if (params.item === 1) {
          await variableState.set('last', 'failed-task');
          throw new Error('task failed');
        }
        await variableState.set('last', params.item);
        return { data: { [NodeOutputKeyEnum.text]: params.item } };
      }
    );
    const graph = createGraph(1);
    const result = await run(graph, { variableState: variables });
    expect(beforeValues).toEqual(['seed', 'seed']);
    expect(result.workflowRuntimeSummary.hasError).toBe(true);
    expect(variables.get('last')).toBe('seed');
  });
});

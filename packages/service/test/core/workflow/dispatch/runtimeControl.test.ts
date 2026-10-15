import { describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { runWorkflow } from '@fastgpt/service/core/workflow/dispatch';
import { callbackMap } from '@fastgpt/service/core/workflow/dispatch/constants';
import {
  getWorkflowContext,
  runWithContext
} from '@fastgpt/service/core/workflow/dispatch/context';
import type { WorkflowRuntimeControl } from '@fastgpt/service/core/workflow/dispatch/context/runtimeControl';
import type { RunWorkflowProps } from '@fastgpt/service/core/workflow/dispatch/type';
import { createWorkflowRuntimeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';
import {
  createTestRuntimeControl,
  createTestWorkflowFileContext,
  runWithTestWorkflowContext
} from './context/fixtures';
import { createEdge, createNode } from '../utils';

/** 提供真实运行内核所需的业务参数，控制状态只由测试入口 Context 注入。 */
const createProps = (nodes: RunWorkflowProps['runtimeNodes']): RunWorkflowProps => ({
  runningAppInfo: {
    sourceType: ChatSourceTypeEnum.app,
    sourceId: '67e0d5535c02d1d5cdede721',
    teamId: '654a4107c32f3bf5f998452f',
    tmbId: '65ab7007462ada7dbb899948',
    name: 'Runtime control test'
  },
  runningUserInfo: {
    teamId: '654a4107c32f3bf5f998452f',
    tmbId: '65ab7007462ada7dbb899948',
    username: 'user',
    teamName: 'team',
    memberName: 'member',
    contact: ''
  },
  uid: 'runtime-control-user',
  chatId: 'runtime-control-chat',
  responseChatItemId: 'runtime-control-response',
  timezone: 'Asia/Shanghai',
  externalProvider: {},
  histories: [],
  query: [],
  stream: false,
  runtimeNodes: nodes,
  runtimeEdges: []
});

describe('runWorkflow runtimeControl', () => {
  it('队列扣减本层预算，慢节点启动子流程时仍继承节点开始执行时的快照', async () => {
    const fileContext = await createTestWorkflowFileContext();
    const runtimeControl = createTestRuntimeControl({ mode: 'chat', maxRunTimes: 11 });
    const start = createNode('start', FlowNodeTypeEnum.textEditor);
    const slow = createNode('slow', FlowNodeTypeEnum.textEditor);
    const fast = createNode('fast', FlowNodeTypeEnum.textEditor);
    const next = createNode('next', FlowNodeTypeEnum.textEditor);
    // 先由入口一次激活两个分支，确保两者已入队后再开始并发执行。
    start.isEntry = true;
    const props = createProps([start, slow, fast, next]);
    props.runtimeEdges = [
      createEdge('start', 'slow'),
      createEdge('start', 'fast'),
      createEdge('fast', 'next')
    ];
    let startSlow!: () => void;
    let releaseSlow!: () => void;
    const slowStarted = new Promise<void>((resolve) => {
      startSlow = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const observed: Record<string, number> = {};
    const callback = vi
      .spyOn(callbackMap, FlowNodeTypeEnum.textEditor)
      .mockImplementation(async ({ node }) => {
        const context = getWorkflowContext();
        if (node.nodeId === 'slow') {
          startSlow();
          await gate;
          observed.slow = context.runtimeControl.maxRunTimes;
          const child = context.getChildContext();
          observed.child = child.runtimeControl.maxRunTimes;
          child.runtimeControl.maxRunTimes = 1;
          observed.afterChild = context.runtimeControl.maxRunTimes;
        } else if (node.nodeId === 'fast') {
          await slowStarted;
          return { runTimes: 4 };
        } else if (node.nodeId === 'next') {
          observed.next = context.runtimeControl.maxRunTimes;
          releaseSlow();
        }
        return {};
      });
    try {
      await runWithTestWorkflowContext(
        { fileContext, runtimeControl, checkIsStopping: () => false, mcpClientMemory: {} },
        async () => {
          const result = await runWorkflow(props);
          expect(result.runTimes).toBe(7);
        }
      );
      expect(observed).toEqual({ next: 6, slow: 10, child: 10, afterChild: 10 });
      expect(runtimeControl).toMatchObject({ maxRunTimes: 4, workflowDispatchDeep: 0 });
      expect(props).not.toHaveProperty('maxRunTimes');
    } finally {
      releaseSlow();
      callback.mockRestore();
    }
  });

  it('Debug 只执行当前阶段，节点的子流程继承 test 模式并独立计算预算和深度', async () => {
    const fileContext = await createTestWorkflowFileContext();
    const runtimeControl = createTestRuntimeControl({ mode: 'debug', maxRunTimes: 10 });
    const parent = createNode('parent', FlowNodeTypeEnum.textEditor);
    const parentNext = createNode('parent-next', FlowNodeTypeEnum.textEditor);
    parent.isEntry = true;
    const props = createProps([parent, parentNext]);
    props.runtimeEdges = [createEdge('parent', 'parent-next')];
    const calls: string[] = [];
    const controls: WorkflowRuntimeControl[] = [];
    const nodeKeys: string[][] = [];
    let childControl: WorkflowRuntimeControl | undefined;
    const callback = vi
      .spyOn(callbackMap, FlowNodeTypeEnum.textEditor)
      .mockImplementation(async (nodeProps) => {
        calls.push(nodeProps.node.nodeId);
        nodeKeys.push(Object.keys(nodeProps));
        const context = getWorkflowContext();
        controls.push({ ...context.runtimeControl });
        if (nodeProps.node.nodeId === 'parent') {
          const first = createNode('child-first', FlowNodeTypeEnum.textEditor);
          const last = createNode('child-last', FlowNodeTypeEnum.textEditor);
          first.isEntry = true;
          const childProps = createProps([first, last]);
          childProps.runtimeEdges = [createEdge('child-first', 'child-last')];
          const childContext = context.getChildContext({
            nodeResponseSink: context.nodeResponseSink.getChildContext({
              workflowRuntimeSummary: createWorkflowRuntimeSummary()
            })
          });
          childControl = childContext.runtimeControl;
          const result = await runWithContext(childContext, () => runWorkflow(childProps));
          return { runTimes: result.runTimes + 1 };
        }
        return {};
      });
    try {
      await runWithTestWorkflowContext(
        { fileContext, runtimeControl, checkIsStopping: () => false, mcpClientMemory: {} },
        () => runWorkflow(props)
      );
      expect(calls).toEqual(['parent', 'child-first', 'child-last']);
      expect(controls.map((control) => [control.mode, control.workflowDispatchDeep])).toEqual([
        ['test', 1],
        ['test', 2],
        ['test', 2]
      ]);
      expect(childControl).toMatchObject({ mode: 'test', maxRunTimes: 8, workflowDispatchDeep: 1 });
      expect(runtimeControl).toMatchObject({
        mode: 'debug',
        maxRunTimes: 7,
        workflowDispatchDeep: 0
      });
      for (const keys of nodeKeys) {
        for (const key of ['mode', 'maxRunTimes', 'workflowDispatchDeep', 'isToolCall']) {
          expect(keys).not.toContain(key);
        }
      }
    } finally {
      callback.mockRestore();
    }
  });

  it('零预算不执行节点，不用默认值覆盖已经耗尽的额度', async () => {
    const fileContext = await createTestWorkflowFileContext();
    const runtimeControl = createTestRuntimeControl({ maxRunTimes: 0 });
    const node = createNode('entry', FlowNodeTypeEnum.textEditor);
    node.isEntry = true;
    const callback = vi.spyOn(callbackMap, FlowNodeTypeEnum.textEditor);
    try {
      const result = await runWithTestWorkflowContext(
        { fileContext, runtimeControl, checkIsStopping: () => false, mcpClientMemory: {} },
        () => runWorkflow(createProps([node]))
      );
      expect(callback).not.toHaveBeenCalled();
      expect(result.runTimes).toBe(0);
      expect(runtimeControl.maxRunTimes).toBe(0);
      expect(runtimeControl.workflowDispatchDeep).toBe(0);
    } finally {
      callback.mockRestore();
    }
  });
});

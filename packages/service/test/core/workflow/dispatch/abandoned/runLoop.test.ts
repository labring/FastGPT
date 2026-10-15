import { describe, expect, it, vi } from 'vitest';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getWorkflowContext } from '@fastgpt/service/core/workflow/dispatch/context';
import { createNodeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';
import {
  createTestVariableContext,
  createTestWorkflowFileContext,
  runWithTestWorkflowContext
} from '../context/fixtures';
import type { DispatchFlowResponse } from '@fastgpt/service/core/workflow/dispatch/type';

const { runWorkflowMock } = vi.hoisted(() => ({ runWorkflowMock: vi.fn() }));
vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({ runWorkflow: runWorkflowMock }));

import { dispatchLoop } from '@fastgpt/service/core/workflow/dispatch/abandoned/runLoop';

const makeProps = () =>
  ({
    params: { loopInputArray: ['first', 'second'], childrenNodeIdList: [] },
    runtimeNodes: [],
    runtimeEdges: [],
    node: { nodeId: 'legacy-loop', name: 'Legacy loop', flowNodeType: FlowNodeTypeEnum.loop },
    nodeResponseParentId: 'loop-parent',
    nodeSummary: createNodeSummary(),
    usagePush: vi.fn()
  }) as unknown as Parameters<typeof dispatchLoop>[0];

describe('abandoned dispatchLoop response Context', () => {
  it('每轮独立响应统计，共享父变量和节点图，执行完恢复父 Context', async () => {
    runWorkflowMock.mockReset();
    const props = makeProps();
    const variables = createTestVariableContext({ counter: 0 });
    const fileContext = await createTestWorkflowFileContext();
    const contexts: ReturnType<typeof getWorkflowContext>[] = [];
    runWorkflowMock.mockImplementation(async (data: Parameters<typeof dispatchLoop>[0]) => {
      const context = getWorkflowContext();
      contexts.push(context);
      expect(context.variableContext).toBe(variables);
      expect(context.fileContext).toBe(fileContext);
      expect(data.runtimeNodes).toBe(props.runtimeNodes);
      const counter = Number(variables.get('counter')) + 1;
      await variables.set('counter', counter);
      context.nodeResponseSink.workflowRuntimeSummary.nestedEndOutput = counter;
      const [response] = await context.nodeResponseSink.publish([
        {
          response: {
            id: `child-${counter}`,
            nodeId: 'child',
            moduleName: 'Child',
            moduleType: FlowNodeTypeEnum.textEditor,
            inputTokens: counter
          }
        }
      ]);
      expect(response.parentId).toBe('loop-parent');
      return {
        flowUsages: [],
        debugResponse: { memoryEdges: [], memoryNodes: [], entryNodeIds: [], nodeResponses: {} },
        [DispatchNodeResponseKeyEnum.runTimes]: 1,
        [DispatchNodeResponseKeyEnum.assistantResponses]: [],
        [DispatchNodeResponseKeyEnum.toolResponse]: null,
        [DispatchNodeResponseKeyEnum.newVariables]: variables.toStoreRecord(),
        workflowRuntimeSummary: context.nodeResponseSink.workflowRuntimeSummary,
        durationSeconds: 0
      } satisfies DispatchFlowResponse;
    });
    await runWithTestWorkflowContext(
      {
        checkIsStopping: () => false,
        mcpClientMemory: {},
        fileContext,
        variableContext: variables
      },
      async (parent) => {
        const result = await dispatchLoop(props);
        expect(result.data?.[NodeOutputKeyEnum.nestedArrayResult]).toEqual([1, 2]);
        expect(contexts).toHaveLength(2);
        expect(contexts[0]).not.toBe(contexts[1]);
        expect(
          contexts.map((context) => context.nodeResponseSink.workflowRuntimeSummary.llmInputTokens)
        ).toEqual([1, 2]);
        expect(parent.nodeResponseSink.workflowRuntimeSummary.llmInputTokens).toBe(0);
        expect(variables.get('counter')).toBe(2);
        expect(getWorkflowContext()).toBe(parent);
      }
    );
  });

  it('子运行异常也恢复父 Context，不关闭父响应能力', async () => {
    runWorkflowMock.mockReset();
    runWorkflowMock.mockRejectedValueOnce(new Error('child failed'));
    const fileContext = await createTestWorkflowFileContext();
    await runWithTestWorkflowContext(
      { checkIsStopping: () => false, mcpClientMemory: {}, fileContext },
      async (parent) => {
        await expect(dispatchLoop(makeProps())).rejects.toThrow('child failed');
        expect(getWorkflowContext()).toBe(parent);
        expect(parent.nodeResponseSink.workflowRuntimeSummary.llmInputTokens).toBe(0);
      }
    );
  });
});

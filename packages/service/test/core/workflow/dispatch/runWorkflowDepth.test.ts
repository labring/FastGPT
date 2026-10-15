import { describe, expect, it, vi } from 'vitest';

const { observeWorkflowRunMock } = vi.hoisted(() => ({
  observeWorkflowRunMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/metrics', () => ({
  observeWorkflowRun: observeWorkflowRunMock,
  observeWorkflowStep: vi.fn()
}));

import { runWorkflow as runWorkflowWithoutContext } from '@fastgpt/service/core/workflow/dispatch';
import {
  createTestRuntimeControl,
  createTestWorkflowFileContext,
  runWithTestWorkflowContext
} from './context/fixtures';
import { getWorkflowContext } from '@fastgpt/service/core/workflow/dispatch/context';
import { createWorkflowEntryNodeResponseSink } from '@fastgpt/service/core/workflow/dispatch/context/nodeResponse';
import { createWorkflowRuntimeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';

describe('runWorkflow depth recovery', () => {
  it('沿用上层 Context，observer 失败时仍恢复深度且不重新初始化响应 Scope', async () => {
    const nodeResponseSink = createWorkflowEntryNodeResponseSink();
    const derive = vi.spyOn(nodeResponseSink, 'getChildContext');
    const fileContext = await createTestWorkflowFileContext();
    const runtimeControl = createTestRuntimeControl({ workflowDispatchDeep: 3 });
    await runWithTestWorkflowContext(
      {
        checkIsStopping: () => false,
        mcpClientMemory: {},
        fileContext,
        nodeResponseSink,
        runtimeControl
      },
      async (context) => {
        observeWorkflowRunMock.mockImplementationOnce(() => {
          expect(getWorkflowContext()).toBe(context);
          expect(getWorkflowContext().nodeResponseSink).toBe(nodeResponseSink);
          return Promise.reject(new Error('observer failed'));
        });
        const data = {} as Parameters<typeof runWorkflowWithoutContext>[0];
        await expect(runWorkflowWithoutContext(data)).rejects.toThrow('observer failed');
        expect(derive).not.toHaveBeenCalled();
        expect(runtimeControl.workflowDispatchDeep).toBe(3);
        expect(data).not.toHaveProperty('workflowDispatchDeep');
      }
    );
  });

  it('超出深度上限时返回上层准备的本次独立空 summary', async () => {
    const entry = createWorkflowEntryNodeResponseSink();
    entry.workflowRuntimeSummary.llmInputTokens = 99;
    const summary = createWorkflowRuntimeSummary();
    const nodeResponseSink = entry.getChildContext({ workflowRuntimeSummary: summary });
    const fileContext = await createTestWorkflowFileContext();
    const runtimeControl = createTestRuntimeControl({ workflowDispatchDeep: 20 });
    await runWithTestWorkflowContext(
      {
        checkIsStopping: () => false,
        mcpClientMemory: {},
        fileContext,
        nodeResponseSink,
        runtimeControl
      },
      async () => {
        const data = {} as Parameters<typeof runWorkflowWithoutContext>[0];
        const result = await runWorkflowWithoutContext(data);
        expect(result.workflowRuntimeSummary).toBe(summary);
        expect(result.workflowRuntimeSummary.llmInputTokens).toBe(0);
        expect(entry.workflowRuntimeSummary.llmInputTokens).toBe(99);
        expect(runtimeControl.workflowDispatchDeep).toBe(20);
      }
    );
  });
});

import { describe, expect, it, vi } from 'vitest';

const { observeWorkflowRunMock } = vi.hoisted(() => ({
  observeWorkflowRunMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/metrics', () => ({
  observeWorkflowRun: observeWorkflowRunMock,
  observeWorkflowStep: vi.fn()
}));

import { runWorkflow } from '@fastgpt/service/core/workflow/dispatch';

describe('runWorkflow depth recovery', () => {
  it('restores workflowDispatchDeep when the outer observer fails before dispatch starts', async () => {
    observeWorkflowRunMock.mockRejectedValueOnce(new Error('observer failed'));
    const data = {
      mode: 'test',
      workflowDispatchDeep: 3
    } as Parameters<typeof runWorkflow>[0];

    await expect(runWorkflow(data)).rejects.toThrow('observer failed');

    expect(data.workflowDispatchDeep).toBe(3);
  });
});

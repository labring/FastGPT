import { describe, expect, it, vi } from 'vitest';
import type { StoreWorkflow } from '@fastgpt/global/common/workflow/editor/protocol';
import { runWorkflowTest } from '@/pageComponents/app/detail/Workflow/runWorkflowTest';

const data = {
  nodes: [],
  edges: [],
  chatConfig: {}
} as StoreWorkflow;

describe('runWorkflowTest', () => {
  it('opens the test panel only after the precheck returns data', async () => {
    const open = vi.fn();

    await expect(
      runWorkflowTest({ serializeWorkflowAndCheck: async () => data, open })
    ).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith(data);
  });

  it('does not open the test panel when the precheck blocks', async () => {
    const open = vi.fn();

    await expect(
      runWorkflowTest({ serializeWorkflowAndCheck: async () => undefined, open })
    ).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('does not open the test panel when the precheck rejects', async () => {
    const open = vi.fn();

    await expect(
      runWorkflowTest({
        serializeWorkflowAndCheck: async () => {
          throw new Error('precheck failed');
        },
        open
      })
    ).rejects.toThrow('precheck failed');
    expect(open).not.toHaveBeenCalled();
  });
});

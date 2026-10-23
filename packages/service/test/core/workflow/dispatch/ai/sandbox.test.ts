import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getRunningSandboxId } from '@fastgpt/service/core/ai/sandbox/utils/id';
import { ensureWorkflowSandboxReadyForUse } from '@fastgpt/service/core/workflow/dispatch/ai/sandbox';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureAppSandboxRuntimeReadyMock } = vi.hoisted(() => ({
  ensureAppSandboxRuntimeReadyMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/upgrade', () => ({
  ensureAppSandboxRuntimeReady: ensureAppSandboxRuntimeReadyMock
}));

describe('ensureWorkflowSandboxReadyForUse', () => {
  const source = {
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'app_1',
    userId: 'user_1',
    chatId: 'chat_1'
  };
  const sandboxId = getRunningSandboxId(source);

  beforeEach(() => {
    vi.resetAllMocks();
    ensureAppSandboxRuntimeReadyMock.mockResolvedValue(false);
  });

  it('reports preparation before configuration waits and readiness after runtime preparation', async () => {
    const workflowStreamResponse = vi.fn();
    const preparingEvent = { event: 'sandboxStatus', data: { sandboxId, phase: 'lazyInit' } };
    ensureAppSandboxRuntimeReadyMock.mockImplementationOnce(async () => {
      expect(workflowStreamResponse.mock.calls).toEqual([[preparingEvent]]);
    });
    const runtime = { client: 'prepared' };
    const prepareRuntime = vi.fn(async () => {
      expect(workflowStreamResponse.mock.calls).toEqual([[preparingEvent]]);
      return runtime;
    });

    await expect(
      ensureWorkflowSandboxReadyForUse({ ...source, workflowStreamResponse, prepareRuntime })
    ).resolves.toBe(runtime);

    expect(prepareRuntime).toHaveBeenCalledOnce();
    expect(workflowStreamResponse.mock.calls).toEqual([
      [preparingEvent],
      [{ event: 'sandboxStatus', data: { sandboxId, phase: 'ready' } }]
    ]);
  });

  it('deduplicates upgrade progress and returns to preparation until runtime is ready', async () => {
    const workflowStreamResponse = vi.fn();
    const getPhases = () => workflowStreamResponse.mock.calls.map(([event]) => event.data.phase);
    ensureAppSandboxRuntimeReadyMock.mockImplementationOnce(async ({ onUpgrade }) => {
      expect(getPhases()).toEqual(['lazyInit']);
      onUpgrade();
      onUpgrade();
      expect(getPhases()).toEqual(['lazyInit', 'upgrading']);
      return true;
    });

    await ensureWorkflowSandboxReadyForUse({
      ...source,
      workflowStreamResponse,
      prepareRuntime: async () => {
        expect(getPhases()).toEqual(['lazyInit', 'upgrading', 'lazyInit']);
      }
    });

    expect(getPhases()).toEqual(['lazyInit', 'upgrading', 'lazyInit', 'ready']);
  });

  it('preserves non-App lifecycle ownership and reports the same sandbox identity', async () => {
    const workflowStreamResponse = vi.fn();
    const skillSource = { ...source, sourceType: ChatSourceTypeEnum.skillEdit };
    const skillSandboxId = getRunningSandboxId(skillSource);
    const prepareRuntime = vi.fn(async () => 'skill-runtime');

    await expect(
      ensureWorkflowSandboxReadyForUse({
        ...skillSource,
        workflowStreamResponse,
        prepareRuntime
      })
    ).resolves.toBe('skill-runtime');

    expect(ensureAppSandboxRuntimeReadyMock).not.toHaveBeenCalled();
    expect(prepareRuntime).toHaveBeenCalledOnce();
    expect(workflowStreamResponse.mock.calls.map(([event]) => event.data)).toEqual([
      { sandboxId: skillSandboxId, phase: 'lazyInit' },
      { sandboxId: skillSandboxId, phase: 'ready' }
    ]);
  });

  it.each(['configuration', 'runtime'])(
    'does not report readiness after %s fails',
    async (stage) => {
      const error = new Error(`${stage} failed`);
      const workflowStreamResponse = vi.fn();
      const prepareRuntime = vi.fn(async () => undefined);
      if (stage === 'configuration') {
        ensureAppSandboxRuntimeReadyMock.mockRejectedValueOnce(error);
      } else {
        prepareRuntime.mockRejectedValueOnce(error);
      }

      await expect(
        ensureWorkflowSandboxReadyForUse({ ...source, workflowStreamResponse, prepareRuntime })
      ).rejects.toBe(error);

      expect(workflowStreamResponse.mock.calls.map(([event]) => event.data.phase)).toEqual([
        'lazyInit'
      ]);
      expect(prepareRuntime).toHaveBeenCalledTimes(stage === 'configuration' ? 0 : 1);
    }
  );

  it('prepares the runtime without a stream callback', async () => {
    const prepareRuntime = vi.fn(async () => 'runtime');
    ensureAppSandboxRuntimeReadyMock.mockImplementationOnce(async ({ onUpgrade }) => onUpgrade());

    await expect(ensureWorkflowSandboxReadyForUse({ ...source, prepareRuntime })).resolves.toBe(
      'runtime'
    );
    expect(prepareRuntime).toHaveBeenCalledOnce();
  });
});

import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getRunningSandboxId } from '@fastgpt/service/core/ai/sandbox/utils/id';
import { ensureWorkflowSandboxReadyForUse } from '@fastgpt/service/core/workflow/dispatch/ai/sandbox';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { markChatSandboxEnabledMock } = vi.hoisted(() => ({
  markChatSandboxEnabledMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/sandbox/service', () => ({
  markChatSandboxEnabled: markChatSandboxEnabledMock
}));

describe('ensureWorkflowSandboxReadyForUse', () => {
  const source = {
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'app_1',
    userId: 'user_1',
    chatId: 'chat_1',
    teamId: 'team_1'
  };
  const sandboxId = getRunningSandboxId(source);

  beforeEach(() => {
    vi.resetAllMocks();
    markChatSandboxEnabledMock.mockResolvedValue(undefined);
  });

  it('reports readiness only after runtime preparation and root chat persistence complete', async () => {
    const workflowStreamResponse = vi.fn();
    const preparingEvent = { event: 'sandboxStatus', data: { sandboxId, phase: 'lazyInit' } };
    const runtime = { client: 'prepared' };
    const prepareRuntime = vi.fn(async () => {
      expect(workflowStreamResponse.mock.calls).toEqual([[preparingEvent]]);
      return runtime;
    });
    markChatSandboxEnabledMock.mockImplementationOnce(async () => {
      expect(workflowStreamResponse.mock.calls).toEqual([[preparingEvent]]);
    });

    await expect(
      ensureWorkflowSandboxReadyForUse({
        ...source,
        workflowStreamResponse,
        prepareRuntime
      })
    ).resolves.toBe(runtime);

    expect(prepareRuntime).toHaveBeenCalledOnce();
    expect(markChatSandboxEnabledMock).toHaveBeenCalledWith({
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      chatId: source.chatId,
      teamId: source.teamId
    });
    expect(workflowStreamResponse.mock.calls).toEqual([
      [preparingEvent],
      [{ event: 'sandboxStatus', data: { sandboxId, phase: 'ready' } }]
    ]);
  });

  it('deduplicates upgrade progress and returns to preparation until runtime is ready', async () => {
    const workflowStreamResponse = vi.fn();
    const getPhases = () => workflowStreamResponse.mock.calls.map(([event]) => event.data.phase);

    await ensureWorkflowSandboxReadyForUse({
      ...source,
      workflowStreamResponse,
      prepareRuntime: async ({ onUpgrade }) => {
        expect(getPhases()).toEqual(['lazyInit']);
        onUpgrade();
        onUpgrade();
        expect(getPhases()).toEqual(['lazyInit', 'upgrading']);
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

    expect(markChatSandboxEnabledMock).not.toHaveBeenCalled();
    expect(prepareRuntime).toHaveBeenCalledOnce();
    expect(workflowStreamResponse.mock.calls.map(([event]) => event.data)).toEqual([
      { sandboxId: skillSandboxId, phase: 'lazyInit' },
      { sandboxId: skillSandboxId, phase: 'ready' }
    ]);
  });

  it('does not report readiness after runtime preparation fails', async () => {
    const error = new Error('runtime failed');
    const workflowStreamResponse = vi.fn();
    const prepareRuntime = vi.fn(async () => {
      throw error;
    });

    await expect(
      ensureWorkflowSandboxReadyForUse({ ...source, workflowStreamResponse, prepareRuntime })
    ).rejects.toBe(error);

    expect(workflowStreamResponse.mock.calls.map(([event]) => event.data.phase)).toEqual([
      'lazyInit'
    ]);
    expect(prepareRuntime).toHaveBeenCalledTimes(1);
    expect(markChatSandboxEnabledMock).not.toHaveBeenCalled();
  });

  it('prepares the runtime without a stream callback', async () => {
    const prepareRuntime = vi.fn(async ({ onUpgrade }) => {
      onUpgrade();
      return 'runtime';
    });

    await expect(ensureWorkflowSandboxReadyForUse({ ...source, prepareRuntime })).resolves.toBe(
      'runtime'
    );
    expect(prepareRuntime).toHaveBeenCalledOnce();
  });
});

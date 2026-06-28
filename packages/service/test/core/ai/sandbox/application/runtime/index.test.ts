import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { getEditDebugSandboxId } from '@fastgpt/service/core/ai/skill/edit/config';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';

const mocks = vi.hoisted(() => ({
  getSandboxClient: vi.fn(),
  checkTeamSandboxPermission: vi.fn(),
  getSandboxRuntimeProfile: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', () => ({
  getSandboxClient: mocks.getSandboxClient
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamSandboxPermission: mocks.checkTeamSandboxPermission
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile', () => ({
  getSandboxRuntimeProfile: mocks.getSandboxRuntimeProfile
}));

describe('prepareAgentSandboxRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkTeamSandboxPermission.mockResolvedValue(undefined);
    mocks.getSandboxRuntimeProfile.mockReturnValue({ workDirectory: '/workspace' });
    mocks.getSandboxClient.mockResolvedValue({ getSandboxId: () => 'sandbox' });
  });

  it('passes app source into sandbox client without legacy appId fields', async () => {
    const { prepareAgentSandboxRuntime } =
      await import('@fastgpt/service/core/ai/sandbox/application/runtime');

    await expect(
      prepareAgentSandboxRuntime({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app_1',
        userId: 'user_1',
        chatId: 'chat_1',
        teamId: 'team_1'
      })
    ).resolves.toEqual({
      sandboxClient: expect.any(Object),
      workDirectory: '/workspace'
    });

    expect(mocks.getSandboxClient).toHaveBeenCalledWith(
      {
        sandboxId: generateSandboxId('app_1', 'user_1', 'chat_1'),
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app_1',
        userId: 'user_1',
        chatId: 'chat_1'
      },
      { failedArchivePolicy: 'clearAndContinue' }
    );
  });

  it('converts skill edit source into stable edit sandbox id without exposing appId input', async () => {
    const { prepareAgentSandboxRuntime } =
      await import('@fastgpt/service/core/ai/sandbox/application/runtime');

    await prepareAgentSandboxRuntime({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill_1',
      userId: 'user_1',
      chatId: 'edit-debug',
      teamId: 'team_1'
    });

    expect(mocks.getSandboxClient).toHaveBeenCalledWith(
      {
        sandboxId: getEditDebugSandboxId('skill_1'),
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'skill_1',
        userId: '',
        chatId: 'edit-debug'
      },
      { failedArchivePolicy: 'clearAndContinue' }
    );
  });

  it('throws structured permission error before creating sandbox client', async () => {
    const { prepareAgentSandboxRuntime } =
      await import('@fastgpt/service/core/ai/sandbox/application/runtime');
    mocks.checkTeamSandboxPermission.mockRejectedValueOnce(new Error('no permission'));

    await expect(
      prepareAgentSandboxRuntime({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app_1',
        userId: 'user_1',
        chatId: 'chat_1',
        teamId: 'team_1'
      })
    ).rejects.toMatchObject({
      message: SandboxErrEnum.agentSandboxPermissionDenied
    });

    expect(mocks.getSandboxClient).not.toHaveBeenCalled();
  });
});

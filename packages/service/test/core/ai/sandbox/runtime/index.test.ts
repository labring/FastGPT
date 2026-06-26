import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { getEditDebugSandboxId } from '@fastgpt/service/core/ai/skill/edit/config';

const mocks = vi.hoisted(() => ({
  getSandboxClient: vi.fn(),
  checkTeamSandboxPermission: vi.fn(),
  getSandboxRuntimeProfile: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/runtime', () => ({
  getSandboxClient: mocks.getSandboxClient
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamSandboxPermission: mocks.checkTeamSandboxPermission
}));

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/profile', () => ({
  getSandboxRuntimeProfile: mocks.getSandboxRuntimeProfile
}));

describe('prepareAgentSandboxRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkTeamSandboxPermission.mockResolvedValue(undefined);
    mocks.getSandboxRuntimeProfile.mockReturnValue({ workDirectory: '/workspace' });
    mocks.getSandboxClient.mockResolvedValue({ getSandboxId: () => 'sandbox' });
  });

  it('converts app source into sandbox client compatibility fields internally', async () => {
    const { prepareAgentSandboxRuntime } = await import('@fastgpt/service/core/ai/sandbox/runtime');

    await expect(
      prepareAgentSandboxRuntime({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app_1',
        userId: 'user_1',
        chatId: 'chat_1',
        teamId: 'team_1',
        needSandboxRuntime: true
      })
    ).resolves.toEqual({
      sandboxClient: expect.any(Object),
      workDirectory: '/workspace'
    });

    expect(mocks.getSandboxClient).toHaveBeenCalledWith({
      sandboxId: generateSandboxId('app_1', 'user_1', 'chat_1'),
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app_1',
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1'
    });
  });

  it('converts skill edit source into stable edit sandbox id without exposing appId input', async () => {
    const { prepareAgentSandboxRuntime } = await import('@fastgpt/service/core/ai/sandbox/runtime');

    await prepareAgentSandboxRuntime({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill_1',
      userId: 'user_1',
      chatId: 'edit-debug',
      teamId: 'team_1',
      needSandboxRuntime: true
    });

    expect(mocks.getSandboxClient).toHaveBeenCalledWith({
      sandboxId: getEditDebugSandboxId('skill_1'),
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill_1',
      appId: 'skill_1',
      userId: '',
      chatId: 'edit-debug'
    });
  });

  it('does not touch sandbox service when runtime is not needed', async () => {
    const { prepareAgentSandboxRuntime } = await import('@fastgpt/service/core/ai/sandbox/runtime');

    await expect(
      prepareAgentSandboxRuntime({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app_1',
        userId: 'user_1',
        chatId: 'chat_1',
        teamId: 'team_1',
        needSandboxRuntime: false
      })
    ).resolves.toBeUndefined();

    expect(mocks.checkTeamSandboxPermission).not.toHaveBeenCalled();
    expect(mocks.getSandboxClient).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { getEditDebugSandboxId } from '@fastgpt/service/core/ai/skill/edit/config';

const mocks = vi.hoisted(() => ({
  getSandboxClient: vi.fn(),
  getSandboxRuntimeProfile: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', () => ({
  getSandboxClient: mocks.getSandboxClient
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/runtimeProfile', () => ({
  getSandboxRuntimeProfile: mocks.getSandboxRuntimeProfile
}));

describe('prepareAgentSandboxRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        chatId: 'chat_1'
      })
    ).resolves.toEqual({
      sandboxClient: expect.any(Object),
      workspaceRoot: '/workspace',
      workDirectory: '/workspace/sessions/chat_1'
    });

    expect(mocks.getSandboxClient).toHaveBeenCalledWith(
      {
        sandboxId: generateSandboxId({
          sourceType: ChatSourceTypeEnum.app,
          sourceId: 'app_1',
          userId: 'user_1'
        }),
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app_1',
        userId: 'user_1',
        chatId: 'chat_1'
      },
      { onUpgrade: undefined }
    );
  });

  it('converts skill edit source into stable edit sandbox id without exposing appId input', async () => {
    const { prepareAgentSandboxRuntime } =
      await import('@fastgpt/service/core/ai/sandbox/application/runtime');

    await prepareAgentSandboxRuntime({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill_1',
      userId: 'user_1',
      chatId: 'edit-debug'
    });

    expect(mocks.getSandboxClient).toHaveBeenCalledWith(
      {
        sandboxId: getEditDebugSandboxId('skill_1'),
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'skill_1',
        userId: ChatSourceTypeEnum.skillEdit,
        chatId: 'edit-debug'
      },
      { onUpgrade: undefined }
    );
  });

  it('forwards onUpgrade callback into getSandboxClient', async () => {
    const { prepareAgentSandboxRuntime } =
      await import('@fastgpt/service/core/ai/sandbox/application/runtime');
    const onUpgrade = vi.fn();

    await prepareAgentSandboxRuntime({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      onUpgrade
    });

    expect(mocks.getSandboxClient).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'app_1' }),
      { onUpgrade }
    );
  });
});

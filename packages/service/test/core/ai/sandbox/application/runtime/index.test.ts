import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { getEditDebugSandboxId } from '@fastgpt/service/core/ai/skill/edit/config';

const mocks = vi.hoisted(() => ({
  getSandboxClient: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', () => ({
  getSandboxClient: mocks.getSandboxClient
}));

describe('prepareAgentSandboxRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSandboxClient.mockImplementation(
      async (query: { sourceType: ChatSourceTypeEnum; chatId: string }) => ({
        getSandboxId: () => 'sandbox',
        getRuntimePaths: () => ({
          workspaceRoot: '/workspace',
          runtimeSkillsRoot: '/workspace/projects',
          sessionWorkDirectory:
            query.sourceType === ChatSourceTypeEnum.skillEdit
              ? '/workspace'
              : `/workspace/sessions/${query.chatId}`
        })
      })
    );
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

    expect(mocks.getSandboxClient).toHaveBeenCalledWith({
      sandboxId: generateSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app_1',
        userId: 'user_1'
      }),
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1'
    });
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

    expect(mocks.getSandboxClient).toHaveBeenCalledWith({
      sandboxId: getEditDebugSandboxId('skill_1'),
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill_1',
      userId: ChatSourceTypeEnum.skillEdit,
      chatId: 'edit-debug'
    });
  });

  it('maps skill debug conversation chatId to edit-debug physical sandbox id', async () => {
    const { prepareAgentSandboxRuntime } =
      await import('@fastgpt/service/core/ai/sandbox/application/runtime');

    await expect(
      prepareAgentSandboxRuntime({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'skill_1',
        userId: 'user_1',
        chatId: 'debug-session-123'
      })
    ).resolves.toEqual({
      sandboxClient: expect.any(Object),
      workspaceRoot: '/workspace',
      workDirectory: '/workspace'
    });

    expect(mocks.getSandboxClient).toHaveBeenCalledWith({
      sandboxId: getEditDebugSandboxId('skill_1'),
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill_1',
      userId: ChatSourceTypeEnum.skillEdit,
      chatId: 'edit-debug'
    });
  });
});

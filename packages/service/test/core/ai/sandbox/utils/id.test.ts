import { describe, expect, it } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getSandboxUserId } from '@fastgpt/service/core/ai/sandbox/utils/id';

describe('sandbox v2 identity', () => {
  it('normalizes the logical user by source type', () => {
    expect(
      getSandboxUserId({
        sourceType: ChatSourceTypeEnum.app,
        userId: 'user-1'
      })
    ).toBe('user-1');
    expect(
      getSandboxUserId({
        sourceType: ChatSourceTypeEnum.workflowBuilder,
        userId: 'user-1'
      })
    ).toBe('user-1');
    expect(
      getSandboxUserId({
        sourceType: ChatSourceTypeEnum.skillEdit,
        userId: 'request-user'
      })
    ).toBe(ChatSourceTypeEnum.skillEdit);
    expect(() =>
      getSandboxUserId({
        sourceType: ChatSourceTypeEnum.chatAgentHelper,
        userId: 'user-1'
      })
    ).toThrow('does not support sandbox identity');
  });

  it('uses a separate physical identity for Workflow Builder', async () => {
    const { getRunningSandboxId } = await import('@fastgpt/service/core/ai/sandbox/utils/id');
    const appSandboxId = getRunningSandboxId({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      userId: 'user-1'
    });
    const builderSandboxId = getRunningSandboxId({
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId: 'app-1',
      userId: 'user-1'
    });

    expect(appSandboxId).toMatch(/^app-[a-f0-9]{16}$/);
    expect(builderSandboxId).toMatch(/^workflowbuilder-[a-f0-9]{16}$/);
    expect(builderSandboxId).not.toBe(appSandboxId);
  });
});

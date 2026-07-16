import { describe, expect, it } from 'vitest';
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getRunningSandboxId, getSandboxUserId } from '@fastgpt/service/core/ai/sandbox/utils/id';

describe('sandbox v2 identity', () => {
  it('keeps the effective App user as the logical userId', () => {
    expect(
      getRunningSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        userId: 'user-1'
      })
    ).toBe(
      generateSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        userId: 'user-1'
      })
    );
  });

  it('normalizes every Skill Edit caller to the enum userId', () => {
    expect(
      getSandboxUserId({
        sourceType: ChatSourceTypeEnum.skillEdit,
        userId: 'request-user'
      })
    ).toBe(ChatSourceTypeEnum.skillEdit);
    expect(
      getRunningSandboxId({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'skill-1',
        userId: 'request-user'
      })
    ).toBe(
      generateSandboxId({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'skill-1',
        userId: ChatSourceTypeEnum.skillEdit
      })
    );
  });

  it('rejects source types that cannot own a v2 sandbox', () => {
    expect(() =>
      getSandboxUserId({
        sourceType: ChatSourceTypeEnum.chatAgentHelper,
        userId: 'user-1'
      })
    ).toThrow('does not support sandbox identity');
  });
});

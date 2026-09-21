import { describe, it, expect } from 'vitest';
import {
  generateSandboxId,
  SANDBOX_SYSTEM_PROMPT,
  SKILL_EDIT_SANDBOX_SYSTEM_PROMPT
} from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

describe('generateSandboxId', () => {
  it('returns a stable prefixed ID for one logical identity', () => {
    const identity = {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app1',
      userId: 'user1'
    };
    const id1 = generateSandboxId(identity);
    const id2 = generateSandboxId(identity);

    expect(id1).toBe(id2);
    expect(id1).toMatch(/^app-[0-9a-f]{16}$/);
    expect(
      generateSandboxId({
        ...identity,
        userId: 'user2'
      })
    ).not.toBe(id1);
    expect(
      generateSandboxId({
        ...identity,
        sourceId: 'app2'
      })
    ).not.toBe(id1);
  });

  it('normalizes the source prefix for provider-compatible resource names', () => {
    const sandboxId = generateSandboxId({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill1',
      userId: ChatSourceTypeEnum.skillEdit
    });

    expect(sandboxId).toMatch(/^skilledit-[0-9a-f]{16}$/);
    expect(sandboxId).toBe(sandboxId.toLowerCase());
  });
});

describe('sandbox system prompts', () => {
  it('only advertises injected user_files to runtimes that actually mount them', () => {
    expect(SANDBOX_SYSTEM_PROMPT).toContain('user_files/');
    expect(SKILL_EDIT_SANDBOX_SYSTEM_PROMPT).not.toContain('user_files/');
    expect(SKILL_EDIT_SANDBOX_SYSTEM_PROMPT).toContain('sandbox_read_file');
  });
});

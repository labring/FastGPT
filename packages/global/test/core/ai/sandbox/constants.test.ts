import { describe, it, expect } from 'vitest';
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

describe('generateSandboxId', () => {
  it('returns the same prefixed ID for the same logical identity', () => {
    const identity = {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app1',
      userId: 'user1'
    };
    const id1 = generateSandboxId(identity);
    const id2 = generateSandboxId(identity);

    expect(id1).toBe(id2);
    expect(id1).toMatch(/^app-[0-9a-f]{16}$/);
  });

  it('changes when sourceId or userId changes', () => {
    const id1 = generateSandboxId({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app1',
      userId: 'user1'
    });
    const id2 = generateSandboxId({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app1',
      userId: 'user2'
    });
    const id3 = generateSandboxId({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app2',
      userId: 'user1'
    });

    expect(id1).not.toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id2).not.toBe(id3);
  });
});

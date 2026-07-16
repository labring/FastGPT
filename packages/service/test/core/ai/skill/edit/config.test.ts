import { describe, expect, it } from 'vitest';
import {
  EDIT_DEBUG_SANDBOX_CHAT_ID,
  getEditDebugSandboxId
} from '@fastgpt/service/core/ai/skill/edit/config';
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

describe('skill edit config', () => {
  it('builds the Skill Edit sandbox id from its fixed logical identity', () => {
    expect(EDIT_DEBUG_SANDBOX_CHAT_ID).toBe('edit-debug');
    expect(getEditDebugSandboxId('skill-1')).toBe(
      generateSandboxId({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'skill-1',
        userId: ChatSourceTypeEnum.skillEdit
      })
    );
    expect(getEditDebugSandboxId('skill-1')).not.toBe(getEditDebugSandboxId('skill-2'));
  });
});

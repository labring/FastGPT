import { describe, expect, it } from 'vitest';
import {
  EDIT_DEBUG_SANDBOX_CHAT_ID,
  getEditDebugSandboxId
} from '@fastgpt/service/core/ai/skill/edit/config';

describe('skill edit config', () => {
  it('builds edit-debug sandbox id from skill id and edit-debug chat id only', () => {
    expect(EDIT_DEBUG_SANDBOX_CHAT_ID).toBe('edit-debug');
    expect(getEditDebugSandboxId('skill-1')).toBe(getEditDebugSandboxId('skill-1'));
    expect(getEditDebugSandboxId('skill-1')).not.toBe(getEditDebugSandboxId('skill-2'));
  });
});

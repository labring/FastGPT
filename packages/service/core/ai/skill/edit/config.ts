import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';

export const EDIT_DEBUG_SANDBOX_CHAT_ID = 'edit-debug';

export const getEditDebugSandboxId = (skillId: string) =>
  generateSandboxId(skillId, '', EDIT_DEBUG_SANDBOX_CHAT_ID);

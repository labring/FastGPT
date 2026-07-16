import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

export const EDIT_DEBUG_SANDBOX_CHAT_ID = 'edit-debug';

export const getEditDebugSandboxId = (skillId: string) =>
  generateSandboxId({
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: skillId,
    userId: ChatSourceTypeEnum.skillEdit
  });

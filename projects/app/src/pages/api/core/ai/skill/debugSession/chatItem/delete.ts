import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { UserError } from '@fastgpt/global/common/error/utils';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  SkillDebugDeleteChatItemBodySchema,
  type SkillDebugDeleteChatItemBody
} from '@fastgpt/global/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps<SkillDebugDeleteChatItemBody>) {
  const { skillId, chatId, contentId } = parseApiInput({
    req,
    bodySchema: SkillDebugDeleteChatItemBodySchema
  }).body;

  if (!skillId) throw new UserError('skillId is required');
  if (!chatId) throw new UserError('chatId is required');
  if (!contentId) throw new UserError('contentId is required');

  await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: WritePermissionVal
  });

  await MongoChatItem.updateOne(
    {
      appId: skillId,
      chatId,
      dataId: contentId
    },
    {
      $set: { deleteTime: new Date() }
    }
  );

  return;
}

export default NextAPI(handler);

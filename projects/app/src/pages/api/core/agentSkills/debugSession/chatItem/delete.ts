import type { NextApiResponse } from 'next';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { UserError } from '@fastgpt/global/common/error/utils';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import type { SkillDebugDeleteChatItemBody } from '@fastgpt/global/core/agentSkills/api';

async function handler(req: ApiRequestProps<SkillDebugDeleteChatItemBody>, _res: NextApiResponse) {
  const { skillId, chatId, contentId } = req.body;

  if (!skillId) throw new UserError('skillId is required');
  if (!chatId) throw new UserError('chatId is required');
  if (!contentId) throw new UserError('contentId is required');

  await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: ReadPermissionVal
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

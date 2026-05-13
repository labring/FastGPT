import { NextAPI } from '@/service/middleware/entry';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { SkillDebugSessionControlBodySchema } from '@fastgpt/global/openapi/core/agentSkills/api';

async function handler(req: ApiRequestProps): Promise<void> {
  const { skillId, chatId } = SkillDebugSessionControlBodySchema.parse(req.body);

  await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: ReadPermissionVal
  });

  await MongoChat.updateOne(
    { appId: skillId, chatId },
    { $set: { hasBeenRead: true, updateTime: new Date() } }
  );
}

export default NextAPI(handler);

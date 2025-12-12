import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type {
  SaveGeneratedSkillParamsType,
  SaveGeneratedSkillResponseType
} from '@fastgpt/global/openapi/core/chat/helperBot/generatedSkill/api';
import { authHelperBotChatCrud } from '@/service/support/permission/auth/chat';
import { MongoHelperBotGeneratedSkill } from '@fastgpt/service/core/chat/HelperBot/generatedSkillSchema';
import { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';

type SaveBody = SaveGeneratedSkillParamsType;
type SaveResponse = SaveGeneratedSkillResponseType;

async function handler(
  req: ApiRequestProps<SaveBody>,
  res: ApiResponseType<any>
): Promise<SaveResponse> {
  const { appId, chatId, chatItemId, name, description, steps, status } = req.body;

  // Validate user has access to this chat
  const { chat, userId, teamId, tmbId } = await authHelperBotChatCrud({
    type: HelperBotTypeEnum.skillAgent,
    chatId,
    req,
    authToken: true
  });

  console.log('=== Save Generated Skill ===');
  console.log('userId:', userId);
  console.log('tmbId:', tmbId);
  console.log('teamId:', teamId);
  console.log('appId:', appId);

  // Create new generated skill document
  const generatedSkill = await MongoHelperBotGeneratedSkill.create({
    userId,
    tmbId,
    teamId,
    appId,
    chatId,
    chatItemId,
    name,
    description,
    steps,
    status: status || 'draft',
    createTime: new Date(),
    updateTime: new Date()
  });

  return {
    _id: String(generatedSkill._id)
  };
}

export default NextAPI(handler);

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { DeleteGeneratedSkillParamsType } from '@fastgpt/global/openapi/core/ai/skill/api';
import { MongoHelperBotGeneratedSkill } from '@fastgpt/service/core/chat/HelperBot/generatedSkillSchema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

type DeleteBody = DeleteGeneratedSkillParamsType;
type DeleteResponse = { success: boolean };

async function handler(
  req: ApiRequestProps<DeleteBody>,
  res: ApiResponseType<any>
): Promise<DeleteResponse> {
  const { id } = req.query;
  const { userId, teamId } = await authUserPer({ req, authToken: true, per: WritePermissionVal });

  // Delete the document
  const result = await MongoHelperBotGeneratedSkill.deleteOne({
    _id: id,
    userId,
    teamId
  });

  if (result.deletedCount === 0) {
    throw new Error('Generated skill not found or access denied');
  }

  return { success: true };
}

export default NextAPI(handler);

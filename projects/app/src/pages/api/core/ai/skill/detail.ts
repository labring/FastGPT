import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { GetGeneratedSkillDetailParamsType } from '@fastgpt/global/openapi/core/ai/skill/api';
import { MongoHelperBotGeneratedSkill } from '@fastgpt/service/core/chat/HelperBot/generatedSkillSchema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { GeneratedSkillSiteType } from '@fastgpt/global/core/chat/helperBot/generatedSkill/type';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

type DetailQuery = GetGeneratedSkillDetailParamsType;
type DetailResponse = GeneratedSkillSiteType;

async function handler(
  req: ApiRequestProps<{}, DetailQuery>,
  res: ApiResponseType<any>
): Promise<DetailResponse> {
  const { id } = req.query;
  const { userId, teamId } = await authUserPer({ req, authToken: true, per: ReadPermissionVal });

  // Find the generated skill and verify ownership
  const generatedSkill = await MongoHelperBotGeneratedSkill.findOne({
    _id: id,
    userId,
    teamId
  }).lean();

  if (!generatedSkill) {
    throw new Error('Generated skill not found or access denied');
  }

  // Remove userId and teamId from response
  const { userId: _, teamId: __, ...rest } = generatedSkill;

  return {
    ...rest,
    _id: String(rest._id)
  } as any;
}

export default NextAPI(handler);

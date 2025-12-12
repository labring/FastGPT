import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { UpdateGeneratedSkillParamsType } from '@fastgpt/global/openapi/core/chat/helperBot/generatedSkill/api';
import { MongoHelperBotGeneratedSkill } from '@fastgpt/service/core/chat/HelperBot/generatedSkillSchema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

type UpdateBody = UpdateGeneratedSkillParamsType;
type UpdateResponse = { success: boolean };

async function handler(
  req: ApiRequestProps<UpdateBody>,
  res: ApiResponseType<any>
): Promise<UpdateResponse> {
  const { id, name, description, steps, status } = req.body;
  const { userId, teamId } = await authUserPer({ req, authToken: true, per: 'w' });

  // Build update object
  const updateData: any = {
    updateTime: new Date()
  };

  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (steps !== undefined) updateData.steps = steps;
  if (status !== undefined) updateData.status = status;

  // Update the document
  const result = await MongoHelperBotGeneratedSkill.updateOne(
    {
      _id: id,
      userId,
      teamId
    },
    { $set: updateData }
  );

  if (result.matchedCount === 0) {
    throw new Error('Generated skill not found or access denied');
  }

  return { success: true };
}

export default NextAPI(handler);

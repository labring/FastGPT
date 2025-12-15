import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { UpdateGeneratedSkillParamsType } from '@fastgpt/global/openapi/core/ai/skill/api';
import { MongoHelperBotGeneratedSkill } from '@fastgpt/service/core/chat/HelperBot/generatedSkillSchema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';

type UpdateBody = UpdateGeneratedSkillParamsType;
type UpdateResponse = { success: boolean; _id: string };

async function handler(
  req: ApiRequestProps<UpdateBody>,
  res: ApiResponseType<any>
): Promise<UpdateResponse> {
  const { id, appId, name, description, steps, status } = req.body;

  let userId: string;
  let teamId: string;
  let tmbId: string | number;

  if (id) {
    const auth = await authUserPer({ req, authToken: true, per: WritePermissionVal });
    userId = auth.userId;
    teamId = auth.teamId;
    tmbId = auth.tmbId || '';
  } else {
    if (!appId) {
      throw new Error('appId is required for creating a new skill');
    }
    const auth = await authUserPer({ req, authToken: true, per: WritePermissionVal });
    userId = auth.userId;
    teamId = auth.teamId;
    tmbId = auth.tmbId || '';
  }

  const docId = id || new Types.ObjectId().toString();

  const updateData: any = {
    updateTime: new Date()
  };

  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (steps !== undefined) updateData.steps = steps;
  if (status !== undefined) updateData.status = status;

  const setOnInsert: any = {
    _id: docId,
    userId,
    tmbId,
    teamId,
    appId: appId || '',
    createTime: new Date()
  };

  const result = await MongoHelperBotGeneratedSkill.updateOne(
    { _id: docId },
    {
      $set: updateData,
      $setOnInsert: setOnInsert
    },
    { upsert: true }
  );

  return { success: true, _id: docId };
}

export default NextAPI(handler);

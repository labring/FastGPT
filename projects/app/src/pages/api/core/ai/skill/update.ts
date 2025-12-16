import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  UpdateAiSkillBody,
  type UpdateAiSkillBodyType,
  type UpdateAiSkillResponse
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { MongoAiSkill } from '@fastgpt/service/core/ai/skill/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { UserError } from '@fastgpt/global/common/error/utils';

async function handler(
  req: ApiRequestProps<UpdateAiSkillBodyType>,
  res: ApiResponseType<any>
): Promise<UpdateAiSkillResponse> {
  const { id, appId, name, description, steps, tools, datasets } = UpdateAiSkillBody.parse(
    req.body
  );

  // Auth app with write permission
  const { teamId, tmbId } = await authApp({
    req,
    appId,
    per: WritePermissionVal,
    authToken: true
  });

  if (id) {
    const skill = await MongoAiSkill.findOne({ _id: id, teamId, appId });
    if (!skill) {
      return Promise.reject(new UserError('AI skill not found'));
    }

    if (name !== undefined) {
      skill.name = name;
    }
    if (description !== undefined) skill.description = description;
    if (steps !== undefined) skill.steps = steps;
    if (tools !== undefined) skill.tools = tools;
    if (datasets !== undefined) skill.datasets = datasets;
    skill.updateTime = new Date();

    await skill.save();

    return skill._id;
  }

  // Create
  const newSkill = await MongoAiSkill.create({
    teamId,
    tmbId,
    appId,
    name,
    description,
    steps,
    tools,
    datasets
  });

  return newSkill._id;
}

export default NextAPI(handler);

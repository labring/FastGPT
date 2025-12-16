import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  DeleteAiSkillQuery,
  DeleteAiSkillResponseSchema,
  type DeleteAiSkillResponse
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { MongoAiSkill } from '@fastgpt/service/core/ai/skill/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { UserError } from '@fastgpt/global/common/error/utils';

async function handler(
  req: ApiRequestProps,
  res: ApiResponseType<any>
): Promise<DeleteAiSkillResponse> {
  const { id } = DeleteAiSkillQuery.parse(req.query);

  // First, find the skill to get appId
  const skill = await MongoAiSkill.findById(id, 'appId').lean();
  if (!skill) {
    return Promise.reject(new UserError('AI skill not found'));
  }

  // Auth app with write permission
  const { teamId } = await authApp({
    req,
    appId: String(skill.appId),
    per: WritePermissionVal,
    authToken: true
  });

  // Delete the document
  const result = await MongoAiSkill.deleteOne({
    _id: id,
    appId: skill.appId,
    teamId
  });

  if (result.deletedCount === 0) {
    return Promise.reject(new UserError('AI skill not found or access denied'));
  }

  return DeleteAiSkillResponseSchema.parse({});
}

export default NextAPI(handler);

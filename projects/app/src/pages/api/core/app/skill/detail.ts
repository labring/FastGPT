import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getSkillTemplateById } from '@fastgpt/global/core/app/skill/constants';
import {
  DetailSkillQuerySchema,
  DetailSkillResponseSchema,
  type DetailSkillResponseType
} from '@fastgpt/global/openapi/core/app/skill/api';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(req: ApiRequestProps): Promise<DetailSkillResponseType> {
  await authCert({ req, authToken: true });
  const { skillId } = DetailSkillQuerySchema.parse(req.query);

  const skill = getSkillTemplateById(skillId);
  if (!skill) {
    return Promise.reject('Skill template not found');
  }

  return DetailSkillResponseSchema.parse(skill);
}

export default NextAPI(handler);

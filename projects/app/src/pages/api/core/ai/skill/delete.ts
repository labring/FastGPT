import { NextAPI } from '@/service/middleware/entry';
import {
  DeleteSkillQuerySchema,
  type DeleteSkillQuery
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { isValidObjectId } from 'mongoose';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { deleteSkill } from '@/service/core/ai/skill/delete';

async function handler(req: ApiRequestProps<Record<string, never>, DeleteSkillQuery>) {
  const { skillId } = parseApiInput({ req, querySchema: DeleteSkillQuerySchema }).query;

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  await deleteSkill({ req, skillId });
}

export default NextAPI(handler);

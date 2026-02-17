import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  ListSkillResponseSchema,
  type ListSkillResponseType
} from '@fastgpt/global/openapi/core/app/skill/api';
import { builtInSkillTemplates } from '@fastgpt/global/core/app/skill/constants';

async function handler(req: ApiRequestProps): Promise<ListSkillResponseType> {
  await authCert({ req, authToken: true });
  return ListSkillResponseSchema.parse(builtInSkillTemplates);
}

export default NextAPI(handler);

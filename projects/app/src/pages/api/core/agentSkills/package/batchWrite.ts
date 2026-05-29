import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import {
  editCurrentPackage,
  validatePackagePath,
  zipWriteText
} from '@fastgpt/service/core/agentSkills/packageEditor';
import {
  BatchWritePackageFilesBodySchema,
  type MutatePackageResponse
} from '@fastgpt/global/openapi/core/agentSkills/package/api';

async function handler(req: ApiRequestProps): Promise<MutatePackageResponse> {
  const { skillId, files } = BatchWritePackageFilesBodySchema.parse(req.body);

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }
  const normalizedFiles = files.map((f) => ({
    path: validatePackagePath(f.path),
    content: f.content
  }));

  const { teamId, skill } = await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: WritePermissionVal
  });

  return editCurrentPackage({
    skill,
    teamId,
    mutator: (zip) => {
      for (const { path, content } of normalizedFiles) {
        zipWriteText(zip, path, content);
      }
    }
  });
}

export default NextAPI(handler);

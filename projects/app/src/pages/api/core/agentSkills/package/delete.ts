import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  editCurrentPackage,
  validatePackagePath,
  zipDeleteRecursive
} from '@fastgpt/service/core/agentSkills/packageEditor';
import {
  DeletePackageEntryBodySchema,
  type MutatePackageResponse
} from '@fastgpt/global/openapi/core/agentSkills/package/api';

async function handler(req: ApiRequestProps): Promise<MutatePackageResponse> {
  const { skillId, path, recursive } = DeletePackageEntryBodySchema.parse(req.body);

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }
  const normalized = validatePackagePath(path);

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
    mutator: async (zip) => {
      const dirPrefix = normalized + '/';
      const hasDirEntry = !!zip.files[dirPrefix];
      const hasChildren = Object.keys(zip.files).some((k) => k.startsWith(dirPrefix));
      const isDir = hasDirEntry || hasChildren;
      if (isDir && !recursive) {
        throw new UserError('Target is a directory; pass recursive=true to remove it');
      }
      zipDeleteRecursive(zip, normalized);
    }
  });
}

export default NextAPI(handler);

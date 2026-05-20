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
  zipRename
} from '@fastgpt/service/core/agentSkills/packageEditor';
import {
  RenamePackageEntryBodySchema,
  type MutatePackageResponse
} from '@fastgpt/global/openapi/core/agentSkills/package/api';

async function handler(req: ApiRequestProps): Promise<MutatePackageResponse> {
  const { skillId, fromPath, toPath } = RenamePackageEntryBodySchema.parse(req.body);

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }
  const from = validatePackagePath(fromPath);
  const to = validatePackagePath(toPath);

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
      if (zip.file(to)) {
        throw new UserError(`Target already exists: ${toPath}`);
      }
      const toPrefix = to + '/';
      if (Object.keys(zip.files).some((k) => k === toPrefix || k.startsWith(toPrefix))) {
        throw new UserError(`Target already exists: ${toPath}`);
      }
      await zipRename(zip, from, to);
    }
  });
}

export default NextAPI(handler);

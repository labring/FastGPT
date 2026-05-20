import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { downloadSkillPackage } from '@fastgpt/service/core/agentSkills/storage';
import {
  listZipDirectory,
  validatePackagePath
} from '@fastgpt/service/core/agentSkills/packageEditor';
import JSZip from 'jszip';
import {
  ListPackageFilesBodySchema,
  type ListPackageFilesResponse
} from '@fastgpt/global/openapi/core/agentSkills/package/api';

async function handler(req: ApiRequestProps): Promise<ListPackageFilesResponse> {
  const { skillId, path } = ListPackageFilesBodySchema.parse(req.body);

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  const { skill } = await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: ReadPermissionVal
  });

  if (!skill.currentStorage || !skill.currentStorage.key) {
    return { files: [] };
  }

  const normalized = validatePackagePath(path, { allowRoot: true });

  const zipBuffer = await downloadSkillPackage({ storageInfo: skill.currentStorage });
  const zip = await JSZip.loadAsync(zipBuffer);

  return { files: listZipDirectory(zip, normalized) };
}

export default NextAPI(handler);

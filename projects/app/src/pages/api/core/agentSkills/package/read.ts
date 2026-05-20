import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { UserError } from '@fastgpt/global/common/error/utils';
import { downloadSkillPackage } from '@fastgpt/service/core/agentSkills/storage';
import { readZipFile, validatePackagePath } from '@fastgpt/service/core/agentSkills/packageEditor';
import JSZip from 'jszip';
import mime from 'mime';
import { ReadPackageFileBodySchema } from '@fastgpt/global/openapi/core/agentSkills/package/api';

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const { skillId, path } = ReadPackageFileBodySchema.parse(req.body);

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }
  const normalized = validatePackagePath(path);

  const { skill } = await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: ReadPermissionVal
  });

  if (!skill.currentStorage || !skill.currentStorage.key) {
    return Promise.reject(new UserError('Skill has no active version'));
  }

  const zipBuffer = await downloadSkillPackage({ storageInfo: skill.currentStorage });
  const zip = await JSZip.loadAsync(zipBuffer);
  const buffer = await readZipFile(zip, normalized);

  if (!buffer) {
    return Promise.reject(new UserError(`File not found: ${path}`));
  }

  const contentType = mime.getType(normalized) ?? 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.send(buffer);
}

export default NextAPI(handler);

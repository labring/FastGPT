import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { isValidObjectId } from 'mongoose';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { UserError } from '@fastgpt/global/common/error/utils';
import { multer } from '@fastgpt/service/common/file/multer';
import { getSkillSizeLimits } from '@fastgpt/service/core/agentSkills/sandboxConfig';
import {
  editCurrentPackage,
  validatePackagePath,
  zipWriteBinary
} from '@fastgpt/service/core/agentSkills/packageEditor';
import type { MutatePackageResponse } from '@fastgpt/global/openapi/core/agentSkills/package/api';
import fs from 'fs/promises';

export const config = {
  api: {
    bodyParser: false
  }
};

type UploadFormFields = {
  skillId?: string;
  path?: string;
};

async function handler(req: ApiRequestProps): Promise<MutatePackageResponse> {
  const filepaths: string[] = [];

  try {
    const { maxUploadBytes } = getSkillSizeLimits();
    const maxUploadMB = Math.ceil(maxUploadBytes / 1024 / 1024);

    const result = await multer.resolveFormData<UploadFormFields>({
      request: req,
      maxFileSize: maxUploadMB
    });

    filepaths.push(result.fileMetadata.path);

    const skillId = result.data.skillId ?? (req.body?.skillId as string | undefined);
    const path = result.data.path ?? (req.body?.path as string | undefined);

    if (!skillId || !isValidObjectId(skillId)) {
      return Promise.reject(SkillErrEnum.invalidSkillId);
    }
    if (!path) {
      return Promise.reject(new UserError('Path is required'));
    }
    const normalized = validatePackagePath(path);

    const { teamId, skill } = await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId,
      per: WritePermissionVal
    });

    const buffer = await fs.readFile(result.fileMetadata.path);

    return await editCurrentPackage({
      skill,
      teamId,
      mutator: (zip) => {
        zipWriteBinary(zip, normalized, buffer);
      }
    });
  } finally {
    await Promise.allSettled(filepaths.map((p) => fs.unlink(p)));
  }
}

export default NextAPI(handler);

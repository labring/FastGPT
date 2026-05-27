import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamSkillCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { importSkill } from '@fastgpt/service/core/ai/skill/manage';
import { getZipFileList } from '@fastgpt/service/core/ai/skill/package';
import {
  ImportSkillBodySchema,
  type ImportSkillBody,
  type ImportSkillResponse
} from '@fastgpt/global/core/ai/skill/api';
import type { SkillPackageType } from '@fastgpt/global/core/ai/skill/type';
import {
  AgentSkillCategoryEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/ai/skill/constants';
import { multer } from '@fastgpt/service/common/file/multer';
import { getSkillSizeLimits } from '@fastgpt/service/core/ai/skill/sandbox/config';
import fs from 'fs/promises';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.IMPORT);

export const config = {
  api: {
    bodyParser: false
  }
};

async function handler(req: ApiRequestProps<ImportSkillBody>): Promise<ImportSkillResponse> {
  const filepaths: string[] = [];

  try {
    // Read env limit before multer so both use the same value
    const { maxUploadBytes: maxArchiveSize, maxUncompressedBytes } = getSkillSizeLimits();
    // Convert bytes to MB for multer (multer expects MB)
    const maxArchiveSizeMB = Math.ceil(maxArchiveSize / 1024 / 1024);

    const result = await multer.resolveFormData<ImportSkillBody>({
      request: req,
      maxFileSize: maxArchiveSizeMB
    });

    filepaths.push(result.fileMetadata.path);

    const file = result.fileMetadata;
    const body = parseApiInput({
      req: { body: result.data },
      bodySchema: ImportSkillBodySchema
    }).body;

    if (!file.originalname?.toLowerCase().endsWith('.zip')) {
      return Promise.reject(SkillErrEnum.invalidArchiveFormat);
    }

    // Authenticate user and check permission
    let teamId: string;
    let tmbId: string;

    if (body.parentId) {
      // If importing into a folder, check write permission on the parent folder
      const authResult = await authSkill({
        req,
        authToken: true,
        authApiKey: true,
        skillId: body.parentId,
        per: WritePermissionVal
      });
      teamId = authResult.teamId;
      tmbId = authResult.tmbId;
    } else {
      // If importing to root, check team-level skill create permission
      const authResult = await authUserPer({
        req,
        authToken: true,
        authApiKey: true,
        per: TeamSkillCreatePermissionVal
      });
      teamId = authResult.teamId;
      tmbId = authResult.tmbId;
    }

    // Check archive size (multer already enforces the limit, this is a secondary guard)
    const stats = await fs.stat(file.path);
    if (stats.size > maxArchiveSize) {
      logger.warn('Archive file size exceeds maximum', {
        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
        maxMB: (maxArchiveSize / 1024 / 1024).toFixed(2)
      });
      return Promise.reject(SkillErrEnum.archiveTooLarge);
    }

    // Derive package-level name from caller-supplied value or archive filename
    const pkgName =
      body.name ||
      (file.originalname ?? 'package').replace(/\.(zip|tar\.gz|tgz|tar)$/i, '').trim() ||
      'package';
    const pkgDescription = body.description ?? '';

    // Directly read the ZIP archive buffer from disk without any in-memory decompression
    const zipBuffer = await fs.readFile(file.path);

    // Light-weight integrity validation to ensure the uploaded ZIP is a valid skill package containing SKILL.md
    const filesList = await getZipFileList(zipBuffer);
    const hasSkillMd = filesList.some((path) => path.toLowerCase().endsWith('skill.md'));
    if (!hasSkillMd) {
      return Promise.reject(SkillErrEnum.invalidSkillPackage);
    }

    // Build skill package using package-level metadata only
    const skillPackage: SkillPackageType = {
      skill: {
        name: pkgName,
        description: pkgDescription,
        category: [AgentSkillCategoryEnum.other],
        avatar: body.avatar
      }
    };

    // Create ONE DB record and upload the raw ZIP buffer straight to S3
    const skillId = await importSkill(
      skillPackage,
      teamId,
      tmbId,
      zipBuffer,
      body.parentId || null
    );

    // Add audit log
    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.IMPORT_SKILL,
        params: {
          skillName: pkgName,
          skillType: getI18nSkillType(AgentSkillTypeEnum.skill)
        }
      });
    })();

    return skillId;
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

export default NextAPI(handler);

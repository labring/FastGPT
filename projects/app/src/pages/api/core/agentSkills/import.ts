import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamSkillCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { importSkill } from '@fastgpt/service/core/agentSkills/controller';
import { repackFileMapAsZip } from '@fastgpt/service/core/agentSkills/zipBuilder';
import {
  getSupportedArchiveFormat,
  extractToFileMap
} from '@fastgpt/service/core/agentSkills/archiveUtils';
import type { ImportSkillBody, ImportSkillResponse } from '@fastgpt/global/core/agentSkills/api';
import type { SkillPackageType } from '@fastgpt/global/core/agentSkills/type';
import {
  AgentSkillCategoryEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import { multer } from '@fastgpt/service/common/file/multer';
import { getSkillSizeLimits } from '@fastgpt/service/core/agentSkills/sandboxConfig';
import fs from 'fs/promises';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

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
    // Support both JSON-wrapped body ({"data": "..."}) and plain multipart form fields
    const body: ImportSkillBody = {
      parentId: result.data.parentId ?? (req.body?.parentId as string | undefined),
      name: result.data.name ?? (req.body?.name as string | undefined),
      description: result.data.description ?? (req.body?.description as string | undefined),
      avatar: result.data.avatar ?? (req.body?.avatar as string | undefined)
    };

    const format = getSupportedArchiveFormat(file.originalname ?? '');
    if (!format) {
      return Promise.reject(SkillErrEnum.invalidArchiveFormat);
    }

    // Authenticate user and check permission
    let teamId: string;
    let tmbId: string;
    let userId: string | undefined;

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
      userId = authResult.userId;
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
      userId = authResult.userId;
    }

    // Check archive size (multer already enforces the limit, this is a secondary guard)
    const stats = await fs.stat(file.path);
    if (stats.size > maxArchiveSize) {
      return Promise.reject(
        new UserError(
          `Archive file size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum (${(maxArchiveSize / 1024 / 1024).toFixed(2)}MB)`
        )
      );
    }

    // Extract archive to file map
    let fileMap: Record<string, Buffer>;
    try {
      fileMap = await extractToFileMap(file.path, maxUncompressedBytes);
    } catch (err: any) {
      return Promise.reject(
        new UserError(`Failed to extract archive: ${err.message || 'Unknown error'}`)
      );
    }
    if (Object.keys(fileMap).length === 0) {
      return Promise.reject(new UserError('Archive is empty'));
    }

    // Derive package-level name from caller-supplied value or archive filename
    const pkgName =
      body.name ||
      (file.originalname ?? 'package').replace(/\.(zip|tar\.gz|tgz|tar)$/i, '').trim() ||
      'package';
    const pkgDescription = body.description ?? '';

    // Repack the entire fileMap as a single ZIP (converts TAR/TAR.GZ to ZIP)
    const zipBuffer = await repackFileMapAsZip(fileMap);

    // Build skill package using package-level metadata only
    const skillPackage: SkillPackageType = {
      skill: {
        name: pkgName,
        description: pkgDescription,
        category: [AgentSkillCategoryEnum.other],
        config: {},
        avatar: body.avatar
      }
    };

    // Create ONE DB record
    const skillId = await mongoSessionRun(async (session) =>
      importSkill(
        skillPackage,
        teamId,
        tmbId,
        userId || '',
        zipBuffer,
        body.parentId || null,
        session
      )
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
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      return Promise.reject(SkillErrEnum.skillNameExists);
    }
    throw err;
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

export default NextAPI(handler);

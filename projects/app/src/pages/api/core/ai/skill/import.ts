import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamSkillCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { importSkill } from '@fastgpt/service/core/ai/skill/manage';
import { validateZipStructure } from '@fastgpt/service/core/ai/skill/package';
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
import fs from 'fs/promises';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { serviceEnv } from '@fastgpt/service/env';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.IMPORT);

/**
 * 归一化上传文件名。
 *
 * 浏览器或网关可能把 multipart filename 中的 UTF-8 字节按 latin1 传给 multer，
 * 这里先兼容百分号编码，再在全量字符都属于 latin1 范围时尝试还原 UTF-8 中文名。
 */
const normalizeUploadedFilename = (filename: string) => {
  const decoded = (() => {
    try {
      return decodeURIComponent(filename);
    } catch {
      return filename;
    }
  })();

  const chars = Array.from(decoded);
  if (chars.some((char) => char.charCodeAt(0) > 0xff)) {
    return decoded;
  }

  const repaired = Buffer.from(decoded, 'latin1').toString('utf8');
  return repaired.includes('\uFFFD') ? decoded : repaired;
};

const getSkillNameFromArchiveFilename = (filename: string) => {
  const basename = filename.split(/[\\/]/).pop() || filename;
  return basename.replace(/\.(zip|tar\.gz|tgz|tar)$/i, '').trim();
};

export const config = {
  api: {
    bodyParser: false
  }
};

async function handler(req: ApiRequestProps<ImportSkillBody>): Promise<ImportSkillResponse> {
  const filepaths: string[] = [];

  try {
    // Read env limit before multer so both use the same value
    const maxSkillPackageSize = serviceEnv.AGENT_SANDBOX_SKILL_MAX_SIZE * 1024 * 1024;
    // Convert bytes to MB for multer (multer expects MB)
    const maxSkillPackageSizeMB = Math.ceil(maxSkillPackageSize / 1024 / 1024);

    const result = await multer.resolveFormData<ImportSkillBody>({
      request: req,
      maxFileSize: maxSkillPackageSizeMB
    });

    filepaths.push(result.fileMetadata.path);

    const file = result.fileMetadata;
    const normalizedOriginalName = normalizeUploadedFilename(file.originalname || '');
    const body = parseApiInput({
      req: { body: result.data },
      bodySchema: ImportSkillBodySchema
    }).body;

    if (!normalizedOriginalName.toLowerCase().endsWith('.zip')) {
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
    if (stats.size > maxSkillPackageSize) {
      logger.warn('Archive file size exceeds maximum', {
        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
        maxMB: (maxSkillPackageSize / 1024 / 1024).toFixed(2)
      });
      return Promise.reject(SkillErrEnum.archiveTooLarge);
    }

    // Directly read the ZIP archive buffer from disk without any in-memory decompression
    const zipBuffer = await fs.readFile(file.path);

    // Light-weight structure validation: the package must contain an exact SKILL.md entry.
    const validation = await validateZipStructure(zipBuffer, {
      maxUncompressedBytes: maxSkillPackageSize
    });
    if (!validation.valid) {
      return Promise.reject(SkillErrEnum.invalidSkillPackage);
    }

    // 用户未手动命名时，展示名严格来自上传 ZIP 文件名，不读取 SKILL.md 作为兜底。
    const pkgName =
      body.name?.trim() ||
      getSkillNameFromArchiveFilename(normalizedOriginalName || 'package') ||
      'package';
    const pkgDescription = body.description?.trim() ?? '';

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

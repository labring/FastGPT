import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { importSkill } from '@fastgpt/service/core/agentSkill/controller';
import { extractSkillFromMarkdown } from '@fastgpt/service/core/agentSkill/utils';
import {
  repackFileMapAsZip,
  standardizePackageZip
} from '@fastgpt/service/core/agentSkill/zipBuilder';
import {
  getSupportedArchiveFormat,
  extractToFileMap,
  findAllSkillMdKeys
} from '@fastgpt/service/core/agentSkill/archiveUtils';
import type { ImportSkillBody, ImportSkillResponse } from '@fastgpt/global/core/agentSkill/api';
import type { SkillPackageType } from '@fastgpt/global/core/agentSkill/type';
import { multer } from '@fastgpt/service/common/file/multer';
import fs from 'fs/promises';

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const filepaths: string[] = [];

  try {
    if (req.method !== 'POST') {
      return jsonRes(res, { code: 405, error: 'Method not allowed' });
    }

    const result = await multer.resolveFormData<ImportSkillBody>({
      request: req,
      maxFileSize: 10 // 10MB
    });

    filepaths.push(result.fileMetadata.path);

    const file = result.fileMetadata;
    // Support both JSON-wrapped body ({"data": "..."}) and plain multipart form fields
    const body: ImportSkillBody = {
      name: result.data.name ?? (req.body?.name as string | undefined),
      description: result.data.description ?? (req.body?.description as string | undefined)
    };

    const format = getSupportedArchiveFormat(file.originalname ?? '');
    if (!format) {
      return jsonRes(res, {
        code: 400,
        error: 'Only ZIP, TAR, and TAR.GZ files are supported'
      });
    }

    const { teamId, tmbId, userId } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true
    });

    // Check archive size
    const maxSizeEnv = process.env.MAX_SKILL_ZIP_SIZE;
    const maxArchiveSize = maxSizeEnv ? parseInt(maxSizeEnv, 10) : 50 * 1024 * 1024;
    const stats = await fs.stat(file.path);
    if (stats.size > maxArchiveSize) {
      return jsonRes(res, {
        code: 400,
        error: `Archive file size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum (${(maxArchiveSize / 1024 / 1024).toFixed(2)}MB)`
      });
    }

    // Extract archive to file map
    let fileMap: Record<string, Buffer>;
    try {
      fileMap = await extractToFileMap(file.path);
    } catch (err: any) {
      return jsonRes(res, {
        code: 400,
        error: `Failed to extract archive: ${err.message || 'Unknown error'}`
      });
    }
    if (Object.keys(fileMap).length === 0) {
      return jsonRes(res, { code: 400, error: 'Archive is empty' });
    }

    // Find all SKILL.md paths (multi-skill or single-skill)
    const skillMdKeys = findAllSkillMdKeys(fileMap);
    if (skillMdKeys.length === 0) {
      return jsonRes(res, {
        code: 400,
        error: 'No SKILL.md found in archive (expected in root or top-level subdirectories)'
      });
    }

    // Decide package-level name / description
    let pkgName: string;
    let pkgDescription: string;

    if (body.name) {
      // Caller supplied name explicitly — use it regardless of skill count
      pkgName = body.name;
      pkgDescription = body.description ?? '';
    } else if (skillMdKeys.length === 1) {
      // Single-skill package: fall back to SKILL.md frontmatter
      const markdown = fileMap[skillMdKeys[0]].toString('utf-8');
      const { skill, error: extractError } = extractSkillFromMarkdown(markdown);
      if (extractError || !skill) {
        return jsonRes(res, {
          code: 400,
          error: `Failed to parse SKILL.md: ${extractError || 'Unknown error'}`
        });
      }
      pkgName = skill.name;
      pkgDescription = (skill.description as string) ?? '';
    } else {
      // Multi-skill without explicit name: derive from archive filename
      const archiveName =
        (file.originalname ?? 'package').replace(/\.(zip|tar\.gz|tgz|tar)$/i, '').trim() ||
        'package';
      pkgName = archiveName;
      pkgDescription = body.description ?? '';
    }

    // Non-blocking validation of each SKILL.md (warn only, do not block import)
    for (const skillMdKey of skillMdKeys) {
      const markdown = fileMap[skillMdKey].toString('utf-8');
      const { error: validationError } = extractSkillFromMarkdown(markdown);
      if (validationError) {
        console.warn(
          `[import skill] SKILL.md validation warning at "${skillMdKey}": ${validationError}`
        );
      }
    }

    // Repack the entire fileMap as ONE ZIP, then normalize directory names to canonical names
    const rawZipBuffer = await repackFileMapAsZip(fileMap);
    const { buffer: zipBuffer } = await standardizePackageZip(rawZipBuffer);

    // Build skill package using package-level metadata only
    const skillPackage: SkillPackageType = {
      skill: {
        name: pkgName,
        description: pkgDescription,
        category: ['other'],
        config: {}
      }
    };

    // Create ONE DB record
    const skillId = await mongoSessionRun(async (session) =>
      importSkill(skillPackage, teamId, tmbId, userId || '', zipBuffer, session)
    );

    jsonRes<ImportSkillResponse>(res, { data: skillId });
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      return jsonRes(res, { code: 409, error: err.message });
    }
    jsonRes(res, { code: 500, error: err });
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

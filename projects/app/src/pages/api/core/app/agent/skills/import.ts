import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { importSkill } from '@fastgpt/service/core/agentSkill/controller';
import {
  parseSkillPackage,
  extractSkillFromMarkdown
} from '@fastgpt/service/core/agentSkill/utils';
import { createSkillPackage } from '@fastgpt/service/core/agentSkill/zipBuilder';
import {
  getSupportedArchiveFormat,
  extractToFileMap,
  findSkillMdKey,
  getRootPrefix,
  stripRootPrefix
} from '@fastgpt/service/core/agentSkill/archiveUtils';
import type {
  ImportSkillBody,
  ImportSkillResponse,
  ExtractedSkillPackage
} from '@fastgpt/global/core/agentSkill/api';
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
    // Only accept POST requests
    if (req.method !== 'POST') {
      return jsonRes(res, {
        code: 405,
        error: 'Method not allowed'
      });
    }

    // Parse form data to get the file using multer
    const result = await multer.resolveFormData<ImportSkillBody>({
      request: req,
      maxFileSize: 10 // 10MB
    });

    filepaths.push(result.fileMetadata.path);

    const file = result.fileMetadata;
    // Support both JSON data field and direct form fields
    const overrideName: string | undefined = result.data?.name ?? req.body?.name;
    const overrideDescription: string | undefined =
      result.data?.description ?? req.body?.description;

    // Validate file type
    const format = getSupportedArchiveFormat(file.originalname ?? '');
    if (!format) {
      return jsonRes(res, {
        code: 400,
        error: 'Only ZIP, TAR, and TAR.GZ files are supported'
      });
    }

    // Authenticate user
    const { teamId, tmbId, userId } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true
    });

    // Extract and validate archive content
    let skillPackage;
    let zipBuffer: Buffer;

    try {
      const extracted = await extractSkillPackage(file.path);
      skillPackage = extracted.skillPackage;
      zipBuffer = extracted.zipBuffer;
    } catch (error: any) {
      return jsonRes(res, {
        code: 400,
        error: error.message || 'Failed to extract skill package'
      });
    }

    // Apply name/description overrides from request body
    if (overrideName?.trim()) skillPackage.skill.name = overrideName.trim();
    if (overrideDescription?.trim()) skillPackage.skill.description = overrideDescription.trim();

    // Import skill with transaction
    const skillId = await mongoSessionRun(async (session) => {
      return importSkill(skillPackage, teamId, tmbId, userId || '', zipBuffer, session);
    });

    jsonRes<ImportSkillResponse>(res, {
      data: skillId
    });
  } catch (err: any) {
    // Handle specific errors
    if (err.message?.includes('already exists')) {
      return jsonRes(res, {
        code: 409,
        error: err.message
      });
    }

    jsonRes(res, {
      code: 500,
      error: err
    });
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

/**
 * Extract and validate skill package from archive (zip/tar/tar.gz).
 * Internal storage format remains ZIP; the archive is converted after extraction.
 */
async function extractSkillPackage(filePath: string): Promise<ExtractedSkillPackage> {
  // Check archive file size (50MB default, configurable via env var)
  const maxSizeEnv = process.env.MAX_SKILL_ZIP_SIZE;
  const maxArchiveSize = maxSizeEnv ? parseInt(maxSizeEnv, 10) : 50 * 1024 * 1024;

  const stats = await fs.stat(filePath);
  if (stats.size > maxArchiveSize) {
    throw new Error(
      `Archive file size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum (${(maxArchiveSize / 1024 / 1024).toFixed(2)}MB)`
    );
  }

  // 1. Extract all files (supports zip/tar/tar.gz via decompress)
  let fileMap: Record<string, Buffer>;
  try {
    fileMap = await extractToFileMap(filePath);
  } catch (err: any) {
    throw new Error(`Failed to extract archive: ${err.message || 'Unknown error'}`);
  }
  if (Object.keys(fileMap).length === 0) throw new Error('Archive is empty');

  // 2. Find SKILL.md (case-insensitive, root or single-level subdir)
  const skillMdKey = findSkillMdKey(fileMap);
  if (!skillMdKey) {
    throw new Error(
      'SKILL.md not found in archive (expected in root or single-level subdirectory)'
    );
  }

  // 3. Parse SKILL.md frontmatter
  const markdown = fileMap[skillMdKey].toString('utf-8');
  const { skill, error: extractError } = extractSkillFromMarkdown(markdown);
  if (extractError || !skill) throw new Error(extractError || 'Failed to parse SKILL.md');

  // 4. Validate package
  const result = parseSkillPackage({ skill, markdown });
  if (!result.success) throw new Error(result.error);

  // 5. Normalize asset files (strip root prefix, exclude SKILL.md)
  const rootPrefix = getRootPrefix(skillMdKey);
  const normalizedMap = stripRootPrefix(fileMap, rootPrefix);
  const assets: Record<string, Buffer> = {};
  for (const [key, value] of Object.entries(normalizedMap)) {
    if (key.toLowerCase() !== 'skill.md') assets[key] = value;
  }

  // 6. Re-package as standardized ZIP (root folder named after skill)
  const zipBuffer = await createSkillPackage({
    name: skill.name,
    skillMd: markdown,
    assets
  });

  // 7. Build entry metadata from final ZIP
  const JSZip = (await import('jszip')).default;
  const finalZip = await JSZip.loadAsync(zipBuffer);
  const zipEntries = Object.entries(finalZip.files).map(([name, file]) => ({
    name,
    size: 0,
    isDirectory: file.dir,
    uncompressedSize: 0,
    compressionMethod: 8
  }));

  return {
    skillPackage: result.package!,
    zipBuffer,
    zipEntries,
    totalSize: zipBuffer.length
  };
}

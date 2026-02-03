import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { importSkill } from '@fastgpt/service/core/agentSkill/controller';
import {
  parseSkillPackage,
  extractSkillFromMarkdown
} from '@fastgpt/service/core/agentSkill/utils';
import type {
  ImportSkillResponse,
  ExtractedSkillPackage
} from '@fastgpt/global/core/agentSkill/api';
import { multer } from '@fastgpt/service/common/file/multer';
import JSZip from 'jszip';
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
    const result = await multer.resolveFormData({
      request: req,
      maxFileSize: 10 // 10MB
    });

    filepaths.push(result.fileMetadata.path);

    const file = result.fileMetadata;

    // Validate file type
    if (!file.originalname?.endsWith('.zip')) {
      return jsonRes(res, {
        code: 400,
        error: 'Only ZIP files are allowed'
      });
    }

    // Authenticate user
    const { teamId, tmbId, userId } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true
    });

    // Extract and validate ZIP content
    let skillPackage;
    let zipBuffer: Buffer;

    try {
      const result = await extractSkillPackage(file.path);
      skillPackage = result.skillPackage;
      zipBuffer = result.zipBuffer;
    } catch (error: any) {
      return jsonRes(res, {
        code: 400,
        error: error.message || 'Failed to extract skill package'
      });
    }

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
 * Extract and validate skill package from ZIP
 * Supports ZIP files with multiple files and directories
 * Only requires SKILL.md with YAML frontmatter
 */
async function extractSkillPackage(filePath: string): Promise<ExtractedSkillPackage> {
  // Check ZIP file size (limit to 50MB by default, configurable via env var)
  const maxSizeEnv = process.env.MAX_SKILL_ZIP_SIZE;
  const maxZipSize = maxSizeEnv ? parseInt(maxSizeEnv, 10) : 50 * 1024 * 1024; // 50MB default

  const stats = await fs.stat(filePath);
  if (stats.size > maxZipSize) {
    throw new Error(
      `ZIP file size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${(maxZipSize / 1024 / 1024).toFixed(2)}MB)`
    );
  }

  // Read ZIP file to buffer
  const zipBuffer = await fs.readFile(filePath);

  // Load ZIP
  const zip = await JSZip.loadAsync(zipBuffer);
  const files = Object.keys(zip.files);

  // Find SKILL.md (required)
  let skillMdKey = files.find((key) => key === 'SKILL.md' || key.toLowerCase() === 'skill.md');

  // If not found in root, check single-level subdirectory (e.g., check-sysinfo/SKILL.md)
  let subDir: string | undefined;
  if (!skillMdKey) {
    for (const key of files) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.endsWith('/skill.md') && key.split('/').length === 2) {
        skillMdKey = key;
        subDir = key.split('/')[0];
        break;
      }
    }
  }

  if (!skillMdKey) {
    throw new Error('SKILL.md not found in ZIP archive (not in root or single-level subdirectory)');
  }

  // Get markdown content
  const skillMdFile = zip.file(skillMdKey);
  if (!skillMdFile) {
    throw new Error('SKILL.md not found in ZIP archive');
  }
  const markdown = await skillMdFile.async('string');

  // Filter files based on whether SKILL.md is in a subdirectory
  let filteredFiles = files;
  let processedZipBuffer = zipBuffer;

  if (subDir) {
    // Only include files in the subdirectory
    filteredFiles = files.filter((key) => {
      return key.startsWith(`${subDir}/`);
    });

    // Rebuild ZIP without the subdirectory prefix
    const newZip = new JSZip();
    for (const key of filteredFiles) {
      const file = zip.file(key);
      if (file && !file.dir) {
        const content = await file.async('arraybuffer');
        // Remove subdirectory prefix from file path
        const newKey = key.substring(`${subDir}/`.length);
        newZip.file(newKey, content);
      }
    }

    // Generate new ZIP buffer
    processedZipBuffer = await newZip.generateAsync({ type: 'arraybuffer' });
  }

  // Extract skill metadata from SKILL.md frontmatter
  const { skill, error } = extractSkillFromMarkdown(markdown);

  if (error) {
    throw new Error(error);
  }

  // Build package
  const packageData = {
    skill,
    markdown
  };

  // Validate package
  const result = parseSkillPackage(packageData);

  if (!result.success) {
    throw new Error(result.error);
  }

  // Extract metadata for all ZIP entries
  const entriesMetadata = filteredFiles.map((key) => {
    const file = zip.files[key];
    return {
      name: key,
      size: file._data?.uncompressedSize || 0,
      isDirectory: file.dir,
      uncompressedSize: file._data?.uncompressedSize || 0,
      compressionMethod: 8 // Default compression method (DEFLATE)
    };
  });

  return {
    skillPackage: result.package!,
    zipBuffer: Buffer.from(processedZipBuffer),
    zipEntries: entriesMetadata,
    totalSize: processedZipBuffer.byteLength
  };
}

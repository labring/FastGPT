/**
 * ZIP Builder for Skill Packages
 *
 * This module provides utilities for creating and extracting ZIP archives
 * for skill packages following the Agent Skills specification.
 */

import JSZip from 'jszip';

export type CreateSkillPackageParams = {
  name: string;
  skillMd: string;
  assets?: Record<string, Buffer | string>;
  additionalFiles?: Record<string, Buffer | string>;
};

export type ZipValidationResult = {
  valid: boolean;
  hasSkillMd: boolean;
  files: string[];
  error?: string;
  skillMdPath?: string;
};

export type ExtractSkillPackageResult = {
  success: boolean;
  skillMd?: string;
  assets?: Record<string, Buffer>;
  error?: string;
};

/**
 * Create a skill package ZIP archive
 */
export async function createSkillPackage(params: CreateSkillPackageParams): Promise<Buffer> {
  const { name, skillMd, assets, additionalFiles } = params;
  const zip = new JSZip();

  // Root directory name (default to skill name)
  const rootDir = name.replace(/\/+$/, '').trim();

  // Add root directory explicitly
  zip.folder(rootDir);

  // Add SKILL.md (required)
  zip.file(`${rootDir}/SKILL.md`, skillMd);

  // Add assets (optional)
  if (assets) {
    Object.entries(assets).forEach(([path, content]) => {
      addFileToZip(zip, `${rootDir}/${path}`, content);
    });
  }

  // Add additional files (optional)
  if (additionalFiles) {
    Object.entries(additionalFiles).forEach(([path, content]) => {
      addFileToZip(zip, `${rootDir}/${path}`, content);
    });
  }

  // Generate ZIP buffer
  return generateZipBuffer(zip);
}

/**
 * Add a file to the ZIP archive
 */
export function addFileToZip(
  zip: JSZip,
  path: string,
  content: Buffer | string | Uint8Array
): void {
  // Normalize path
  const normalizedPath = path.replace(/^\/+/, '');

  if (content instanceof Buffer) {
    zip.file(normalizedPath, content);
  } else if (content instanceof Uint8Array) {
    zip.file(normalizedPath, Buffer.from(content));
  } else {
    zip.file(normalizedPath, content);
  }
}

/**
 * Generate ZIP buffer from JSZip instance
 */
export async function generateZipBuffer(zip: JSZip): Promise<Buffer> {
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6 // Default compression level
    }
  });
}

/**
 * Validate ZIP structure for skill package
 */
export async function validateZipStructure(zipBuffer: Buffer): Promise<ZipValidationResult> {
  try {
    const zip = await JSZip.loadAsync(zipBuffer);
    const files = Object.keys(zip.files);

    // Check if SKILL.md exists (either at root or in a subfolder)
    let skillMdPath = files.find((f) => f.toUpperCase() === 'SKILL.MD');
    if (!skillMdPath) {
      // Look for SKILL.md in a single top-level directory
      skillMdPath = files.find(
        (f) => f.toUpperCase().endsWith('/SKILL.MD') && f.split('/').length === 2
      );
    }

    // SKILL.md is required
    if (!skillMdPath) {
      return {
        valid: false,
        hasSkillMd: false,
        files,
        error: 'Missing required file: SKILL.md'
      };
    }

    // Check if zip is empty
    if (files.length === 0) {
      return {
        valid: false,
        hasSkillMd: false,
        files,
        error: 'ZIP archive is empty'
      };
    }

    return {
      valid: true,
      hasSkillMd: true,
      files,
      skillMdPath
    };
  } catch (error) {
    return {
      valid: false,
      hasSkillMd: false,
      files: [],
      error: `Invalid ZIP archive: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Extract skill package from ZIP buffer
 */
export async function extractSkillPackage(zipBuffer: Buffer): Promise<ExtractSkillPackageResult> {
  try {
    // First validate the zip structure
    const validation = await validateZipStructure(zipBuffer);
    if (!validation.valid || !validation.skillMdPath) {
      return {
        success: false,
        error: validation.error
      };
    }

    const zip = await JSZip.loadAsync(zipBuffer);
    const assets: Record<string, Buffer> = {};
    const skillMdPath = validation.skillMdPath;

    // Determine root prefix if SKILL.md is in a subfolder
    const rootPrefix = skillMdPath.includes('/')
      ? skillMdPath.substring(0, skillMdPath.lastIndexOf('/') + 1)
      : '';

    // Extract SKILL.md
    const skillMdFile = zip.file(skillMdPath);
    if (!skillMdFile) {
      return {
        success: false,
        error: 'SKILL.md not found in ZIP archive'
      };
    }
    const skillMd = await skillMdFile.async('string');

    // Extract assets (all files except SKILL.md)
    const filePromises = Object.entries(zip.files)
      .filter(([path, file]) => !file.dir && path !== skillMdPath)
      .map(async ([path, file]) => {
        const content = await file.async('nodebuffer');
        // Strip root prefix from asset path if it exists
        const assetPath =
          rootPrefix && path.startsWith(rootPrefix) ? path.slice(rootPrefix.length) : path;
        assets[assetPath] = content;
      });

    await Promise.all(filePromises);

    return {
      success: true,
      skillMd,
      assets
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to extract skill package: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Standardize a skill package ZIP buffer to ensure it has a root folder named after the skill
 */
export async function standardizeSkillPackage(
  zipBuffer: Buffer,
  name: string
): Promise<{ buffer: Buffer; skillMd: string; assets: Record<string, Buffer> }> {
  const extractResult = await extractSkillPackage(zipBuffer);

  if (!extractResult.success || !extractResult.skillMd) {
    throw new Error(extractResult.error || 'Invalid skill package');
  }

  const { skillMd, assets = {} } = extractResult;

  const standardizedBuffer = await createSkillPackage({
    name,
    skillMd,
    assets
  });

  return {
    buffer: standardizedBuffer,
    skillMd,
    assets
  };
}

/**
 * Get file list from ZIP buffer
 */
export async function getZipFileList(zipBuffer: Buffer): Promise<string[]> {
  try {
    const zip = await JSZip.loadAsync(zipBuffer);
    return Object.keys(zip.files).filter((path) => !zip.files[path].dir);
  } catch {
    return [];
  }
}

/**
 * Read a specific file from ZIP buffer
 */
export async function readFileFromZip(zipBuffer: Buffer, filePath: string): Promise<Buffer | null> {
  try {
    const zip = await JSZip.loadAsync(zipBuffer);
    const file = zip.file(filePath);
    if (!file) return null;
    return file.async('nodebuffer');
  } catch {
    return null;
  }
}

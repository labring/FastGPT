/**
 * ZIP Builder for Skill Packages
 *
 * This module provides utilities for creating and extracting ZIP archives
 * for skill packages following the Agent Skills specification.
 */

import JSZip from 'jszip';

export type CreateSkillPackageParams = {
  skillMd: string;
  assets?: Record<string, Buffer | string>;
  additionalFiles?: Record<string, Buffer | string>;
};

export type ZipValidationResult = {
  valid: boolean;
  hasSkillMd: boolean;
  files: string[];
  error?: string;
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
  const { skillMd, assets, additionalFiles } = params;
  const zip = new JSZip();

  // Add SKILL.md (required)
  zip.file('SKILL.md', skillMd);

  // Add assets (optional)
  if (assets) {
    Object.entries(assets).forEach(([path, content]) => {
      addFileToZip(zip, path, content);
    });
  }

  // Add additional files (optional)
  if (additionalFiles) {
    Object.entries(additionalFiles).forEach(([path, content]) => {
      addFileToZip(zip, path, content);
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

    // Check if SKILL.md exists
    const hasSkillMd = files.includes('SKILL.md');

    // SKILL.md is required
    if (!hasSkillMd) {
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
      files
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
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    const zip = await JSZip.loadAsync(zipBuffer);
    const assets: Record<string, Buffer> = {};

    // Extract SKILL.md
    const skillMdFile = zip.file('SKILL.md');
    if (!skillMdFile) {
      return {
        success: false,
        error: 'SKILL.md not found in ZIP archive'
      };
    }
    const skillMd = await skillMdFile.async('string');

    // Extract assets (all files except SKILL.md)
    const filePromises = Object.entries(zip.files)
      .filter(([path, file]) => !file.dir && path !== 'SKILL.md')
      .map(async ([path, file]) => {
        const content = await file.async('nodebuffer');
        assets[path] = content;
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

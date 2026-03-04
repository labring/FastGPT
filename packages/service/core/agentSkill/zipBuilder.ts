/**
 * ZIP Builder for Skill Packages
 *
 * This module provides utilities for creating and extracting ZIP archives
 * for skill packages following the Agent Skills specification.
 *
 * ZIP structure (multi-skill):
 *   package.zip/
 *   ├── skill-1/SKILL.md
 *   ├── skill-2/SKILL.md
 *   └── skill-3/SKILL.md
 *
 * Each top-level subdirectory that contains a SKILL.md is treated as one agent skill.
 */

import JSZip from 'jszip';
import { parseSkillMarkdown } from './utils';

export type CreateSkillPackageParams = {
  name: string;
  skillMd: string;
  assets?: Record<string, Buffer | string>;
  additionalFiles?: Record<string, Buffer | string>;
};

// Info about a single skill directory discovered in a ZIP
export type SkillDirInfo = {
  dirName: string; // top-level directory name inside the ZIP
  name: string; // from SKILL.md frontmatter
  description: string; // from SKILL.md frontmatter
  skillMdContent: string; // raw SKILL.md text
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
 * Validate ZIP structure for skill package.
 *
 * Accepts both legacy single-skill ZIPs (one SKILL.md) and
 * multi-skill ZIPs (multiple top-level directories each containing a SKILL.md).
 */
export async function validateZipStructure(zipBuffer: Buffer): Promise<ZipValidationResult> {
  try {
    const zip = await JSZip.loadAsync(zipBuffer);
    const files = Object.keys(zip.files);

    if (files.length === 0) {
      return {
        valid: false,
        hasSkillMd: false,
        files,
        error: 'ZIP archive is empty'
      };
    }

    // Check for SKILL.md at root
    let skillMdPath = files.find((f) => f.toUpperCase() === 'SKILL.MD');

    // Check for SKILL.md exactly one level deep (single-skill or first skill in multi-skill ZIP)
    if (!skillMdPath) {
      skillMdPath = files.find(
        (f) => f.toUpperCase().endsWith('/SKILL.MD') && f.split('/').length === 2
      );
    }

    if (!skillMdPath) {
      return {
        valid: false,
        hasSkillMd: false,
        files,
        error: 'Missing required file: SKILL.md (expected at root or inside a top-level directory)'
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
 * Repack a file map as a ZIP buffer, preserving the original directory structure.
 * All entries in fileMap are added as-is; directory entries are not needed.
 */
export async function repackFileMapAsZip(fileMap: Record<string, Buffer>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(fileMap)) {
    zip.file(path, content);
  }
  return generateZipBuffer(zip);
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

/**
 * Standardize a raw ZIP buffer so that every skill directory name matches its frontmatter name.
 *
 * Handles three cases:
 * 1. Root-level SKILL.md (legacy single-skill) → move all files into `canonicalName/`
 * 2. Multi-skill ZIP where dirName ≠ frontmatter name → rename dirs to canonical names
 * 3. Multi-skill ZIP already canonical → effectively a no-op rename
 *
 * Returns the normalized buffer and the discovered skill list.
 * Throws if there are duplicate canonical names or no valid SKILL.md entries.
 */
export async function standardizePackageZip(
  zipBuffer: Buffer
): Promise<{ buffer: Buffer; skills: SkillDirInfo[] }> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const files = Object.keys(zip.files);

  // Collect depth-1 SKILL.md entries (inside a top-level directory)
  const skillMdEntries = files.filter(
    (f) => f.toUpperCase().endsWith('/SKILL.MD') && f.split('/').length === 2
  );

  // Legacy: root-level SKILL.md (no enclosing directory)
  const rootSkillMd = files.find((f) => f.toUpperCase() === 'SKILL.MD');
  if (skillMdEntries.length === 0 && rootSkillMd) {
    skillMdEntries.push(rootSkillMd);
  }

  if (skillMdEntries.length === 0) {
    throw new Error('No valid SKILL.md found in ZIP archive');
  }

  type RawEntry = {
    skillMdPath: string;
    dirName: string; // '' for root-level legacy
    canonicalName: string;
    info: SkillDirInfo;
  };

  const entries: RawEntry[] = [];
  const canonicalNames = new Set<string>();

  for (const skillMdPath of skillMdEntries) {
    const file = zip.file(skillMdPath);
    if (!file) continue;

    const content = await file.async('string');
    const { frontmatter, error } = parseSkillMarkdown(content);

    if (error || !frontmatter.name) continue;

    const canonicalName = String(frontmatter.name).trim();
    if (canonicalNames.has(canonicalName)) {
      throw new Error(`Duplicate skill name "${canonicalName}" in ZIP archive`);
    }
    canonicalNames.add(canonicalName);

    const dirName = skillMdPath.includes('/') ? skillMdPath.split('/')[0] : '';
    entries.push({
      skillMdPath,
      dirName,
      canonicalName,
      info: {
        dirName: canonicalName, // after normalization, dir name = canonical name
        name: canonicalName,
        description: frontmatter.description ? String(frontmatter.description) : '',
        skillMdContent: content
      }
    });
  }

  if (entries.length === 0) {
    throw new Error('No valid SKILL.md entries with a name found in ZIP archive');
  }

  // Build a new ZIP with normalized directory names
  const newZip = new JSZip();

  for (const [filePath, zipObj] of Object.entries(zip.files)) {
    if (zipObj.dir) continue; // skip directory entries

    let matched = false;

    for (const entry of entries) {
      const { dirName, canonicalName } = entry;

      if (dirName === '') {
        // Legacy root-level layout: move every root-level file into canonicalName/
        if (!filePath.includes('/')) {
          const newPath = `${canonicalName}/${filePath}`;
          const content = await zipObj.async('nodebuffer');
          newZip.file(newPath, content);
          matched = true;
          break;
        }
      } else {
        const prefix = `${dirName}/`;
        if (filePath.startsWith(prefix)) {
          const relativePath = filePath.slice(prefix.length);
          const newPath = `${canonicalName}/${relativePath}`;
          const content = await zipObj.async('nodebuffer');
          newZip.file(newPath, content);
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      // File outside any known skill directory — preserve as-is
      const content = await zipObj.async('nodebuffer');
      newZip.file(filePath, content);
    }
  }

  const buffer = await generateZipBuffer(newZip);
  return { buffer, skills: entries.map((e) => e.info) };
}

/**
 * Scan ZIP for top-level skill directories.
 *
 * A "skill directory" is a top-level entry (depth = 1) that contains a SKILL.md.
 * Parses each SKILL.md's frontmatter to extract name and description.
 * Returns one SkillDirInfo per discovered skill directory, in ZIP order.
 *
 * Falls back to root-level SKILL.md for legacy single-file ZIPs.
 */
export async function scanSkillDirectories(zipBuffer: Buffer): Promise<SkillDirInfo[]> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const files = Object.keys(zip.files);

  // Collect all top-level directories that have a SKILL.md one level inside
  const skillMdEntries = files.filter(
    (f) => f.toUpperCase().endsWith('/SKILL.MD') && f.split('/').length === 2
  );

  // Also handle root-level SKILL.md (legacy)
  const rootSkillMd = files.find((f) => f.toUpperCase() === 'SKILL.MD');
  if (skillMdEntries.length === 0 && rootSkillMd) {
    skillMdEntries.push(rootSkillMd);
  }

  const results: SkillDirInfo[] = [];

  for (const skillMdPath of skillMdEntries) {
    const file = zip.file(skillMdPath);
    if (!file) continue;

    const content = await file.async('string');
    const { frontmatter, error } = parseSkillMarkdown(content);

    if (error || !frontmatter.name) continue;

    const dirName = skillMdPath.includes('/') ? skillMdPath.split('/')[0] : '';

    results.push({
      dirName,
      name: String(frontmatter.name),
      description: frontmatter.description ? String(frontmatter.description) : '',
      skillMdContent: content
    });
  }

  return results;
}

import decompress from 'decompress';

export type ArchiveFormat = 'zip' | 'tar' | 'tar.gz';
export type ArchiveFileMap = Record<string, Buffer>;

/** Detect supported format from filename extension. Returns null if unsupported. */
export function getSupportedArchiveFormat(filename: string): ArchiveFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
  if (lower.endsWith('.tar')) return 'tar';
  if (lower.endsWith('.zip')) return 'zip';
  return null;
}

/**
 * Extract archive file (zip/tar/tar.gz) to a file map.
 * Path traversal entries are filtered out for security.
 * Total uncompressed size is capped to prevent Zip Bomb OOM attacks.
 */
export async function extractToFileMap(
  filePath: string,
  maxUncompressedBytes = 200 * 1024 * 1024
): Promise<ArchiveFileMap> {
  const files = await decompress(filePath);
  const fileMap: ArchiveFileMap = {};
  let totalSize = 0;
  for (const file of files) {
    if (file.type === 'directory') continue;
    const normalized = file.path.replace(/\\/g, '/').replace(/^\/+/, '');
    // Filter path traversal
    if (!normalized || normalized.includes('../')) continue;
    totalSize += file.data.length;
    if (totalSize > maxUncompressedBytes) {
      throw new Error(
        `Uncompressed archive exceeds maximum allowed size (${maxUncompressedBytes / 1024 / 1024}MB)`
      );
    }
    fileMap[normalized] = file.data;
  }
  return fileMap;
}

/** Find SKILL.md key in file map (case-insensitive, root or single-level subdir). */
export function findSkillMdKey(fileMap: ArchiveFileMap): string | null {
  const paths = Object.keys(fileMap);
  const rootKey = paths.find((p) => !p.includes('/') && p.toLowerCase() === 'skill.md');
  if (rootKey) return rootKey;
  return (
    paths.find((p) => {
      const parts = p.split('/');
      return parts.length === 2 && parts[1].toLowerCase() === 'skill.md';
    }) ?? null
  );
}

/** Get root directory prefix from SKILL.md path (e.g. 'my-skill/' or ''). */
export function getRootPrefix(skillMdKey: string): string {
  const idx = skillMdKey.lastIndexOf('/');
  return idx === -1 ? '' : skillMdKey.slice(0, idx + 1);
}

/** Strip root prefix from all keys in file map. */
export function stripRootPrefix(fileMap: ArchiveFileMap, rootPrefix: string): ArchiveFileMap {
  if (!rootPrefix) return fileMap;
  const result: ArchiveFileMap = {};
  for (const [key, value] of Object.entries(fileMap)) {
    const stripped = key.startsWith(rootPrefix) ? key.slice(rootPrefix.length) : key;
    if (stripped) result[stripped] = value;
  }
  return result;
}

/** SKILL.md content together with its relative path inside the archive. */
export type SkillMdInfo = { content: string; relativePath: string };

/**
 * Extract SKILL.md content and its relative path from a ZIP buffer without writing to disk.
 * Searches the same locations as findSkillMdKey:
 *   - root: SKILL.md
 *   - one level deep: {dir}/SKILL.md
 * Returns null when SKILL.md is not found.
 */
export async function extractSkillMdInfoFromBuffer(buffer: Buffer): Promise<SkillMdInfo | null> {
  const files = await decompress(buffer);

  const target = files.find((f) => {
    const p = f.path.replace(/\\/g, '/').replace(/^\//, '');
    const parts = p.split('/');
    if (parts.length === 1 && parts[0].toLowerCase() === 'skill.md') return true;
    if (parts.length === 2 && parts[1].toLowerCase() === 'skill.md') return true;
    return false;
  });

  if (!target || !target.data) return null;
  const content = Buffer.isBuffer(target.data)
    ? target.data.toString('utf-8')
    : String(target.data);
  const relativePath = target.path.replace(/\\/g, '/').replace(/^\//, '');
  return { content, relativePath };
}

/**
 * Extract SKILL.md content from a ZIP buffer without writing to disk.
 * Searches the same locations as findSkillMdKey:
 *   - root: SKILL.md
 *   - one level deep: {dir}/SKILL.md
 * Returns null when SKILL.md is not found.
 */
export async function extractSkillMdContentFromBuffer(buffer: Buffer): Promise<string | null> {
  const info = await extractSkillMdInfoFromBuffer(buffer);
  return info ? info.content : null;
}

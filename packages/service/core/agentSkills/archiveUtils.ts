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

function normalizeArchivePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/');
}

function isSafeArchivePath(path: string): boolean {
  return !!path && !path.split('/').includes('..');
}

/**
 * Extract every SKILL.md file from a ZIP buffer, recursively.
 * Paths are returned relative to the archive root and sorted for deterministic prompts.
 */
export async function extractSkillMdInfosFromBuffer(buffer: Buffer): Promise<SkillMdInfo[]> {
  const files = await decompress(buffer);
  const result: SkillMdInfo[] = [];

  for (const file of files) {
    if (file.type === 'directory' || !file.data) continue;

    const relativePath = normalizeArchivePath(file.path);
    if (!isSafeArchivePath(relativePath)) continue;

    const filename = relativePath.split('/').pop()?.toLowerCase();
    if (filename !== 'skill.md') continue;

    const content = Buffer.isBuffer(file.data) ? file.data.toString('utf-8') : String(file.data);
    result.push({ content, relativePath });
  }

  return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

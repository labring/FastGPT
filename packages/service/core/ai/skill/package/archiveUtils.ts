import decompress from 'decompress';

export type ArchiveFormat = 'zip' | 'tar' | 'tar.gz';
export type ArchiveFileMap = Record<string, Buffer>;

/**
 * 根据文件名识别当前支持的归档格式。
 *
 * 仅做扩展名判断，用于上传入口的快速校验；真正的压缩包合法性由解压流程兜底。
 */
export function getSupportedArchiveFormat(filename: string): ArchiveFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
  if (lower.endsWith('.tar')) return 'tar';
  if (lower.endsWith('.zip')) return 'zip';
  return null;
}

/**
 * 将 zip/tar/tar.gz 解压为内存文件表。
 *
 * 会过滤路径穿越条目，并限制总解压体积，避免导入恶意包时写出目录外文件或触发 OOM。
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
    // 归档包来自用户上传，所有相对路径都必须阻断路径穿越。
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

/**
 * 在解压文件表中定位入口 SKILL.md。
 *
 * 兼容历史单 skill 包：SKILL.md 可以在根目录，也可以在一层目录内。
 */
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

/**
 * 根据 SKILL.md 路径得到归档包的根目录前缀。
 */
export function getRootPrefix(skillMdKey: string): string {
  const idx = skillMdKey.lastIndexOf('/');
  return idx === -1 ? '' : skillMdKey.slice(0, idx + 1);
}

/**
 * 去掉单 skill 包的根目录前缀，让后续逻辑以 SKILL.md 所在目录作为包根目录。
 */
export function stripRootPrefix(fileMap: ArchiveFileMap, rootPrefix: string): ArchiveFileMap {
  if (!rootPrefix) return fileMap;
  const result: ArchiveFileMap = {};
  for (const [key, value] of Object.entries(fileMap)) {
    const stripped = key.startsWith(rootPrefix) ? key.slice(rootPrefix.length) : key;
    if (stripped) result[stripped] = value;
  }
  return result;
}

/**
 * 多 skill 包内发现的 SKILL.md 内容及其归档内相对路径。
 */
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
 * 从 ZIP Buffer 递归提取全部 SKILL.md。
 *
 * 返回路径按字典序排序，保证同一个包生成的调试提示词稳定，便于测试和问题复现。
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

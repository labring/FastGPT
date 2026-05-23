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
 * 过滤常见操作系统自动生成的归档垃圾文件。
 *
 * 这些文件不属于 skill workspace 内容，保留它们会污染导入后的文件树，并可能影响包体积限制。
 */
export function isIgnoredSystemArchiveEntry(path: string): boolean {
  const parts = path.split('/').filter(Boolean);
  const filename = parts.at(-1)?.toLowerCase();

  if (parts.includes('__MACOSX')) return true;
  if (!filename) return false;

  return (
    filename === '.ds_store' ||
    filename === 'thumbs.db' ||
    filename === 'desktop.ini' ||
    filename.startsWith('._')
  );
}

/**
 * 将 zip/tar/tar.gz 解压为内存文件表。
 *
 * 会过滤路径穿越条目，并限制总解压体积，避免导入恶意包时写出目录外文件或触发 OOM。
 */
export async function extractToFileMap(
  filePath: string,
  maxUncompressedBytes: number
): Promise<ArchiveFileMap> {
  const files = await decompress(filePath);
  const fileMap: ArchiveFileMap = {};
  let totalSize = 0;
  for (const file of files) {
    if (file.type === 'directory') continue;
    const normalized = file.path.replace(/\\/g, '/').replace(/^\/+/, '');
    // 归档包来自用户上传，所有相对路径都必须阻断路径穿越。
    if (!normalized || normalized.includes('../')) continue;
    if (isIgnoredSystemArchiveEntry(normalized)) continue;
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
 * 将归档包路径归一到 workspace 根目录。
 *
 * 用户从不同系统导出的压缩包可能带一层外壳目录，例如
 * `my-export/skills/demo/SKILL.md`。导入时只接受 workspace 结构，因此如果
 * `skills/` 不在根目录，会剥掉最短的外壳前缀，让后续校验统一检查根目录下的
 * `skills/`。
 */
export function normalizeSkillWorkspaceRoot(fileMap: ArchiveFileMap): ArchiveFileMap {
  const skillPath = Object.keys(fileMap).find(
    (path) => path === 'skills' || path.startsWith('skills/')
  );
  if (skillPath) return fileMap;

  const nestedSkillsPath = Object.keys(fileMap).find((path) => path.includes('/skills/'));
  if (!nestedSkillsPath) return fileMap;

  return stripRootPrefix(
    fileMap,
    nestedSkillsPath.slice(0, nestedSkillsPath.indexOf('/skills/') + 1)
  );
}

/**
 * 判断归档包是否包含新版 workspace skill 结构。
 *
 * 最新导入格式要求根目录存在 `skills/`，且其下至少有一个文件；不再用根目录或
 * 单层目录中的 SKILL.md 作为包合法性的判断依据。
 */
export function hasSkillsDirectoryContent(fileMap: ArchiveFileMap): boolean {
  return Object.keys(fileMap).some(
    (path) => path.startsWith('skills/') && path.length > 'skills/'.length
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

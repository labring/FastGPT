/**
 * Skill ZIP 包构建与标准化工具。
 *
 * 这里处理 ZIP 结构本身：创建、校验、抽取、重新打包和写入 sandbox 前的路径归一化。
 * package/storage 负责对象存储，这里负责 ZIP 包构建与解压。
 *
 * 多 skill ZIP 结构示例：
 *   package.zip/
 *   ├── skill-1/SKILL.md
 *   ├── skill-2/SKILL.md
 *   └── skill-3/SKILL.md
 *
 * 每个包含 SKILL.md 的一级目录会被视为一个独立 skill。
 */

import JSZip from 'jszip';
import { extractSkillNameFromSkillMd } from '../utils';
import { DEFAULT_GITIGNORE_CONTENT } from './constants';

export type CreateSkillPackageParams = {
  name: string;
  skillMd: string;
  assets?: Record<string, Buffer | string>;
};

/**
 * ZIP 中发现的单个 skill 目录信息。
 */
export type SkillDirInfo = {
  /** ZIP 内一级目录名。 */
  dirName: string;
  /** SKILL.md frontmatter 中的 name。 */
  name: string;
  /** SKILL.md frontmatter 中的 description。 */
  description: string;
  /** 原始 SKILL.md 文本。 */
  skillMdContent: string;
};

export type ZipValidationResult = {
  valid: boolean;
  hasSkillMd: boolean;
  files: string[];
  error?: string;
  skillMdPath?: string;
  totalUncompressedBytes?: number;
};

export type DeployableSkillWorkspaceValidationResult = {
  valid: boolean;
  files: string[];
  error?: string;
};

type ZipSafetyValidationResult = {
  valid: boolean;
  files: string[];
  error?: string;
  totalUncompressedBytes?: number;
};

export type ExtractSkillPackageResult = {
  success: boolean;
  skillMd?: string;
  assets?: Record<string, Buffer>;
  error?: string;
};

export type NormalizedSkillPackageFile = {
  path: string;
  data: Buffer;
};

/**
 * 创建标准单 skill ZIP 包。
 *
 * 输出结构固定为 `{name}/SKILL.md` 加可选资源文件，便于后续版本存储和导出保持一致。
 */
export async function createSkillPackage(params: CreateSkillPackageParams): Promise<Buffer> {
  const { name, skillMd, assets } = params;
  const zip = new JSZip();

  // 根目录名直接来自 skill name，前面流程已经做过合法性约束。
  const rootDir = name.replace(/\/+$/, '').trim();

  // 显式创建目录，方便某些 ZIP 查看器展示完整目录结构。
  zip.folder(rootDir);

  // SKILL.md 是 skill 包的必需入口文件。
  zip.file(`${rootDir}/SKILL.md`, skillMd);

  // 只有根目录下显式声明了 /.gitignore，才不覆盖生成默认的
  const hasRootGitignore = assets && assets['/.gitignore'];

  if (!hasRootGitignore) {
    zip.file(`.gitignore`, DEFAULT_GITIGNORE_CONTENT);
  }

  // Add assets (optional)
  if (assets) {
    Object.entries(assets).forEach(([path, content]) => {
      // 以 / 开头的代表强制放在压缩包根目录；否则照常放进资源包(技能)目录下
      if (path.startsWith('/')) {
        addFileToZip(zip, path.slice(1), content);
      } else {
        addFileToZip(zip, `${rootDir}/${path}`, content);
      }
    });
  }

  // Generate ZIP buffer
  return generateZipBuffer(zip);
}

/**
 * 创建新建 Skill 的空白工作区包。
 *
 * 初始版本只建立工作区外壳，不生成任何可执行 Skill。空目录在 ZIP 中需要显式写入，
 * 否则解压后 `skills/` 不会存在。
 */
export async function createBlankSkillWorkspacePackage(): Promise<Buffer> {
  const zip = new JSZip();

  zip.file('.gitignore', DEFAULT_GITIGNORE_CONTENT);
  zip.folder('skills');

  return generateZipBuffer(zip);
}

/**
 * 向 ZIP 中写入单个文件，并统一处理 Buffer、Uint8Array 和字符串内容。
 */
function addFileToZip(zip: JSZip, path: string, content: Buffer | string | Uint8Array): void {
  // ZIP 内路径不应带绝对路径前缀。
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
 * 将 JSZip 实例压缩成 Node Buffer。
 */
async function generateZipBuffer(zip: JSZip): Promise<Buffer> {
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6
    }
  });
}

/**
 * 校验 skill ZIP 包结构。
 *
 * 兼容两种形态：历史单 skill 包（一个 SKILL.md）和多 skill 包（多个一级目录各自含 SKILL.md）。
 */
export async function validateZipStructure(
  zipBuffer: Buffer,
  options: { maxUncompressedBytes?: number } = {}
): Promise<ZipValidationResult> {
  try {
    const zip = await JSZip.loadAsync(zipBuffer);
    const safety = validateZipSafety(zip, options);
    const files = safety.files;

    if (!safety.valid) {
      return {
        valid: false,
        hasSkillMd: false,
        files,
        totalUncompressedBytes: safety.totalUncompressedBytes,
        error: safety.error
      };
    }

    // 兼容根目录直接放 SKILL.md 的历史包。
    let skillMdPath = files.find((f) => f.toUpperCase() === 'SKILL.MD');

    // 标准包会把 SKILL.md 放在子目录内。
    if (!skillMdPath) {
      // 优先在 skills/ 目录中寻找
      skillMdPath = files.find((f) => {
        const upper = f.toUpperCase();
        return upper.includes('/SKILLS/') && upper.endsWith('/SKILL.MD');
      });

      // 兜底找任意子目录下的 SKILL.md
      if (!skillMdPath) {
        skillMdPath = files.find((f) => f.toUpperCase().endsWith('/SKILL.MD'));
      }
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
      skillMdPath,
      totalUncompressedBytes: safety.totalUncompressedBytes
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
 * 发布/保存版本时校验可部署工作区。
 *
 * 这里只校验 workspace 级最小结构，不解析 SKILL.md frontmatter。创建阶段的空白初始包
 * 不应调用该校验；用户主动发布时必须至少存在一个可执行 Skill 目录。
 */
export async function validateDeployableSkillWorkspacePackage(
  zipBuffer: Buffer,
  options: { maxUncompressedBytes?: number } = {}
): Promise<DeployableSkillWorkspaceValidationResult> {
  try {
    const zip = await JSZip.loadAsync(zipBuffer);
    const safety = validateZipSafety(zip, options);
    const files = safety.files;

    if (!safety.valid) {
      return {
        valid: false,
        files,
        error: safety.error
      };
    }

    const hasSkillsDirectory = files.some((path) => {
      const normalized = normalizeDeployableWorkspaceEntryPath(path);
      return normalized === 'skills/' || normalized.startsWith('skills/');
    });

    if (!hasSkillsDirectory) {
      return {
        valid: false,
        files,
        error: 'Missing required directory: skills/'
      };
    }

    const firstLevelSkillDirs = new Set<string>();
    const executableSkillDirs = new Set<string>();

    for (const path of files) {
      const normalized = normalizeDeployableWorkspaceEntryPath(path);

      const firstLevelDirMatch = normalized.match(/^skills\/([^/]+)(?:\/|$)/);
      if (firstLevelDirMatch?.[1] && normalized !== `skills/${firstLevelDirMatch[1]}`) {
        firstLevelSkillDirs.add(firstLevelDirMatch[1]);
      }

      const skillMdMatch = normalized.match(/^skills\/([^/]+)\/SKILL\.md$/i);
      if (skillMdMatch?.[1]) {
        executableSkillDirs.add(skillMdMatch[1]);
      }
    }

    if (firstLevelSkillDirs.size === 0) {
      return {
        valid: false,
        files,
        error: 'The skills/ directory must contain at least one first-level skill folder'
      };
    }

    const missingSkillMdDirs = [...firstLevelSkillDirs].filter(
      (dir) => !executableSkillDirs.has(dir)
    );
    if (missingSkillMdDirs.length > 0) {
      return {
        valid: false,
        files,
        error: `Each first-level skill folder under skills/ must contain SKILL.md: ${missingSkillMdDirs.join(', ')}`
      };
    }

    return {
      valid: true,
      files
    };
  } catch (error) {
    return {
      valid: false,
      files: [],
      error: `Invalid ZIP archive: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

function normalizeDeployableWorkspaceEntryPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function isZipRootDirectoryEntry(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return normalized === '/' || normalized === './' || normalized === '.';
}

function normalizeZipEntryPathForSafety(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

export function validateZipSafety(
  zip: JSZip,
  options: { maxUncompressedBytes?: number } = {}
): ZipSafetyValidationResult {
  const files = Object.keys(zip.files);

  if (files.length === 0) {
    return {
      valid: false,
      files,
      error: 'ZIP archive is empty'
    };
  }

  let totalUncompressedBytes = 0;
  for (const file of Object.values(zip.files)) {
    const unsafePath = file.unsafeOriginalName ?? file.name;
    if (file.dir && isZipRootDirectoryEntry(unsafePath)) {
      continue;
    }

    const normalizedUnsafePath = normalizeZipEntryPathForSafety(unsafePath);
    if (!isSafeZipEntryPath(normalizedUnsafePath)) {
      return {
        valid: false,
        files,
        error: `Unsafe ZIP entry path: ${unsafePath}`
      };
    }

    if (isZipSymlink(file)) {
      return {
        valid: false,
        files,
        error: `ZIP symlink entries are not allowed: ${unsafePath}`
      };
    }

    if (!file.dir) {
      totalUncompressedBytes += getZipEntryUncompressedSize(file);
      if (
        options.maxUncompressedBytes !== undefined &&
        totalUncompressedBytes > options.maxUncompressedBytes
      ) {
        return {
          valid: false,
          files,
          totalUncompressedBytes,
          error: 'ZIP archive uncompressed size exceeds maximum allowed size'
        };
      }
    }
  }

  return {
    valid: true,
    files,
    totalUncompressedBytes
  };
}

function isSafeZipEntryPath(path: string): boolean {
  if (!path || path.includes('\0')) return false;
  if (path.startsWith('/') || path.startsWith('\\')) return false;
  if (/^[A-Za-z]:[\\/]/.test(path)) return false;

  return !path.split(/[\\/]+/).some((segment) => segment === '..');
}

function isZipSymlink(file: JSZip.JSZipObject): boolean {
  const permissions =
    typeof file.unixPermissions === 'string'
      ? Number.parseInt(file.unixPermissions, 8)
      : file.unixPermissions;

  return Number.isFinite(permissions) && ((permissions as number) & 0xf000) === 0xa000;
}

function getZipEntryUncompressedSize(file: JSZip.JSZipObject): number {
  const compressedData = (
    file as JSZip.JSZipObject & {
      _data?: {
        uncompressedSize?: number;
      };
    }
  )._data;

  return Number.isFinite(compressedData?.uncompressedSize)
    ? Number(compressedData?.uncompressedSize)
    : 0;
}

/**
 * 从 ZIP Buffer 中提取单 skill 包内容。
 */
export async function extractSkillPackage(zipBuffer: Buffer): Promise<ExtractSkillPackageResult> {
  try {
    // 先校验结构，避免后续读取空包或缺少入口文件时抛出不清晰的错误。
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

    // 如果 SKILL.md 在子目录中，资源路径返回时要去掉这一层包根目录。
    const rootPrefix = skillMdPath.includes('/')
      ? skillMdPath.substring(0, skillMdPath.lastIndexOf('/') + 1)
      : '';

    const skillMdFile = zip.file(skillMdPath);
    if (!skillMdFile) {
      return {
        success: false,
        error: 'SKILL.md not found in ZIP archive'
      };
    }
    const skillMd = await skillMdFile.async('string');

    // SKILL.md 之外的所有文件都作为资源保留。
    const filePromises = Object.entries(zip.files)
      .filter(([path, file]) => !file.dir && path !== skillMdPath)
      .map(async ([path, file]) => {
        const content = await file.async('nodebuffer');
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
 * 将任意兼容的单 skill ZIP 标准化为 `{name}/SKILL.md` 结构。
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

  const rootName = name.startsWith('skills/') ? name : `skills/${name}`;
  const standardizedBuffer = await createSkillPackage({
    name: rootName,
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
 * 将编辑区打出的 ZIP 标准化为 `{SKILL.md:name}/...` 结构。
 *
 * 编辑发布时数据库里的 skill.name 只是产品展示名，真实可执行 skill 目录必须跟随
 * SKILL.md frontmatter.name，否则下次打开编辑器会重新出现展示名目录包住真实 skill 的错位结构。
 */
export async function standardizeSkillPackageBySkillMdName(
  zipBuffer: Buffer
): Promise<{ buffer: Buffer; skillMd: string; assets: Record<string, Buffer>; name: string }> {
  const extractResult = await extractSkillPackage(zipBuffer);

  if (!extractResult.success || !extractResult.skillMd) {
    throw new Error(extractResult.error || 'Invalid skill package');
  }

  const { skillMd, assets = {} } = extractResult;
  const name = extractSkillNameFromSkillMd(skillMd);
  const buffer = await createSkillPackage({
    name: `skills/${name}`,
    skillMd,
    assets
  });

  return {
    buffer,
    skillMd,
    assets,
    name
  };
}

/**
 * 读取 ZIP 内指定文件，找不到或解析失败时返回 null。
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

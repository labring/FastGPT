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

// 测试用例需要直接构造 ZIP，因此这里保留 JSZip 的再导出。
export { JSZip };

export type CreateSkillPackageParams = {
  name: string;
  skillMd: string;
  assets?: Record<string, Buffer | string>;
  additionalFiles?: Record<string, Buffer | string>;
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
  const { name, skillMd, assets, additionalFiles } = params;
  const zip = new JSZip();

  // 根目录名直接来自 skill name，前面流程已经做过合法性约束。
  const rootDir = name.replace(/\/+$/, '').trim();

  // 显式创建目录，方便某些 ZIP 查看器展示完整目录结构。
  zip.folder(rootDir);

  // SKILL.md 是 skill 包的必需入口文件。
  zip.file(`${rootDir}/SKILL.md`, skillMd);

  // Auto-generate a comprehensive default .gitignore if not present
  const hasGitignore =
    (assets && (assets['.gitignore'] || assets['/.gitignore'])) ||
    (additionalFiles && (additionalFiles['.gitignore'] || additionalFiles['/.gitignore']));

  if (!hasGitignore) {
    zip.file(`${rootDir}/.gitignore`, DEFAULT_GITIGNORE_CONTENT);
  }

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
 * 获取 ZIP 内文件列表，读取失败时返回空数组供调试接口容错展示。
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

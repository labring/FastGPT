import { type SandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import type archiver from 'archiver';
import mime from 'mime';
import { getSandboxRuntimeProfile } from '@fastgpt/service/core/ai/sandbox/runtime/profile';

export type SandboxFileContent = {
  content: Buffer;
  contentType: string;
  fileName: string;
};

const trimSandboxPathRight = (value: string) => (value === '/' ? '' : value.replace(/\/+$/, ''));

const getSandboxWorkDirectory = () => getSandboxRuntimeProfile().workDirectory;
const isWithinSandboxWorkspace = (path: string, workDirectory: string) => {
  const workspace = trimSandboxPathRight(workDirectory);
  return path === workspace || path.startsWith(`${workspace}/`);
};

type ResolveSandboxWorkspacePathOptions = {
  allowAbsolutePath?: boolean;
};

/**
 * 将编辑器传入的相对路径锚定到 sandbox workspace。
 *
 * SandboxEditor 以 `.` 表示工作区根目录；Sealos provider 自身的 `.` 会落到
 * `/home/devbox`，因此 API 边界必须显式把相对路径解析到当前运行态 workDirectory。公开 API
 * 的用户输入默认拒绝绝对路径，避免具备 sandbox 权限的用户读取 workspace 外文件；provider 返回的
 * 内部路径可通过 allowAbsolutePath 显式放行。
 */
export function resolveSandboxWorkspacePath(
  path: string | undefined,
  workDirectory = getSandboxWorkDirectory(),
  options: ResolveSandboxWorkspacePathOptions = {}
) {
  const rawPath = path || '.';
  if (rawPath === '.' || rawPath === './' || rawPath === '') {
    return trimSandboxPathRight(workDirectory);
  }

  if (rawPath.split('/').includes('..')) {
    throw new Error('Path traversal detected');
  }

  if (rawPath.startsWith('/')) {
    if (!options.allowAbsolutePath) {
      throw new Error('Absolute sandbox paths are not allowed');
    }
    if (!isWithinSandboxWorkspace(rawPath, workDirectory)) {
      throw new Error('Sandbox path is outside workspace');
    }
    return rawPath;
  }

  const relativePath = rawPath.replace(/^\.\//, '');
  return `${trimSandboxPathRight(workDirectory)}/${relativePath}`;
}

/**
 * 判断沙盒路径是否为目录。
 * 当 provider 查询不到信息时，对根路径和以斜杠结尾的路径做兼容性兜底，避免旧沙盒实现误报。
 */
export async function isSandboxPathDirectory(
  sandbox: SandboxClient,
  path: string
): Promise<boolean> {
  const providerPath = resolveSandboxWorkspacePath(path);
  const fileInfoMap = await sandbox.provider.getFileInfo([providerPath]);
  const fileInfo = fileInfoMap.get(providerPath);
  return (
    fileInfo?.isDirectory ??
    (path === '.' || path === '' || providerPath.endsWith('/') || path.endsWith('/'))
  );
}

/**
 * 读取沙盒文件内容并返回下载/预览所需的 Buffer、contentType 和文件名。
 * preview=true 时按扩展名推断 MIME，用于编辑器内联预览；非 preview 始终以二进制下载方式返回。
 */
export async function getSandboxFileContent(
  sandbox: SandboxClient,
  path: string,
  preview?: boolean
): Promise<SandboxFileContent> {
  const providerPath = resolveSandboxWorkspacePath(path);
  const results = await sandbox.provider.readFiles([providerPath]);
  const result = results[0];

  if (result.error) {
    throw new Error(`Failed to read file: ${result.error.message}`);
  }

  const fileName = providerPath.split('/').pop() || 'file';
  // 注意：preview 模式下 contentType 由文件路径决定，可能返回 text/html / image/svg+xml 等危险类型。
  // 若未来有任何代码让浏览器直接导航到 download 端点（iframe / window.open 等），需确保这类内容不被同源渲染，否则会造成存储型 XSS。
  const contentType = preview
    ? (mime.getType(providerPath) ?? 'application/octet-stream')
    : 'application/octet-stream';

  return {
    content: Buffer.from(result.content),
    contentType,
    fileName
  };
}

const MAX_ARCHIVE_DEPTH = 20;

/**
 * 递归把目录加入 ZIP 归档。
 * 读取失败的文件会被跳过，目录深度超过 MAX_ARCHIVE_DEPTH 时停止递归，避免异常目录结构导致打包失控。
 */
export async function addDirectoryToArchive(
  sandbox: SandboxClient,
  archive: archiver.Archiver,
  dirPath: string,
  archivePath: string,
  depth: number = 0
): Promise<void> {
  if (depth > MAX_ARCHIVE_DEPTH) return;

  const providerDirPath = resolveSandboxWorkspacePath(dirPath, getSandboxWorkDirectory(), {
    allowAbsolutePath: true
  });
  const entries = await sandbox.provider.listDirectory(providerDirPath);

  for (const entry of entries) {
    const entryArchivePath = archivePath ? `${archivePath}/${entry.name}` : entry.name;

    if (entry.isDirectory) {
      await addDirectoryToArchive(sandbox, archive, entry.path, entryArchivePath, depth + 1);
    } else {
      const providerFilePath = resolveSandboxWorkspacePath(entry.path, getSandboxWorkDirectory(), {
        allowAbsolutePath: true
      });
      const results = await sandbox.provider.readFiles([providerFilePath]);
      const result = results[0];

      if (!result.error) {
        archive.append(Buffer.from(result.content), { name: entryArchivePath });
      }
    }
  }
}

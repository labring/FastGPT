/**
 * 沙盒业务层：处理已有 sandbox 的文件写入、读取、路径解析和目录打包。
 *
 * 只操作调用方传入的 sandbox/client，不创建、恢复或清理 sandbox 实例。
 */
import type { FileWriteEntry, ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import mime from 'mime';
import { pickOutboundAxios } from '../../../../common/api/axios';
import type { SandboxClient } from './runtime/client';
import { getSandboxRuntimeProfile } from '../infrastructure/provider/runtimeProfile';
import { resolveSandboxRuntimePath } from '../utils';

export type SandboxUrlFile = {
  path: string;
  url: string;
};

export type SandboxFileContent = {
  content: Buffer;
  contentType: string;
  fileName: string;
};

type ResolveSandboxWorkspacePathOptions = {
  allowAbsolutePath?: boolean;
  workspaceRoot?: string;
};

type SandboxDirectoryArchive = {
  append: (source: Buffer, data: { name: string }) => void;
};

const MAX_ARCHIVE_DEPTH = 20;

const getSandboxWorkDirectory = () => getSandboxRuntimeProfile().workDirectory;

/**
 * 将远程 URL 文件写入已存在的 sandbox 实例。
 *
 * 这里不负责 sandbox 生命周期，只统一处理下载和 writeFiles。
 */
export async function writeUrlFilesToSandbox(sandbox: ISandbox, files: SandboxUrlFile[]) {
  const writeFileTasks: Promise<FileWriteEntry>[] = [];

  for (const { path, url } of files) {
    if (!path) continue;
    writeFileTasks.push(
      pickOutboundAxios(url)
        .get<ArrayBuffer>(url, {
          responseType: 'arraybuffer'
        })
        .then((response) => ({
          path,
          data: response.data
        }))
    );
  }

  if (writeFileTasks.length === 0) return;
  await sandbox.writeFiles(await Promise.all(writeFileTasks));
}

/**
 * 将编辑器传入的相对路径锚定到 sandbox workspace。
 *
 * SandboxEditor 以 `.` 表示工作区根目录；Sealos provider 自身的 `.` 会落到
 * `/home/devbox`，因此 API 边界必须显式把相对路径解析到当前运行态 workDirectory。
 */
export function resolveSandboxWorkspacePath(
  path: string | undefined,
  workDirectory = getSandboxWorkDirectory(),
  options: ResolveSandboxWorkspacePathOptions = {}
) {
  return resolveSandboxRuntimePath(
    path,
    {
      workspaceRoot: options.workspaceRoot ?? workDirectory,
      sessionWorkDirectory: workDirectory
    },
    options
  );
}

/**
 * 判断沙盒路径是否为目录。
 *
 * 当 provider 查询不到信息时，对根路径和以斜杠结尾的路径做兼容性兜底，
 * 避免旧沙盒实现误报。
 */
export async function isSandboxPathDirectory(
  sandbox: SandboxClient,
  path: string
): Promise<boolean> {
  const providerPath = sandbox.resolveRuntimePath(path, { allowAbsolutePath: true });
  const fileInfoMap = await sandbox.provider.getFileInfo([providerPath]);
  const fileInfo = fileInfoMap.get(providerPath);
  return (
    fileInfo?.isDirectory ??
    (path === '.' || path === '' || providerPath.endsWith('/') || path.endsWith('/'))
  );
}

/**
 * 读取沙盒文件内容并返回下载/预览所需的 Buffer、contentType 和文件名。
 *
 * preview=true 时按扩展名推断 MIME，用于编辑器内联预览；非 preview 始终以二进制下载方式返回。
 */
export async function getSandboxFileContent(
  sandbox: SandboxClient,
  path: string,
  preview?: boolean
): Promise<SandboxFileContent> {
  const providerPath = sandbox.resolveRuntimePath(path, { allowAbsolutePath: true });
  const results = await sandbox.provider.readFiles([providerPath]);
  const result = results[0];

  if (result.error) {
    throw new Error(`Failed to read file: ${result.error.message}`);
  }

  const fileName = providerPath.split('/').pop() || 'file';
  // preview 模式下 contentType 由文件路径决定。若后续允许同源直接导航到该内容，
  // 需要重新评估 HTML/SVG 等类型的渲染风险。
  const contentType = preview
    ? (mime.getType(providerPath) ?? 'application/octet-stream')
    : 'application/octet-stream';

  return {
    content: Buffer.from(result.content),
    contentType,
    fileName
  };
}

/**
 * 递归把目录加入 ZIP 归档。
 *
 * 读取失败的文件会被跳过，目录深度超过 MAX_ARCHIVE_DEPTH 时停止递归，
 * 避免异常目录结构导致打包失控。
 */
export async function addDirectoryToArchive(
  sandbox: SandboxClient,
  archive: SandboxDirectoryArchive,
  dirPath: string,
  archivePath: string,
  depth: number = 0
): Promise<void> {
  if (depth > MAX_ARCHIVE_DEPTH) return;

  const providerDirPath = sandbox.resolveRuntimePath(dirPath, { allowAbsolutePath: true });
  const entries = await sandbox.provider.listDirectory(providerDirPath);

  for (const entry of entries) {
    const entryArchivePath = archivePath ? `${archivePath}/${entry.name}` : entry.name;

    if (entry.isDirectory) {
      await addDirectoryToArchive(sandbox, archive, entry.path, entryArchivePath, depth + 1);
    } else {
      const providerFilePath = sandbox.resolveRuntimePath(entry.path, { allowAbsolutePath: true });
      const results = await sandbox.provider.readFiles([providerFilePath]);
      const result = results[0];

      if (!result.error) {
        archive.append(Buffer.from(result.content), { name: entryArchivePath });
      }
    }
  }
}

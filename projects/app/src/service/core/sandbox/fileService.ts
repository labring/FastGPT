import { type SandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import type archiver from 'archiver';
import mime from 'mime';

export type SandboxFileEntry = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
};

export type SandboxFileContent = {
  content: Buffer;
  contentType: string;
  fileName: string;
};

export async function listSandboxDirectory(
  sandbox: SandboxClient,
  path: string
): Promise<SandboxFileEntry[]> {
  const entries = await sandbox.provider.listDirectory(path);
  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    type: entry.isDirectory ? ('directory' as const) : ('file' as const),
    size: entry.isFile ? entry.size : undefined
  }));
}

export async function writeSandboxFile(
  sandbox: SandboxClient,
  path: string,
  content: string
): Promise<void> {
  const results = await sandbox.provider.writeFiles([{ path, data: content }]);
  const result = results[0];
  if (result.error) {
    return Promise.reject(result.error);
  }
}

export async function isSandboxPathDirectory(
  sandbox: SandboxClient,
  path: string
): Promise<boolean> {
  const fileInfoMap = await sandbox.provider.getFileInfo([path]);
  const fileInfo = fileInfoMap.get(path);
  return fileInfo?.isDirectory ?? (path === '.' || path === '' || path.endsWith('/'));
}

export async function getSandboxFileContent(
  sandbox: SandboxClient,
  path: string,
  preview?: boolean
): Promise<SandboxFileContent> {
  const results = await sandbox.provider.readFiles([path]);
  const result = results[0];

  if (result.error) {
    return Promise.reject(new Error(`Failed to read file: ${result.error.message}`));
  }

  const fileName = path.split('/').pop() || 'file';
  // 注意：preview 模式下 contentType 由文件路径决定，可能返回 text/html / image/svg+xml 等危险类型。
  // 若未来有任何代码让浏览器直接导航到 download 端点（iframe / window.open 等），需确保这类内容不被同源渲染，否则会造成存储型 XSS。
  const contentType = preview
    ? mime.getType(path) ?? 'application/octet-stream'
    : 'application/octet-stream';

  return {
    content: Buffer.from(result.content),
    contentType,
    fileName
  };
}

const MAX_ARCHIVE_DEPTH = 20;

export async function addDirectoryToArchive(
  sandbox: SandboxClient,
  archive: archiver.Archiver,
  dirPath: string,
  archivePath: string,
  depth: number = 0
): Promise<void> {
  if (depth > MAX_ARCHIVE_DEPTH) return;

  const entries = await sandbox.provider.listDirectory(dirPath);

  for (const entry of entries) {
    const entryArchivePath = archivePath ? `${archivePath}/${entry.name}` : entry.name;

    if (entry.isDirectory) {
      await addDirectoryToArchive(sandbox, archive, entry.path, entryArchivePath, depth + 1);
    } else {
      const results = await sandbox.provider.readFiles([entry.path]);
      const result = results[0];

      if (!result.error) {
        archive.append(Buffer.from(result.content), { name: entryArchivePath });
      }
    }
  }
}

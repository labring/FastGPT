/**
 * 沙盒业务层：处理已有 sandbox 的文件写入、读取、路径解析和目录打包。
 *
 * 只操作调用方传入的 sandbox/client，不创建、恢复或清理 sandbox 实例。
 */
import type { WriteEntry } from '@alibaba-group/opensandbox';
import { OPEN_SANDBOX_DEFAULT_HOME_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { MAX_ARCHIVE_DEPTH } from '../constants';
import type { OpenSandboxClient } from '../infrastructure/opensandbox/opensandbox';
import { posix } from 'node:path';
import { Readable } from 'node:stream';
import type { SandboxClient } from './runtime/client';
import { getSandboxRuntimeProfile } from '../infrastructure/opensandbox/runtimeProfile';
import { readExternalFileBuffer } from '../../../../common/file/read/external';
import { resolveSandboxRuntimePath } from '../utils';
import { assertSandboxWorkspaceWritable } from './quota';

export type SandboxUrlFile = {
  path: string;
  url: string;
};

export type SandboxInputFileReader = (url: string) => Promise<Buffer>;

type ResolveSandboxWorkspacePathOptions = {
  allowAbsolutePath?: boolean;
  allowOutsideWorkspace?: boolean;
  workspaceRoot?: string;
};

type SandboxDirectoryArchive = {
  append: (source: Readable, data: { name: string }) => unknown;
};

/** 读取准备写入 Sandbox 的远程文件，禁止相对 URL 回环访问本机 API。 */
export const readSandboxUrlFile = async (url: string) => {
  return (await readExternalFileBuffer({ url })).buffer;
};

/**
 * 在写入文件前创建其父目录。
 *
 * Sandbox 文件系统运行在 POSIX 环境，createDirectories 会递归创建目录；这里同时去重，
 * 避免批量文件落在同一目录时重复调用 provider。
 */
export async function prepareSandboxFileParentDirectories(
  sandbox: OpenSandboxClient,
  paths: string[]
) {
  const parentDirectories = [
    ...new Set(
      paths
        .filter(Boolean)
        .map((path) => posix.dirname(path))
        .filter((path) => path !== '.' && path !== '/')
    )
  ];

  if (parentDirectories.length === 0) return;
  await sandbox.createDirectories(parentDirectories);
}

/**
 * 将远程 URL 文件写入已存在的 sandbox 实例。
 *
 * 这里不负责 sandbox 生命周期，只统一处理下载和 writeFiles。
 */
export async function writeUrlFilesToSandbox({
  sandbox,
  files,
  readInputFile = readSandboxUrlFile,
  errorPrefix = 'Failed to write file'
}: {
  sandbox: OpenSandboxClient;
  files: SandboxUrlFile[];
  readInputFile?: SandboxInputFileReader;
  errorPrefix?: string;
}) {
  const validFiles = files.filter(({ path }) => Boolean(path));
  if (validFiles.length === 0) return;

  await assertSandboxWorkspaceWritable(sandbox);
  const writeEntries: WriteEntry[] = await Promise.all(
    validFiles.map(({ path, url }) => readInputFile(url).then((data) => ({ path, data })))
  );
  await prepareSandboxFileParentDirectories(
    sandbox,
    writeEntries.map(({ path }) => path)
  );
  const results = await sandbox.writeFiles(writeEntries);
  const failed = results.find((item) => item?.error);
  if (failed?.error) {
    throw new Error(`${errorPrefix} ${failed.path}: ${failed.error.message}`, {
      cause: failed.error
    });
  }
}

/**
 * 将编辑器传入的相对路径锚定到 sandbox workspace。
 *
 * SandboxEditor 以 `.` 表示工作区根目录，因此 API 边界统一把相对路径解析到当前运行态 workDirectory。
 */
export function resolveSandboxWorkspacePath({
  path,
  workDirectory = getSandboxRuntimeProfile().workDirectory,
  options = {}
}: {
  path: string | undefined;
  workDirectory?: string;
  options?: ResolveSandboxWorkspacePathOptions;
}) {
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
 * 解析沙盒下载目标路径并查询其类型与体积。
 *
 * 当 provider 查询不到元数据时，对根路径和以斜杠结尾的路径按目录兜底，避免下载根工作区时误判为单文件。
 */
export async function resolveSandboxDownloadTarget(
  sandbox: SandboxClient,
  path: string
): Promise<{
  providerPath: string;
  isDirectory: boolean;
  size?: number;
}> {
  const providerPath = sandbox.resolveRuntimePath(path, { allowAbsolutePath: true });
  const fileInfoMap = await sandbox.runWithRecovery(() =>
    sandbox.opensandbox.getFileInfo([providerPath])
  );
  const fileInfo = fileInfoMap.get(providerPath);
  const isDirectory =
    fileInfo?.isDirectory ??
    (path === '.' || path === '' || providerPath.endsWith('/') || path.endsWith('/'));

  return {
    providerPath,
    isDirectory,
    size: typeof fileInfo?.size === 'number' ? fileInfo.size : undefined
  };
}

/**
 * 递归把目录加入 ZIP 归档。
 *
 * 目录深度超过 MAX_ARCHIVE_DEPTH 时停止递归，避免异常目录结构导致打包失控；
 * 通过流式读取加入归档，文件读取错误会在归档流消费时向上抛出。
 */
export async function addDirectoryToArchive({
  sandbox,
  archive,
  dirPath,
  archivePath,
  depth = 0
}: {
  sandbox: SandboxClient;
  archive: SandboxDirectoryArchive;
  dirPath: string;
  archivePath: string;
  depth?: number;
}): Promise<void> {
  if (depth > MAX_ARCHIVE_DEPTH) return;

  const providerDirPath = sandbox.resolveRuntimePath(dirPath, { allowAbsolutePath: true });
  const entries =
    depth === 0
      ? await sandbox.runWithRecovery(() => sandbox.opensandbox.listDirectory(providerDirPath))
      : await sandbox.opensandbox.listDirectory(providerDirPath);

  for (const entry of entries) {
    // 跳过 OpenSandbox ext4 PVC 挂载根目录（$HOME）下的系统目录 lost+found。
    if (providerDirPath === OPEN_SANDBOX_DEFAULT_HOME_PATH && entry.name === 'lost+found') {
      continue;
    }

    const entryArchivePath = archivePath ? `${archivePath}/${entry.name}` : entry.name;

    if (entry.isDirectory) {
      await addDirectoryToArchive({
        sandbox,
        archive,
        dirPath: entry.path,
        archivePath: entryArchivePath,
        depth: depth + 1
      });
    } else {
      const providerFilePath = sandbox.resolveRuntimePath(entry.path, { allowAbsolutePath: true });
      archive.append(Readable.from(sandbox.opensandbox.readFileStream(providerFilePath)), {
        name: entryArchivePath
      });
    }
  }
}

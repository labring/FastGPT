/**
 * 沙盒业务层：处理已有 sandbox 的文件写入、读取、路径解析和目录打包。
 *
 * 只操作调用方传入的 sandbox/client，不创建、恢复或清理 sandbox 实例。
 */
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { SANDBOX_INTERNAL_RUNTIME_DIR_NAME } from '@fastgpt/global/core/ai/sandbox/constants';
import type { SandboxSessionDirEntry } from '@fastgpt/global/core/ai/sandbox/type';
import type { FileInfo, WriteEntry } from '@alibaba-group/opensandbox';
import type { OpenSandboxClient } from '../infrastructure/opensandbox/opensandbox';
import { posix } from 'node:path';
import { Readable } from 'node:stream';
import type { SandboxClient } from './runtime/client';
import { readExternalFileBuffer } from '../../../../common/file/read/external';
import { trimSandboxPathRight } from '../utils';
import { createSizeLimitedStream } from '../../../../common/file/stream';

const EMPTY_ZIP_ARCHIVE_BYTES = Buffer.from('504b0506000000000000000000000000000000000000', 'hex');

export class SandboxFileConflictError extends Error {
  constructor(message = 'Sandbox file has been modified; please refresh before saving') {
    super(message);
    this.name = 'SandboxFileConflictError';
  }
}

export class SandboxFileNotFoundError extends Error {
  constructor(message = 'Sandbox file does not exist') {
    super(message);
    this.name = 'SandboxFileNotFoundError';
  }
}

/**
 * 基于 execd 返回的 FileInfo 计算乐观并发校验 etag。
 * 使用文件字节大小与修改时间戳组合，防止编辑器静默覆盖 Agent 后台修改。
 */
export function computeSandboxFileEtag(
  fileInfo?: Pick<FileInfo, 'size' | 'modifiedAt'>
): string | undefined {
  if (!fileInfo) return undefined;
  const size = typeof fileInfo.size === 'number' ? fileInfo.size : 0;
  const mtimeMs = fileInfo.modifiedAt?.getTime() ?? 0;
  return `W/"${size}-${Number.isFinite(mtimeMs) ? mtimeMs : 0}"`;
}

/**
 * 把需要登录的文件接口路径解析为容器内绝对路径。
 *
 * 相对路径以当前会话目录为基准，绝对路径直接使用。沙箱的安全隔离边界是按
 * `(sourceType, sourceId, userId)` 独占的单用户、非特权、无平台凭证且网络隔离的容器实例本身
 * （容器内所有会话与挂载的 Skill 同属当前用户，且对话中的 AI Agent 已具备容器内 shell 访问权限），
 * 因此这里只做 POSIX 词法路径规整并拒绝 `..` 段，不限制 `workspace` 范围，也不解析符号链接；
 * 免登录的预览链接则执行词法层面的 `workspaceRoot`（`/workspace`）前缀校验并排除 `.fastgpt` 系统目录，同样不解析 `realpath`。
 */
export function resolveSandboxFilePath(sandbox: SandboxClient, path = '.'): string {
  // 先检查原始 `..`，再规整等价 POSIX 路径，避免 `/workspace/.` 等形式绕过根目录保护。
  return posix.normalize(
    sandbox.resolveRuntimePath(path.trim() || '.', { allowAbsolutePath: true })
  );
}

/**
 * 防止 IDE 误操作删除、移动或覆盖会话目录、workspace 根目录、持久化运行态目录（`.fastgpt`）和文件系统根目录。
 * 这是产品保护而非安全边界，按解析后的字符串路径比较即可。
 */
function assertNotSandboxRootPath({
  sandbox,
  sandboxPath,
  message
}: {
  sandbox: SandboxClient;
  sandboxPath: string;
  message: string;
}) {
  const { sessionWorkDirectory, workspaceRoot } = sandbox.getRuntimePaths();
  // trimSandboxPathRight 把 `/` 规整为空串，统一比较后文件系统根目录也能被识别。
  const target = trimSandboxPathRight(sandboxPath);
  const internalRuntimeRoot = `${trimSandboxPathRight(workspaceRoot)}/${SANDBOX_INTERNAL_RUNTIME_DIR_NAME}`;
  if (
    [sessionWorkDirectory, workspaceRoot, '/'].some(
      (root) => trimSandboxPathRight(root) === target
    ) ||
    target === internalRuntimeRoot ||
    target.startsWith(`${internalRuntimeRoot}/`)
  ) {
    throw new Error(message);
  }
}

/**
 * 单层列出目录（强制 depth: 1 懒加载，避免递归扫穿 JuiceFS PG 元数据）。
 * 列出会话根目录时先创建它，保证新会话的文件树可以正常打开。
 */
export async function listSandboxSessionDirectory(
  sandbox: SandboxClient,
  relativePath = '.'
): Promise<SandboxSessionDirEntry[]> {
  const cleanRel = relativePath.trim().replace(/^\.\//, '') || '.';
  const sandboxPath = resolveSandboxFilePath(sandbox, cleanRel);
  const { workspaceRoot } = sandbox.getRuntimePaths();
  const isWorkspaceRoot = trimSandboxPathRight(sandboxPath) === trimSandboxPathRight(workspaceRoot);
  if (cleanRel === '.') {
    await sandbox.opensandbox.createDirectories([sandboxPath]);
  }
  const entries = await sandbox.opensandbox.listDirectory(sandboxPath, { depth: 1 });

  return entries
    .map((entry) => ({
      name: posix.basename(entry.path),
      entry
    }))
    .filter(
      ({ name }) =>
        name &&
        name !== '.' &&
        name !== '..' &&
        // 隐藏持久化工作区根下的系统运行态/包缓存目录 `.fastgpt`，避免污染编辑器文件树。
        !(isWorkspaceRoot && name === SANDBOX_INTERNAL_RUNTIME_DIR_NAME)
    )
    .map(({ name, entry }) => {
      const mtimeMs = entry.modifiedAt?.getTime();
      return {
        name,
        path: cleanRel === '.' ? name : `${cleanRel}/${name}`,
        type: entry.type === 'directory' ? ('directory' as const) : ('file' as const),
        ...(typeof entry.size === 'number' ? { size: entry.size } : {}),
        ...(typeof mtimeMs === 'number' && Number.isFinite(mtimeMs) ? { mtime: mtimeMs } : {})
      };
    });
}

/**
 * 查询沙盒文件元数据；当路径本身是符号链接时，解析其最终目标文件的真实元数据。
 *
 * OpenSandbox `execd /files/info` 基于 `lstat` 返回符号链接自身的路径字符串字节长度，
 * 而 `readFileStream` 会解引用读取目标文件内容；因此在读取、预览及计算 ETag 时必须使用目标文件元数据，
 * 避免 `Content-Length` 截断或连接挂起，并准确拦截悬空链接与指向目录的符号链接。
 * 注意：此处的 `realpath -e` 仅用于在已知 `isSymlink` 时获取目标文件大小与类型，不作为路径安全拦截边界。
 */
export async function resolveSandboxTargetFileInfo(
  opensandbox: OpenSandboxClient,
  sandboxPath: string
): Promise<FileInfo | undefined> {
  const info = (await opensandbox.getFileInfo([sandboxPath])).get(sandboxPath);
  if (!info || info.type !== 'symlink') {
    return info;
  }

  const realpathResult = await opensandbox.execute(`realpath -e -- ${shellQuote(sandboxPath)}`);
  if (realpathResult.exitCode !== 0) {
    return undefined;
  }
  const targetPath = realpathResult.stdout.trim();
  if (!targetPath) {
    return undefined;
  }
  return (await opensandbox.getFileInfo([targetPath])).get(targetPath);
}

/** 读取文件的元数据与原始字节流；内容保持二进制，不在主站拼接或转码。 */
export async function readSandboxSessionFile(
  sandbox: SandboxClient,
  relativePath: string
): Promise<{ stream: AsyncIterable<Uint8Array>; fileName: string; etag?: string; size?: number }> {
  const sandboxPath = resolveSandboxFilePath(sandbox, relativePath);
  const fileInfo = await resolveSandboxTargetFileInfo(sandbox.opensandbox, sandboxPath);
  if (!fileInfo || fileInfo.type !== 'file') {
    throw new SandboxFileNotFoundError();
  }

  return {
    stream: sandbox.opensandbox.readFileStream(sandboxPath),
    fileName: posix.basename(sandboxPath),
    etag: computeSandboxFileEtag(fileInfo),
    size: fileInfo.size
  };
}

/**
 * 将受限字节流直接写入沙箱目标文件。
 * 若提供 oldEtag 则在写入前执行乐观并发校验，防止静默覆盖后台并发修改。
 */
export async function writeSandboxSessionFile(
  sandbox: SandboxClient,
  {
    path,
    stream,
    oldEtag,
    maxFileBytes,
    signal
  }: {
    path: string;
    stream: Readable;
    oldEtag?: string;
    maxFileBytes: number;
    signal?: AbortSignal;
  }
): Promise<{ etag?: string; bytesWritten: number }> {
  signal?.throwIfAborted();
  const sandboxPath = resolveSandboxFilePath(sandbox, path);
  assertNotSandboxRootPath({ sandbox, sandboxPath, message: 'Invalid sandbox file path' });

  /** SDK 没有条件写入参数，必须由业务层检查版本，不能把弱 etag 当作 If-Match。 */
  const assertFileVersion = (info?: FileInfo) => {
    if (info?.type === 'directory') throw new Error('Cannot write a directory as a file');
    if (oldEtag !== undefined && computeSandboxFileEtag(info) !== oldEtag) {
      throw new SandboxFileConflictError();
    }
  };
  const existingInfo = await resolveSandboxTargetFileInfo(sandbox.opensandbox, sandboxPath);
  assertFileVersion(existingInfo);
  await prepareSandboxFileParentDirectories(sandbox.opensandbox, [sandboxPath]);

  let streamError: Error | undefined;
  const boundedStream = createSizeLimitedStream({
    stream,
    maxBytes: maxFileBytes,
    createExceededError: (size) => {
      streamError = new Error(`File is too large (${size} bytes > ${maxFileBytes} bytes)`);
      return streamError;
    }
  });
  boundedStream.on('error', (error) => {
    streamError ??= error instanceof Error ? error : new Error(String(error));
  });
  const onAbort = () => {
    const abortError = new Error('Sandbox file upload aborted');
    streamError ??= abortError;
    boundedStream.destroy(abortError);
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    signal?.throwIfAborted();
    await sandbox.opensandbox.writeFiles([
      {
        path: sandboxPath,
        data: Readable.toWeb(boundedStream) as ReadableStream<Uint8Array>,
        ...(existingInfo?.mode !== undefined ? { mode: existingInfo.mode } : {}),
        ...(existingInfo?.owner !== undefined ? { owner: existingInfo.owner } : {}),
        ...(existingInfo?.group !== undefined ? { group: existingInfo.group } : {})
      }
    ]);

    signal?.throwIfAborted();
    const updatedInfo = await resolveSandboxTargetFileInfo(sandbox.opensandbox, sandboxPath);
    return {
      etag: computeSandboxFileEtag(updatedInfo),
      bytesWritten: updatedInfo?.size ?? 0
    };
  } catch (error) {
    throw streamError ?? error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    boundedStream.destroy();
  }
}

/** 创建目录（递归创建父目录）。 */
export async function createSandboxSessionDirectory(
  sandbox: SandboxClient,
  relativePath: string
): Promise<void> {
  const sandboxPath = resolveSandboxFilePath(sandbox, relativePath);
  assertNotSandboxRootPath({ sandbox, sandboxPath, message: 'Invalid sandbox directory path' });
  await sandbox.opensandbox.createDirectories([sandboxPath]);
}

/** 移动或重命名文件/目录；源路径是符号链接时移动链接本身。 */
export async function moveSandboxSessionEntry(
  sandbox: SandboxClient,
  params: { from: string; to: string }
): Promise<void> {
  const fromPath = resolveSandboxFilePath(sandbox, params.from);
  const toPath = resolveSandboxFilePath(sandbox, params.to);
  assertNotSandboxRootPath({
    sandbox,
    sandboxPath: fromPath,
    message: 'Cannot move workspace root directory'
  });
  assertNotSandboxRootPath({
    sandbox,
    sandboxPath: toPath,
    message: 'Cannot move workspace root directory'
  });
  if (fromPath === toPath) return;

  await prepareSandboxFileParentDirectories(sandbox.opensandbox, [toPath]);
  await sandbox.opensandbox.moveFiles([{ src: fromPath, dest: toPath }]);
}

/** 删除文件或目录；指向目录的符号链接只删除链接本身，不递归删除目标目录。 */
export async function deleteSandboxSessionEntry(
  sandbox: SandboxClient,
  relativePath: string
): Promise<void> {
  const sandboxPath = resolveSandboxFilePath(sandbox, relativePath);
  assertNotSandboxRootPath({
    sandbox,
    sandboxPath,
    message: 'Cannot delete workspace root directory'
  });

  // 去掉非根路径的末尾斜杠，避免 `sym-dir/` 在底层 stat 或 `rm -f` 时穿透指向目录的符号链接。
  const targetPath = trimSandboxPathRight(sandboxPath) || '/';
  const infoMap = await sandbox.opensandbox.getFileInfo([targetPath]);
  const info = infoMap.get(targetPath);
  if (info?.type === 'directory') {
    await sandbox.opensandbox.deleteDirectories([targetPath]);
    return;
  }

  try {
    await sandbox.opensandbox.deleteFiles([targetPath]);
  } catch (error) {
    const deleteError = error instanceof Error ? error : new Error(String(error));
    // OpenSandbox execd 的 deleteFiles 遇到指向目录的符号链接会返回 `is a directory`；
    // 回退执行不带 `-r` 的 `rm -f` 仅解绑符号链接本身，若是真实目录仍会安全报错而不会递归删除目标目录。
    if (/is a directory/i.test(deleteError.message)) {
      const rmResult = await sandbox.opensandbox.execute(`rm -f -- ${shellQuote(targetPath)}`);
      if (rmResult.exitCode !== 0) {
        const detail = rmResult.stderr.trim() || rmResult.stdout.trim();
        throw new Error(detail ? detail : deleteError.message);
      }
      return;
    }
    throw deleteError;
  }
}

export type SandboxUrlFile = {
  path: string;
  url: string;
};

export type SandboxInputFileReader = (url: string) => Promise<Buffer>;

/** 读取准备写入 Sandbox 的远程文件，禁止相对 URL 回环访问本机 API。 */
export const readSandboxUrlFile = async (url: string) => {
  return (await readExternalFileBuffer({ url })).buffer;
};

/**
 * 在写入文件前创建其父目录。
 *
 * Sandbox 文件系统运行在 POSIX 环境，createDirectories 会递归创建目录；这里同时去重，
 * 避免批量文件落在同一目录时重复调用 OpenSandbox。
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
  readInputFile = readSandboxUrlFile
}: {
  sandbox: OpenSandboxClient;
  files: SandboxUrlFile[];
  readInputFile?: SandboxInputFileReader;
}) {
  const writeFileTasks: Promise<WriteEntry>[] = [];

  for (const { path, url } of files) {
    if (!path) continue;
    writeFileTasks.push(
      readInputFile(url).then((data) => ({
        path,
        data
      }))
    );
  }

  if (writeFileTasks.length === 0) return;
  const writeEntries = await Promise.all(writeFileTasks);
  await prepareSandboxFileParentDirectories(
    sandbox,
    writeEntries.map(({ path }) => path)
  );
  await sandbox.writeFiles(writeEntries);
}

/**
 * 判断沙盒路径是否为目录。
 */
export async function isSandboxPathDirectory(
  sandbox: SandboxClient,
  path: string
): Promise<boolean> {
  const sandboxPath = resolveSandboxFilePath(sandbox, path);
  const fileInfoMap = await sandbox.opensandbox.getFileInfo([sandboxPath]);
  return fileInfoMap.get(sandboxPath)?.type === 'directory';
}

/**
 * 在容器内将目标目录打包为 `/tmp` 临时 ZIP 并流式读取，避免逐文件 HTTP 拉取并保持与 Skill 打包一致。
 *
 * 使用 `zip -r -y -q` 保留符号链接本身而不解引用目标文件；位于 `/workspace` 根时自动排除 `.fastgpt` 系统目录。
 */
export async function readSandboxSessionDirectoryArchive(
  sandbox: SandboxClient,
  dirPath: string
): Promise<{
  stream: AsyncIterable<Uint8Array>;
  size?: number;
  cleanup: () => Promise<void>;
}> {
  const resolvedDirPath = resolveSandboxFilePath(sandbox, dirPath);
  const { workspaceRoot } = sandbox.getRuntimePaths();
  const isWorkspaceRoot =
    trimSandboxPathRight(resolvedDirPath) === trimSandboxPathRight(workspaceRoot);
  const zipPath = `/tmp/fastgpt-download-${getNanoid(12)}.zip`;
  const cleanup = async () => {
    await sandbox.opensandbox.deleteFiles([zipPath]).catch(() => undefined);
  };

  const excludeArgs = isWorkspaceRoot
    ? `-x ${shellQuote(SANDBOX_INTERNAL_RUNTIME_DIR_NAME)} ${shellQuote(`${SANDBOX_INTERNAL_RUNTIME_DIR_NAME}/*`)}`
    : '';
  const zipCommand = excludeArgs
    ? `zip -r -y -q ${shellQuote(zipPath)} . ${excludeArgs}`
    : `zip -r -y -q ${shellQuote(zipPath)} .`;

  const result = await sandbox.opensandbox.execute(zipCommand, {
    workingDirectory: resolvedDirPath
  });

  // 空目录或仅含被排除系统目录时，`zip` 返回 exitCode 12（Nothing to do），返回标准空 ZIP。
  if (result.exitCode === 12) {
    await cleanup();
    return {
      stream: Readable.from([EMPTY_ZIP_ARCHIVE_BYTES]),
      size: EMPTY_ZIP_ARCHIVE_BYTES.length,
      cleanup: async () => undefined
    };
  }
  if (result.exitCode !== 0) {
    await cleanup();
    throw new Error(`Failed to archive directory: ${result.stderr || result.stdout}`);
  }

  const zipInfo = (await sandbox.opensandbox.getFileInfo([zipPath])).get(zipPath);
  return {
    stream: sandbox.opensandbox.readFileStream(zipPath),
    size: zipInfo?.size,
    cleanup
  };
}

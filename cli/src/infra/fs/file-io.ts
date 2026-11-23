import { randomUUID } from 'node:crypto';
import { access, link, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { CliArgumentError } from '../../shared/errors';

export type LoadedBinaryFile = {
  filename: string;
  size: number;
  mimeType: string;
  data: Uint8Array;
};

export type FileIoAdapter = {
  resolvePath: (targetPath: string, baseDir?: string) => string;
  exists: (targetPath: string, baseDir?: string) => Promise<boolean>;
  readTextFile: (filePath: string, baseDir?: string) => Promise<string>;
  readBinaryFile: (filePath: string, baseDir?: string) => Promise<LoadedBinaryFile>;
  writeTextAtomic: (params: {
    filePath: string;
    content: string;
    baseDir?: string;
    overwrite?: boolean;
  }) => Promise<string>;
  writeBinaryAtomic: (params: {
    filePath: string;
    content: Uint8Array;
    baseDir?: string;
    overwrite?: boolean;
  }) => Promise<string>;
  writeStreamAtomic: (params: {
    filePath: string;
    stream: ReadableStream<Uint8Array>;
    baseDir?: string;
    overwrite?: boolean;
  }) => Promise<{ path: string; bytes: number }>;
  createTextFiles: (params: {
    baseDir: string;
    files: Array<{ filePath: string; content: string }>;
  }) => Promise<void>;
};

const MIME_BY_EXT: Record<string, string> = {
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mdx': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

export function inferMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * 基于工作目录解析并读取文本与二进制文件的适配器，避免 domain 层直接耦合 `node:fs`。
 */
export function createNodeFileIoAdapter({ cwd }: { cwd: string }): FileIoAdapter {
  const resolvePath = (targetPath: string, baseDir?: string): string =>
    baseDir === undefined ? resolve(cwd, targetPath) : resolve(cwd, baseDir, targetPath);

  return {
    resolvePath,
    exists: async (targetPath, baseDir) => {
      const fullPath = resolvePath(targetPath, baseDir);
      return access(fullPath).then(
        () => true,
        () => false
      );
    },
    readTextFile: async (filePath, baseDir) => {
      const fullPath = resolvePath(filePath, baseDir);
      try {
        return await readFile(fullPath, 'utf8');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new CliArgumentError(`Failed to read file "${filePath}": ${msg}`);
      }
    },
    readBinaryFile: async (filePath, baseDir) => {
      const fullPath = resolvePath(filePath, baseDir);
      try {
        const buffer = await readFile(fullPath);
        const filename = basename(fullPath);
        return {
          filename,
          size: buffer.byteLength,
          mimeType: inferMimeType(filename),
          data: buffer
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new CliArgumentError(`Failed to read file "${filePath}": ${msg}`);
      }
    },
    writeTextAtomic: ({ filePath, content, baseDir, overwrite = true }) =>
      writeAtomicFile({
        absolutePath: resolvePath(filePath, baseDir),
        content,
        overwrite
      }),
    writeBinaryAtomic: ({ filePath, content, baseDir, overwrite = false }) =>
      writeAtomicFile({
        absolutePath: resolvePath(filePath, baseDir),
        content,
        overwrite
      }),
    writeStreamAtomic: ({ filePath, stream, baseDir, overwrite = false }) =>
      writeStreamToFile({
        absolutePath: resolvePath(filePath, baseDir),
        stream,
        overwrite
      }),
    createTextFiles: async ({ baseDir, files }) => {
      const created: string[] = [];
      try {
        for (const { filePath, content } of files) {
          const path = await writeAtomicFile({
            absolutePath: resolvePath(filePath, baseDir),
            content,
            overwrite: false
          });
          created.push(path);
        }
      } catch (error) {
        // 只清理本次初始化成功创建的文件，保留已存在的工作区文件。
        await Promise.allSettled(created.map((path) => rm(path, { force: true })));
        throw error;
      }
    }
  };
}

/** 运行原子落盘回调：先独占写入同目录临时文件，成功 sync 并关闭句柄后再按覆盖策略原子发布。 */
async function withAtomicTempFile<T>({
  absolutePath,
  overwrite,
  writeContent
}: {
  absolutePath: string;
  overwrite: boolean;
  writeContent: (handle: Awaited<ReturnType<typeof open>>) => Promise<T>;
}): Promise<{ path: string; result: T }> {
  const directory = dirname(absolutePath);
  const temporaryPath = join(
    directory,
    `.${basename(absolutePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
  );
  await mkdir(directory, { recursive: true });

  const handle = await open(temporaryPath, 'wx');
  try {
    const result = await writeContent(handle);
    await handle.sync();
    await handle.close();
    if (overwrite) {
      await rename(temporaryPath, absolutePath);
    } else {
      await link(temporaryPath, absolutePath);
    }
    return { path: absolutePath, result };
  } catch (error) {
    await handle.close().catch(() => {});
    if (!overwrite && error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      throw new CliArgumentError(
        `File already exists: "${absolutePath}".`,
        { filePath: absolutePath },
        'Pass --overwrite to replace the existing file.'
      );
    }
    throw error;
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

/** 将完整文本或二进制内容原子发布到目标路径。 */
async function writeAtomicFile({
  absolutePath,
  content,
  overwrite
}: {
  absolutePath: string;
  content: string | Uint8Array;
  overwrite: boolean;
}): Promise<string> {
  const { path } = await withAtomicTempFile({
    absolutePath,
    overwrite,
    writeContent: async (handle) => {
      if (typeof content === 'string') {
        await handle.writeFile(content, 'utf8');
      } else {
        await handle.writeFile(content);
      }
    }
  });
  return path;
}

/** 边读边写流式响应体到临时文件，传输完成并刷盘后再原子提交；断流或失败时自动清理临时文件。 */
async function writeStreamToFile({
  absolutePath,
  stream,
  overwrite
}: {
  absolutePath: string;
  stream: ReadableStream<Uint8Array>;
  overwrite: boolean;
}): Promise<{ path: string; bytes: number }> {
  const { path, result } = await withAtomicTempFile({
    absolutePath,
    overwrite,
    writeContent: async (handle) => {
      const reader = stream.getReader();
      let totalBytes = 0;
      let streamCompleted = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            streamCompleted = true;
            break;
          }
          if (!value || value.byteLength === 0) {
            continue;
          }
          let offset = 0;
          while (offset < value.byteLength) {
            const { bytesWritten } = await handle.write(value, offset, value.byteLength - offset);
            if (bytesWritten <= 0) {
              throw new Error('Failed to write stream chunk to temporary file.');
            }
            offset += bytesWritten;
          }
          totalBytes += value.byteLength;
        }
        return totalBytes;
      } finally {
        if (!streamCompleted) {
          await reader.cancel().catch(() => {});
        }
        reader.releaseLock();
      }
    }
  });
  return { path, bytes: result };
}

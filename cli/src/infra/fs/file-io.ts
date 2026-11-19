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
  }) => Promise<string>;
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
    writeTextAtomic: ({ filePath, content, baseDir }) =>
      writeTextFile({ absolutePath: resolvePath(filePath, baseDir), content }),
    createTextFiles: async ({ baseDir, files }) => {
      const created: string[] = [];
      try {
        for (const { filePath, content } of files) {
          const path = await writeTextFile({
            absolutePath: resolvePath(filePath, baseDir),
            content,
            exclusive: true
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

/** 将完整内容从临时文件发布到目标路径，初始化时使用独占写入防止覆盖现有文件。 */
async function writeTextFile({
  absolutePath,
  content,
  exclusive = false
}: {
  absolutePath: string;
  content: string;
  exclusive?: boolean;
}): Promise<string> {
  const directory = dirname(absolutePath);
  const temporaryPath = join(
    directory,
    `.${basename(absolutePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
  );
  await mkdir(directory, { recursive: true });

  const handle = await open(temporaryPath, 'wx');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    if (exclusive) {
      await link(temporaryPath, absolutePath);
    } else {
      await rename(temporaryPath, absolutePath);
    }
    return absolutePath;
  } catch (error) {
    await handle.close().catch(() => {});
    if (exclusive && error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      throw new CliArgumentError(`File already exists: "${absolutePath}".`, {
        filePath: absolutePath
      });
    }
    throw error;
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

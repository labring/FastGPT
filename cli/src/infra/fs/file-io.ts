import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { CliArgumentError } from '../../shared/errors';

export type LoadedBinaryFile = {
  filename: string;
  size: number;
  mimeType: string;
  data: Uint8Array;
};

export type FileIoAdapter = {
  resolvePath: (targetPath: string) => string;
  readTextFile: (filePath: string) => Promise<string>;
  readBinaryFile: (filePath: string) => Promise<LoadedBinaryFile>;
  writeOutputFile: (filePath: string, data: Uint8Array | string) => Promise<string>;
  writeStreamFile?: (
    filePath: string,
    stream: ReadableStream<Uint8Array>
  ) => Promise<{ path: string; bytes: number }>;
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
 * 基于工作目录解析、读写文本与二进制文件的适配器，避免 domain 层直接耦合 `node:fs`。
 */
export function createNodeFileIoAdapter({ cwd }: { cwd: string }): FileIoAdapter {
  const resolvePath = (targetPath: string): string => resolve(cwd, targetPath);

  return {
    resolvePath,
    readTextFile: async (filePath) => {
      const fullPath = resolvePath(filePath);
      try {
        return await readFile(fullPath, 'utf8');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new CliArgumentError(`Failed to read file "${filePath}": ${msg}`);
      }
    },
    readBinaryFile: async (filePath) => {
      const fullPath = resolvePath(filePath);
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
    writeOutputFile: async (filePath, data) => {
      const fullPath = resolvePath(filePath);
      try {
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, data);
        return fullPath;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new CliArgumentError(`Failed to write file "${filePath}": ${msg}`);
      }
    },
    writeStreamFile: async (filePath, stream) => {
      const fullPath = resolvePath(filePath);
      try {
        await mkdir(dirname(fullPath), { recursive: true });
        const readable = Readable.fromWeb(stream as unknown as NodeReadableStream);
        await pipeline(readable, createWriteStream(fullPath));
        const fileStat = await stat(fullPath);
        return { path: fullPath, bytes: fileStat.size };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new CliArgumentError(`Failed to write stream to file "${filePath}": ${msg}`);
      }
    }
  };
}

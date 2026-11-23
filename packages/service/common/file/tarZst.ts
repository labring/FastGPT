/**
 * 主站 `.tar.zst` 编解码（`tar-stream` + Node 原生 Zstandard）。
 *
 * 边界：主站把来自沙盒、S3、用户上传的归档字节一律视为不可信输入，但从不把条目落到本机磁盘，
 * 因此只在这里做两件事：
 * - 解析侧：限制 header 数与文件解压总字节，统一规范化条目路径（拒绝绝对路径、`..`、NUL 与控制字符），
 *   只向调用方产出 `file` / `directory` / `symlink`，其余类型（硬链接、设备、FIFO 等）直接跳过；
 * - 编码侧：把条目迭代器流式写为 tar 并压缩，不在内存或 `/tmp` 堆积整包。
 * 符号链接目标原样透传，不做任何解析；沙盒内的写入安全由沙盒自身隔离保证。
 */
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import * as tar from 'tar-stream';
import { throwIfAborted } from '@fastgpt/global/common/system/utils';

const ZSTD_COMPRESSION_LEVEL = 1;
const TAR_DEFAULT_MAX_ENTRIES = 100_000;

/** 归档总字节超出允许上限时抛出的具名异常，避免调用方依赖错误文案子串做分支判断。 */
export class ArchiveTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveTooLargeError';
  }
}

/** 归档条目路径包含控制字符或路径穿越时抛出的具名异常，供 Skill 等边界映射为结构化业务错误。 */
export class InvalidArchiveEntryPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidArchiveEntryPathError';
  }
}

export type TarEntryType = 'file' | 'directory' | 'symlink';

/** 编码输入条目；`file` 需提供 `size` 与 `content`，`symlink` 需提供 `linkname`。 */
export type TarEntry = {
  path: string;
  type: TarEntryType;
  mode: number;
  mtime?: Date;
  size?: number;
  linkname?: string;
  content?: Buffer | (() => Promise<Readable>);
};

/** 解析产出条目；`stream` 仅对 `file` 有数据，未读完的部分由解析器自动排空。 */
export type ParsedTarEntry = {
  path: string;
  type: TarEntryType;
  mode: number;
  mtime: Date;
  size: number;
  linkname?: string;
  stream: AsyncIterable<Buffer>;
};

/**
 * 规范化归档条目路径（tar 与 zip 共用）：统一 `/` 分隔，去掉空段与 `.` 段，目录以 `/` 结尾。
 * 拒绝 ASCII 控制字符（0x00–0x1f、0x7f，保留普通空格）、绝对路径、Windows 盘符与 `..` 穿越；
 * 仅表示根目录的条目返回 `null`。
 */
export const normalizeArchiveEntryPath = (rawPath: string, isDirectory: boolean): string | null => {
  for (let i = 0; i < rawPath.length; i++) {
    const code = rawPath.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      throw new InvalidArchiveEntryPathError(`Invalid archive entry path: ${rawPath}`);
    }
  }
  const unified = rawPath.replace(/\\/g, '/');
  if (unified.startsWith('/') || /^[a-zA-Z]:/.test(unified)) {
    throw new InvalidArchiveEntryPathError(`Absolute path is not allowed in archive: ${rawPath}`);
  }
  const segments = unified.split('/').filter((segment) => segment && segment !== '.');
  if (segments.includes('..')) {
    throw new InvalidArchiveEntryPathError(`Path traversal is not allowed in archive: ${rawPath}`);
  }
  if (segments.length === 0) return null;
  const normalized = segments.join('/');
  return isDirectory ? `${normalized}/` : normalized;
};

/**
 * 以固定压缩级别把源流（可串联若干 Transform）压缩为 zstd 只读流。
 *
 * 任一环节出错都会由 `pipeline` 销毁整条链路并在返回流上抛出原始错误；
 * 消费方提前销毁返回流同样会反向销毁源流。
 */
export function compressZstd(
  source: NodeJS.ReadableStream,
  ...transforms: NodeJS.ReadWriteStream[]
): Readable {
  const compressor = zlib.createZstdCompress({
    params: { [zlib.constants.ZSTD_c_compressionLevel]: ZSTD_COMPRESSION_LEVEL }
  });
  compressor.on('error', () => undefined);
  // 错误已经通过被销毁的 compressor 传递给消费方，这里只需避免 unhandledRejection。
  pipeline([source, ...transforms, compressor]).catch(() => undefined);
  return compressor;
}

/**
 * 将条目迭代器流式编码为 `.tar.zst`。
 *
 * 条目内容按需打开并带背压写入；条目实际字节与声明 `size` 不一致时由 `tar-stream` 报错终止。
 */
export function createTarZstStream(
  entries: AsyncIterable<TarEntry> | Iterable<TarEntry>
): Readable {
  const pack = tar.pack();
  pack.on('error', () => undefined);
  // tar-stream 基于 streamx，缺少 Node ReadableStream 方法；通过 Readable.from 适配给 stream/promises pipeline。
  const output = compressZstd(Readable.from(pack));

  (async () => {
    for await (const entry of entries) {
      const header: Parameters<tar.Pack['entry']>[0] = {
        name: entry.path,
        type: entry.type,
        mode: entry.mode,
        mtime: entry.mtime ?? new Date(),
        ...(entry.type === 'file' ? { size: entry.size ?? 0 } : {}),
        ...(entry.type === 'symlink' ? { linkname: entry.linkname } : {})
      };

      const { content } = entry;
      if (typeof content === 'function') {
        await pipeline(await content(), pack.entry(header));
        continue;
      }

      // 目录与软链没有数据体；文件缺省内容按空文件写入，避免 tar-stream 等待永远不会到来的数据。
      await new Promise<void>((resolve, reject) => {
        const done = (error?: Error | null) => (error ? reject(error) : resolve());
        if (entry.type === 'file') pack.entry(header, content ?? Buffer.alloc(0), done);
        else pack.entry(header, done);
      });
    }
    pack.finalize();
  })().catch((error) => pack.destroy(error));

  return output;
}

/**
 * 流式解压并逐条解析 `.tar.zst`，`onEntry` 返回前不会读取下一条（天然背压）。
 *
 * - `maxEntries` 统计所有 header（含被跳过的条目），`maxTotalBytes` 统计文件声明字节；
 * - 仅产出 `file` / `directory` / `symlink`，根目录占位与其他类型条目自动排空跳过。
 */
export async function parseTarZstStream(params: {
  stream: Readable;
  signal?: AbortSignal;
  maxEntries?: number;
  maxTotalBytes?: number;
  onEntry: (entry: ParsedTarEntry) => Promise<void>;
}): Promise<void> {
  const { stream, signal, onEntry } = params;
  const maxEntries = params.maxEntries ?? TAR_DEFAULT_MAX_ENTRIES;
  const maxTotalBytes = params.maxTotalBytes ?? Number.POSITIVE_INFINITY;
  const extract = tar.extract();
  // 创建 pipeline 时即捕获拒绝，避免异步 onEntry 挂起期间发生断流引发 unhandledRejection。
  let pipingError: unknown;
  const piping = pipeline(stream, zlib.createZstdDecompress(), extract, { signal }).catch(
    (error) => {
      pipingError = error ?? new Error('Unknown tar.zst pipeline error');
    }
  );

  try {
    let headerCount = 0;
    let totalBytes = 0;

    for await (const rawEntry of extract) {
      throwIfAborted(signal);
      headerCount += 1;
      if (headerCount > maxEntries) {
        throw new Error(`Tar archive exceeds maximum allowed entry count (${maxEntries})`);
      }

      const { header } = rawEntry;
      const type: TarEntryType | undefined =
        header.type === 'file' || header.type === 'contiguous-file'
          ? 'file'
          : header.type === 'directory' || header.type === 'symlink'
            ? header.type
            : undefined;
      const path = type ? normalizeArchiveEntryPath(header.name, type === 'directory') : null;

      if (type && path) {
        const size = type === 'file' ? (header.size ?? 0) : 0;
        totalBytes += size;
        if (totalBytes > maxTotalBytes) {
          throw new ArchiveTooLargeError(
            `Tar archive exceeds maximum allowed size (${maxTotalBytes} bytes)`
          );
        }
        await onEntry({
          path,
          type,
          mode: header.mode ?? (type === 'directory' ? 0o755 : 0o644),
          mtime: header.mtime ?? new Date(0),
          size,
          ...(type === 'symlink' ? { linkname: header.linkname ?? '' } : {}),
          stream: rawEntry as AsyncIterable<Buffer>
        });
      }
      // 必须排空当前条目，`tar-stream` 才会继续产出下一条。
      rawEntry.resume();
    }
    await piping;
    if (pipingError !== undefined) {
      throw pipingError;
    }
  } catch (error) {
    // 消费侧主动中止前先记录已发生的底层管道错误，不被后续 destroy 产生的 Premature close 覆盖。
    const upstreamError = pipingError;
    stream.destroy(error instanceof Error ? error : new Error(String(error)));
    await piping;
    throw upstreamError !== undefined ? upstreamError : error;
  }
}

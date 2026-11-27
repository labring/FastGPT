/**
 * 远程 ZIP 读取：基于对象存储 HTTP Range 按需读取 Central Directory 与条目载荷，
 * 并作为 ZIP → `.tar.zst` 转码的唯一入口（导入 Skill 包注入沙盒、4.18.0 历史归档迁移）。
 */
import { PassThrough, Readable } from 'node:stream';
import { getAbortError, throwIfAborted } from '@fastgpt/global/common/system/utils';
import { fromRandomAccessReader, RandomAccessReader, type Entry, type ZipFile } from 'yauzl';
import { normalizeArchiveEntryPath, type TarEntry } from './tarZst';

export type ZipByteRangeReader = (params: {
  start: number;
  end: number;
  signal?: AbortSignal;
}) => Promise<Readable>;

const REMOTE_ZIP_BLOCK_SIZE_BYTES = 512 * 1024;
const REMOTE_ZIP_MAX_CACHED_BLOCKS = 16;
const REMOTE_ZIP_DIRECT_STREAM_THRESHOLD_BYTES = 2 * 1024 * 1024;

const ZIP_MAX_SYMLINK_TARGET_BYTES = 4096;
const ZIP_DEFAULT_MAX_ENTRIES = 100_000;
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_FILE_TYPE_REGULAR = 0o100000;
const UNIX_FILE_TYPE_DIR = 0o040000;
const UNIX_FILE_TYPE_SYMLINK = 0o120000;

const destroyQuietly = (stream?: Readable): void => {
  if (!stream) return;
  if (stream.listenerCount('error') === 0) {
    stream.on('error', () => undefined);
  }
  if (!stream.destroyed) {
    stream.destroy();
  }
};

/**
 * 基于固定大小 LRU 块缓存封装 `yauzl.RandomAccessReader`：
 * - EOCD、Central Directory、Local File Header 与小文件合并为 512 KiB 块请求（最多常驻 8 MiB），避免大量小 Range RTT；
 * - 单次超过 2 MiB 的大条目直接按精确字节范围流式透传，不污染块缓存。
 */
class BlockCachedRangeReader extends RandomAccessReader {
  private readonly totalSize: number;
  private readonly readRange: ZipByteRangeReader;
  private readonly disposeController = new AbortController();
  private readonly signal: AbortSignal;
  private readonly blockCache = new Map<number, Buffer>();
  private disposed = false;

  constructor({
    totalSize,
    readRange,
    signal
  }: {
    totalSize: number;
    readRange: ZipByteRangeReader;
    signal?: AbortSignal;
  }) {
    super();
    this.totalSize = totalSize;
    this.readRange = readRange;
    this.signal = signal
      ? AbortSignal.any([signal, this.disposeController.signal])
      : this.disposeController.signal;
  }

  private async loadBlock(blockIndex: number): Promise<Buffer> {
    throwIfAborted(this.signal);

    const cached = this.blockCache.get(blockIndex);
    if (cached) {
      // 刷新 LRU 热度，避免高频 Central Directory 块被挤出缓存。
      this.blockCache.delete(blockIndex);
      this.blockCache.set(blockIndex, cached);
      return cached;
    }

    const blockStart = blockIndex * REMOTE_ZIP_BLOCK_SIZE_BYTES;
    const blockEnd = Math.min(this.totalSize - 1, blockStart + REMOTE_ZIP_BLOCK_SIZE_BYTES - 1);
    const expectedBytes = blockEnd - blockStart + 1;

    const stream = await this.readRange({
      start: blockStart,
      end: blockEnd,
      signal: this.signal
    });
    const chunks: Buffer[] = [];
    let receivedBytes = 0;

    try {
      for await (const rawChunk of stream) {
        throwIfAborted(this.signal);
        const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
        receivedBytes += chunk.length;
        if (receivedBytes > expectedBytes) {
          throw new Error(
            `Remote ZIP range exceeded expected size: expected ${expectedBytes} bytes, got ${receivedBytes}`
          );
        }
        chunks.push(chunk);
      }
    } finally {
      destroyQuietly(stream);
    }

    if (receivedBytes !== expectedBytes) {
      throw new Error(
        `Unexpected EOF reading remote ZIP range [${blockStart}, ${blockEnd}]: expected ${expectedBytes} bytes, got ${receivedBytes}`
      );
    }

    const block = Buffer.concat(chunks, expectedBytes);
    if (!this.disposed) {
      if (this.blockCache.size >= REMOTE_ZIP_MAX_CACHED_BLOCKS) {
        const oldestKey = this.blockCache.keys().next().value;
        if (oldestKey !== undefined) {
          this.blockCache.delete(oldestKey);
        }
      }
      this.blockCache.set(blockIndex, block);
    }
    return block;
  }

  override _readStreamForRange(start: number, end: number): Readable {
    const totalSize = this.totalSize;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      end > totalSize
    ) {
      return new Readable({
        read() {
          this.destroy(
            new Error(
              `Out-of-bounds ZIP byte range [${start}, ${end}) for archive size ${totalSize}`
            )
          );
        }
      });
    }
    if (start === end) {
      return Readable.from([]);
    }

    if (end - start > REMOTE_ZIP_DIRECT_STREAM_THRESHOLD_BYTES) {
      const rangeController = new AbortController();
      const rangeSignal = AbortSignal.any([this.signal, rangeController.signal]);
      const readRangeFn = this.readRange;
      let source: Readable | undefined;
      let completed = false;
      let tornDown = false;

      const teardown = (reason?: Error) => {
        if (tornDown) return;
        tornDown = true;
        if (!completed && !rangeController.signal.aborted) {
          rangeController.abort(reason ?? new Error('ZIP range stream closed before completion'));
        }
        destroyQuietly(source);
        source = undefined;
      };

      const directStream = new PassThrough({
        destroy(error, callback) {
          teardown(error ?? undefined);
          callback(error);
        }
      });

      (async () => {
        try {
          throwIfAborted(rangeSignal);
          source = await readRangeFn({
            start,
            end: end - 1,
            signal: rangeSignal
          });
          throwIfAborted(rangeSignal);
          if (tornDown) return;
          for await (const chunk of source) {
            if (tornDown || directStream.destroyed) return;
            if (!directStream.write(chunk)) {
              await new Promise<void>((resolve) => {
                if (tornDown || directStream.destroyed) return resolve();
                const onDrain = () => {
                  directStream.off('close', onClose);
                  resolve();
                };
                const onClose = () => {
                  directStream.off('drain', onDrain);
                  resolve();
                };
                directStream.once('drain', onDrain);
                directStream.once('close', onClose);
              });
            }
          }
          completed = !tornDown;
          if (completed && !directStream.destroyed) {
            directStream.end();
          }
        } catch (error) {
          if (tornDown || directStream.destroyed) return;
          directStream.destroy(error instanceof Error ? error : new Error(String(error)));
        } finally {
          teardown();
        }
      })();

      return directStream;
    }

    const readerSignal = this.signal;
    const loadBlock = (blockIndex: number) => this.loadBlock(blockIndex);
    return Readable.from(
      (async function* () {
        let offset = start;
        while (offset < end) {
          throwIfAborted(readerSignal);
          const blockIndex = Math.floor(offset / REMOTE_ZIP_BLOCK_SIZE_BYTES);
          const blockOffset = offset - blockIndex * REMOTE_ZIP_BLOCK_SIZE_BYTES;
          const sliceLen = Math.min(end - offset, REMOTE_ZIP_BLOCK_SIZE_BYTES - blockOffset);
          const block = await loadBlock(blockIndex);
          yield block.subarray(blockOffset, blockOffset + sliceLen);
          offset += sliceLen;
        }
      })()
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.disposeController.signal.aborted) {
      this.disposeController.abort(
        this.signal.aborted ? getAbortError(this.signal) : new Error('Remote ZIP reader closed')
      );
    }
    this.blockCache.clear();
  }
}

const openEntryStream = (zipfile: ZipFile, entry: Entry): Promise<Readable> =>
  new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error('Failed to open ZIP entry read stream'));
        return;
      }
      resolve(stream);
    });
  });

/** 读取 ZIP 中以条目内容形式保存的符号链接目标。 */
const readZipSymlinkTarget = async (zipfile: ZipFile, entry: Entry): Promise<string> => {
  if (entry.uncompressedSize > ZIP_MAX_SYMLINK_TARGET_BYTES) {
    throw new Error('ZIP symlink target is too long');
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of await openEntryStream(zipfile, entry)) {
    bytes += chunk.length;
    if (bytes > ZIP_MAX_SYMLINK_TARGET_BYTES) {
      throw new Error('ZIP symlink target is too long');
    }
    chunks.push(chunk);
  }
  const target = Buffer.concat(chunks).toString('utf8');
  if (!target || target.includes('\0')) {
    throw new Error('ZIP symlink target is invalid');
  }
  return target;
};

/**
 * 基于 HTTP Range 随机读取远程 ZIP（如 S3 对象），逐条转换为可直接编码进 `.tar.zst` 的 `TarEntry`。
 *
 * - 只读尾块定位 Central Directory，被 `shouldSkip` 跳过或无需数据的条目不会下载载荷；
 * - 内容策略：路径经 `normalizeArchiveEntryPath` 规范化；UNIX 符号链接原样保留目标（加密条目由 `yauzl` 读取时拒绝）；
 *   FIFO/设备等特殊节点跳过；仅 UNIX 宿主的可执行位映射为 `0755`，其余文件为 `0644`；
 * - `maxEntries` / `maxUncompressedBytes` 按 Central Directory 声明值累计（`yauzl` 解压时校验实际字节与声明一致）；
 * - 无论成功、提前结束或抛错，都会中止挂起的 Range 请求并释放块缓存。
 */
export async function* iterateRemoteZipAsTarEntries({
  totalSize,
  readRange,
  signal,
  maxEntries = ZIP_DEFAULT_MAX_ENTRIES,
  maxUncompressedBytes = Number.POSITIVE_INFINITY,
  shouldSkip
}: {
  totalSize: number;
  readRange: ZipByteRangeReader;
  signal?: AbortSignal;
  maxEntries?: number;
  maxUncompressedBytes?: number;
  shouldSkip?: (path: string, meta: { isDirectory: boolean }) => boolean;
}): AsyncGenerator<TarEntry> {
  throwIfAborted(signal);
  if (!Number.isSafeInteger(totalSize) || totalSize <= 0) {
    throw new Error('Remote ZIP archive is empty or missing size');
  }

  const reader = new BlockCachedRangeReader({ totalSize, readRange, signal });
  let zipfile: ZipFile | undefined;
  let entryCount = 0;
  let totalBytes = 0;

  try {
    zipfile = await new Promise<ZipFile>((resolve, reject) => {
      fromRandomAccessReader(
        reader,
        totalSize,
        { lazyEntries: true, autoClose: false, decodeStrings: false },
        (error, opened) => {
          if (error || !opened) {
            reject(error ?? new Error('Failed to open remote ZIP via Range reader'));
            return;
          }
          resolve(opened);
        }
      );
    });

    // `lazyEntries: true` 下每次 `readEntry()` 最多触发一次 `entry` 或 `end`，只需记录异步 `error` 防止未捕获崩溃。
    let fatalError: Error | null = null;
    let pending: { resolve: (entry: Entry | null) => void; reject: (error: Error) => void } | null =
      null;

    zipfile.on('entry', (entry: Entry) => {
      const current = pending;
      pending = null;
      current?.resolve(entry);
    });
    zipfile.on('end', () => {
      const current = pending;
      pending = null;
      current?.resolve(null);
    });
    zipfile.on('error', (error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      fatalError = err;
      const current = pending;
      pending = null;
      current?.reject(err);
    });

    const readNextEntry = (): Promise<Entry | null> => {
      if (fatalError) return Promise.reject(fatalError);
      return new Promise<Entry | null>((resolve, reject) => {
        pending = { resolve, reject };
        zipfile!.readEntry();
      });
    };

    while (true) {
      const entry = await readNextEntry();
      if (!entry) break;
      throwIfAborted(signal);

      // 与 parseTarZstStream 对齐：每个 Central Directory 条目都在跳过过滤前计入上限，防止海量特殊条目 DoS。
      entryCount += 1;
      if (entryCount > maxEntries) {
        throw new Error(`ZIP archive exceeds maximum allowed entry count (${maxEntries})`);
      }

      const rawName = (entry.fileName as unknown as Buffer).toString('utf8');
      const hostOs = entry.versionMadeBy >>> 8;
      const unixMode = hostOs === 3 || hostOs === 19 ? entry.externalFileAttributes >>> 16 : 0;
      const fileType = unixMode & UNIX_FILE_TYPE_MASK;
      const isSymlink = fileType === UNIX_FILE_TYPE_SYMLINK;
      const isDirectory = !isSymlink && (/[\\/]$/.test(rawName) || fileType === UNIX_FILE_TYPE_DIR);
      if (!isSymlink && !isDirectory && fileType !== 0 && fileType !== UNIX_FILE_TYPE_REGULAR) {
        continue;
      }

      const path = normalizeArchiveEntryPath(rawName, isDirectory);
      if (!path || shouldSkip?.(path, { isDirectory })) continue;
      const mtime = entry.getLastModDate();

      if (isSymlink) {
        yield {
          path,
          type: 'symlink',
          mode: 0o777,
          mtime,
          linkname: await readZipSymlinkTarget(zipfile, entry)
        };
      } else if (isDirectory) {
        yield { path, type: 'directory', mode: 0o755, mtime };
      } else {
        totalBytes += entry.uncompressedSize;
        if (totalBytes > maxUncompressedBytes) {
          throw new Error(
            `ZIP archive uncompressed size exceeds maximum allowed bytes (${maxUncompressedBytes} bytes)`
          );
        }
        const currentZip = zipfile;
        yield {
          path,
          type: 'file',
          mode: unixMode & 0o111 ? 0o755 : 0o644,
          mtime,
          size: entry.uncompressedSize,
          content: () => openEntryStream(currentZip, entry)
        };
      }
    }
  } finally {
    if (zipfile?.isOpen) {
      try {
        zipfile.close();
      } catch {
        // 句柄可能已在异常分支关闭，忽略重复 close 报错。
      }
    }
    reader.dispose();
  }
}

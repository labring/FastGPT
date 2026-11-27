import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import JSZip from 'jszip';
import { iterateRemoteZipAsTarEntries, type ZipByteRangeReader } from '../../../common/file/zip';
import type { TarEntry } from '../../../common/file/tarZst';

const sliceReader =
  (zipBuf: Buffer, calls?: Array<{ start: number; end: number }>): ZipByteRangeReader =>
  async ({ start, end }) => {
    calls?.push({ start, end });
    return Readable.from([zipBuf.subarray(start, end + 1)]);
  };

const collect = async (
  zipBuf: Buffer,
  options: Partial<Parameters<typeof iterateRemoteZipAsTarEntries>[0]> = {}
) => {
  const entries: Array<Omit<TarEntry, 'content'> & { data?: Buffer }> = [];
  for await (const { content, ...entry } of iterateRemoteZipAsTarEntries({
    totalSize: zipBuf.length,
    readRange: sliceReader(zipBuf),
    ...options
  })) {
    entries.push({
      ...entry,
      ...(typeof content === 'function' ? { data: await buffer(await content()) } : {})
    });
  }
  return entries;
};

describe('iterateRemoteZipAsTarEntries content policy', () => {
  it('maps files, directories, exec bits and verbatim symlinks; skips special nodes', async () => {
    const zip = new JSZip();
    zip.folder('skills');
    zip.file('skills/run.sh', '#!/bin/sh', { unixPermissions: 0o100755 });
    zip.file('skills/readme.md', 'hello', { unixPermissions: 0o100644 });
    zip.file('skills/link', '../shared/lib', { unixPermissions: 0o120777 });
    zip.file('skills/pipe', '', { unixPermissions: 0o010644 });
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });

    const entries = await collect(zipBuf);
    expect(entries.map(({ path, type, mode }) => [path, type, mode])).toEqual([
      ['skills/', 'directory', 0o755],
      ['skills/run.sh', 'file', 0o755],
      ['skills/readme.md', 'file', 0o644],
      ['skills/link', 'symlink', 0o777]
    ]);
    expect(entries[1].data?.toString()).toBe('#!/bin/sh');
    expect(entries[3].linkname).toBe('../shared/lib');
  });

  it('ignores unix mode bits from non-unix hosts', async () => {
    const zip = new JSZip();
    zip.file('a.txt', 'a', { dosPermissions: 0x20 });
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', platform: 'DOS' });

    expect(await collect(zipBuf)).toMatchObject([{ path: 'a.txt', type: 'file', mode: 0o644 }]);
  });

  it('rejects traversal and enforces entry/size limits', async () => {
    const traversal = new JSZip();
    traversal.file('../evil.txt', 'x');
    await expect(collect(await traversal.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow(
      /traversal/
    );

    const plain = new JSZip();
    plain.file('a.txt', '0123456789');
    plain.file('b.txt', '0123456789');
    const plainBuf = await plain.generateAsync({ type: 'nodebuffer' });
    await expect(collect(plainBuf, { maxEntries: 1 })).rejects.toThrow(/entry count/);
    await expect(collect(plainBuf, { maxUncompressedBytes: 15 })).rejects.toThrow(
      /uncompressed size/
    );
    // 即使全部条目被 shouldSkip 过滤，仍须计入 maxEntries 防护海量条目 DoS。
    await expect(collect(plainBuf, { maxEntries: 1, shouldSkip: () => true })).rejects.toThrow(
      /entry count/
    );
    expect(await collect(plainBuf, { shouldSkip: (path) => path === 'a.txt' })).toMatchObject([
      { path: 'b.txt' }
    ]);
  });

  it('relies on yauzl to refuse reading encrypted entries', async () => {
    const zip = new JSZip();
    zip.file('a.txt', 'secret'.repeat(100), { compression: 'DEFLATE' });
    const encrypted = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
    // 在 Central Directory 中置位通用标志位 bit0（加密）。
    const cdOffset = encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    encrypted.writeUInt16LE(encrypted.readUInt16LE(cdOffset + 8) | 1, cdOffset + 8);
    await expect(collect(encrypted)).rejects.toThrow(/encrypted/i);
  });
});

describe('iterateRemoteZipAsTarEntries range reads', () => {
  it('coalesces small reads into one cached block and never downloads skipped payloads', async () => {
    const zip = new JSZip();
    zip.file('kept/a.txt', 'alpha');
    zip.file('skipped/huge.bin', Buffer.alloc(64 * 1024, 0x61), { compression: 'STORE' });
    zip.file('kept/b.txt', 'bravo');
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });

    const calls: Array<{ start: number; end: number }> = [];
    const entries = [];
    for await (const { content, path } of iterateRemoteZipAsTarEntries({
      totalSize: zipBuf.length,
      readRange: sliceReader(zipBuf, calls),
      shouldSkip: (entryPath) => entryPath.startsWith('skipped/')
    })) {
      if (typeof content === 'function')
        entries.push([path, (await buffer(await content())).toString()]);
    }

    expect(entries).toEqual([
      ['kept/a.txt', 'alpha'],
      ['kept/b.txt', 'bravo']
    ]);
    expect(calls).toEqual([{ start: 0, end: zipBuf.length - 1 }]);
  });

  it('streams entries larger than the cache threshold through an exact range request', async () => {
    const payload = Buffer.alloc(2.5 * 1024 * 1024);
    for (let i = 0; i < payload.length; i += 4) {
      payload.writeUInt32LE((i * 2654435761) >>> 0, i);
    }
    const zip = new JSZip();
    zip.file('big.bin', payload, { compression: 'STORE' });
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });

    const calls: Array<{ start: number; end: number }> = [];
    const entries = await collect(zipBuf, { readRange: sliceReader(zipBuf, calls) });
    expect(entries[0].data).toEqual(payload);
    expect(calls.some((call) => call.end - call.start + 1 > 2 * 1024 * 1024)).toBe(true);
  });

  it('aborts in-flight direct range reads when the consumer stops early', async () => {
    const zip = new JSZip();
    zip.file('big.bin', Buffer.alloc(2.5 * 1024 * 1024, 0x7a), { compression: 'STORE' });
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });

    let capturedSignal: AbortSignal | undefined;
    let sourceDestroyed = false;
    const readRange: ZipByteRangeReader = async ({ start, end, signal }) => {
      if (end - start + 1 <= 2 * 1024 * 1024)
        return Readable.from([zipBuf.subarray(start, end + 1)]);
      capturedSignal = signal;
      let offset = start;
      return new Readable({
        read() {
          if (offset > end) return void this.push(null);
          const nextEnd = Math.min(end + 1, offset + 64 * 1024);
          this.push(zipBuf.subarray(offset, nextEnd));
          offset = nextEnd;
        },
        destroy(_error, callback) {
          sourceDestroyed = true;
          callback(null);
        }
      });
    };

    for await (const { content } of iterateRemoteZipAsTarEntries({
      totalSize: zipBuf.length,
      readRange
    })) {
      if (typeof content !== 'function') continue;
      for await (const _chunk of await content()) break;
    }
    expect(capturedSignal?.aborted).toBe(true);
    expect(sourceDestroyed).toBe(true);
  });

  it('aborts pending direct range reads immediately when destroyed while awaiting response headers', async () => {
    const zip = new JSZip();
    zip.file('big.bin', Buffer.alloc(2.5 * 1024 * 1024, 0x7a), { compression: 'STORE' });
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });

    let capturedSignal: AbortSignal | undefined;
    let markHeadersPending!: () => void;
    const headersPending = new Promise<void>((resolve) => {
      markHeadersPending = resolve;
    });

    const readRange: ZipByteRangeReader = async ({ start, end, signal }) => {
      if (end - start + 1 <= 2 * 1024 * 1024) {
        return Readable.from([zipBuf.subarray(start, end + 1)]);
      }
      capturedSignal = signal;
      markHeadersPending();
      return await new Promise<Readable>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    };

    for await (const { content } of iterateRemoteZipAsTarEntries({
      totalSize: zipBuf.length,
      readRange
    })) {
      if (typeof content !== 'function') continue;
      const entryStream = await content();
      const errors: Error[] = [];
      entryStream.on('error', (err) => errors.push(err));
      const closed = new Promise<void>((resolve) => entryStream.once('close', resolve));

      entryStream.resume();
      await headersPending;

      entryStream.destroy();
      expect(capturedSignal?.aborted).toBe(true);
      await closed;
      expect(errors).toEqual([]);
      break;
    }
  });

  it('aborts and destroys a stalled direct range response body immediately on stream error destroy', async () => {
    const zip = new JSZip();
    zip.file('big.bin', Buffer.alloc(2.5 * 1024 * 1024, 0x7a), { compression: 'STORE' });
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });

    let capturedSignal: AbortSignal | undefined;
    let sourceDestroyed = false;
    let markBodyStalled!: () => void;
    const bodyStalled = new Promise<void>((resolve) => {
      markBodyStalled = resolve;
    });

    const readRange: ZipByteRangeReader = async ({ start, end, signal }) => {
      if (end - start + 1 <= 2 * 1024 * 1024) {
        return Readable.from([zipBuf.subarray(start, end + 1)]);
      }
      capturedSignal = signal;
      return new Readable({
        read() {
          // 拿到响应头后一直挂起不推数据，模拟对象存储慢响应/卡住。
          markBodyStalled();
        },
        destroy(_error, callback) {
          sourceDestroyed = true;
          callback(null);
        }
      });
    };

    for await (const { content } of iterateRemoteZipAsTarEntries({
      totalSize: zipBuf.length,
      readRange
    })) {
      if (typeof content !== 'function') continue;
      const entryStream = await content();
      const errors: Error[] = [];
      entryStream.on('error', (err) => errors.push(err));
      const closed = new Promise<void>((resolve) => entryStream.once('close', resolve));

      entryStream.resume();
      await bodyStalled;

      const cancelError = new Error('downstream transcode failed');
      entryStream.destroy(cancelError);
      expect(capturedSignal?.aborted).toBe(true);
      expect(sourceDestroyed).toBe(true);
      await closed;
      expect(errors).toEqual([cancelError]);
      break;
    }
  });

  it('rejects empty sizes, truncated responses, aborted signals and corrupted directories', async () => {
    const zip = new JSZip();
    zip.file('a.txt', 'hello');
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });

    await expect(collect(Buffer.alloc(0))).rejects.toThrow(/empty or missing size/);
    await expect(
      collect(zipBuf, { readRange: async () => Readable.from([Buffer.from('short')]) })
    ).rejects.toThrow(/Unexpected EOF/);

    const controller = new AbortController();
    controller.abort(new Error('range aborted'));
    await expect(collect(zipBuf, { signal: controller.signal })).rejects.toThrow(/range aborted/);

    // 篡改 EOCD 中的 Central Directory 偏移，yauzl 需在发出越界 Range 之前拒绝。
    const corrupted = Buffer.from(zipBuf);
    const eocdOffset = corrupted.length - 22;
    corrupted.writeUInt32LE(corrupted.length + 1024 * 1024, eocdOffset + 16);
    const calls: Array<{ start: number; end: number }> = [];
    await expect(
      collect(corrupted, { readRange: sliceReader(corrupted, calls) })
    ).rejects.toThrow();
    expect(calls.every((call) => call.end < corrupted.length)).toBe(true);
  });
});

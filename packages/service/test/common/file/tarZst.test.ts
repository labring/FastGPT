import { describe, expect, it } from 'vitest';
import { Readable, Transform } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import zlib from 'node:zlib';
import * as tar from 'tar-stream';
import {
  ArchiveTooLargeError,
  compressZstd,
  createTarZstStream,
  InvalidArchiveEntryPathError,
  normalizeArchiveEntryPath,
  parseTarZstStream
} from '@fastgpt/service/common/file/tarZst';
import { createSizeLimitedStream } from '@fastgpt/service/common/file/stream';
import { readTarZstEntries } from '@test/utils/tarZst';

/** 用 tar-stream 构造任意（含非法/特殊类型）header 的原始 `.tar.zst`。 */
const rawTarZst = async (
  entries: Array<{ header: Parameters<tar.Pack['entry']>[0]; body?: Buffer }>
): Promise<Buffer> => {
  const pack = tar.pack();
  for (const { header, body } of entries) {
    if (body) pack.entry(header, body);
    else pack.entry(header);
  }
  pack.finalize();
  return zlib.zstdCompressSync(await buffer(Readable.from(pack)));
};

describe('normalizeArchiveEntryPath', () => {
  it('normalizes separators, dot segments and directory suffix', () => {
    expect(normalizeArchiveEntryPath('./a//b/./c.txt', false)).toBe('a/b/c.txt');
    expect(normalizeArchiveEntryPath('win\\dir\\file.txt', false)).toBe('win/dir/file.txt');
    expect(normalizeArchiveEntryPath('skills', true)).toBe('skills/');
    expect(normalizeArchiveEntryPath('skills///', true)).toBe('skills/');
    expect(normalizeArchiveEntryPath('./', true)).toBeNull();
    expect(normalizeArchiveEntryPath('.', true)).toBeNull();
  });

  it('rejects absolute paths, drive letters, traversal and ASCII control characters while allowing spaces', () => {
    expect(normalizeArchiveEntryPath('skills/my skill/SKILL.md', false)).toBe(
      'skills/my skill/SKILL.md'
    );
    expect(() => normalizeArchiveEntryPath('/etc/passwd', false)).toThrow(
      InvalidArchiveEntryPathError
    );
    expect(() => normalizeArchiveEntryPath('\\\\server\\share', false)).toThrow(
      InvalidArchiveEntryPathError
    );
    expect(() => normalizeArchiveEntryPath('C:/Windows', false)).toThrow(
      InvalidArchiveEntryPathError
    );
    expect(() => normalizeArchiveEntryPath('a/../../b', false)).toThrow(
      InvalidArchiveEntryPathError
    );
    for (const badPath of ['a\0b', 'a\nb', 'a\rb', 'a\tb', 'a\x7fb']) {
      expect(() => normalizeArchiveEntryPath(badPath, false)).toThrow(InvalidArchiveEntryPathError);
    }
  });
});

describe('createTarZstStream / parseTarZstStream', () => {
  it('round-trips directories, PAX UTF-8 paths, empty/streamed files and verbatim symlinks', async () => {
    const longPath = `skills/${'nested-segment-'.repeat(10)}中文路径/SKILL.md`;
    const mtime = new Date(1_700_000_000_000);
    const archive = await buffer(
      createTarZstStream([
        { path: 'skills/', type: 'directory', mode: 0o755, mtime },
        { path: longPath, type: 'file', mode: 0o644, content: Buffer.from('# 中文 Skill') },
        { path: 'skills/empty.txt', type: 'file', mode: 0o644 },
        {
          path: 'skills/run.sh',
          type: 'file',
          mode: 0o755,
          size: 9,
          content: async () => Readable.from([Buffer.from('#!/bin/'), Buffer.from('sh')])
        },
        { path: 'skills/link', type: 'symlink', mode: 0o777, linkname: '../outside/target' },
        { path: 'python', type: 'symlink', mode: 0o777, linkname: '/usr/bin/python3' }
      ])
    );

    const entries = await readTarZstEntries(archive);
    expect(entries.map(({ path, type }) => [path, type])).toEqual([
      ['skills/', 'directory'],
      [longPath, 'file'],
      ['skills/empty.txt', 'file'],
      ['skills/run.sh', 'file'],
      ['skills/link', 'symlink'],
      ['python', 'symlink']
    ]);
    expect(entries[0].mtime.getTime()).toBe(mtime.getTime());
    expect(entries[1].content.toString('utf8')).toBe('# 中文 Skill');
    expect(entries[2].content.length).toBe(0);
    expect(entries[3]).toMatchObject({ mode: 0o755, size: 9 });
    expect(entries[3].content.toString()).toBe('#!/bin/sh');
    expect(entries[4].linkname).toBe('../outside/target');
    expect(entries[5].linkname).toBe('/usr/bin/python3');
  });

  it('auto-drains entries that onEntry does not consume', async () => {
    const archive = await buffer(
      createTarZstStream([
        { path: 'big.bin', type: 'file', mode: 0o644, content: Buffer.alloc(2 * 1024 * 1024, 7) },
        { path: 'SKILL.md', type: 'file', mode: 0o644, content: Buffer.from('name: a') }
      ])
    );

    const contents: string[] = [];
    await parseTarZstStream({
      stream: Readable.from([archive]),
      onEntry: async (entry) => {
        if (entry.path !== 'SKILL.md') return;
        for await (const chunk of entry.stream) contents.push(chunk.toString('utf8'));
      }
    });
    expect(contents).toEqual(['name: a']);
  });

  it('skips unsupported entry types and root placeholders but counts every header', async () => {
    const archive = await rawTarZst([
      { header: { name: './', type: 'directory' } },
      { header: { name: 'a.txt', type: 'file', size: 1 }, body: Buffer.from('a') },
      { header: { name: 'hard.txt', type: 'link', linkname: 'a.txt' } },
      { header: { name: 'pipe', type: 'fifo' } },
      { header: { name: 'tty', type: 'character-device' } }
    ]);

    const entries = await readTarZstEntries(archive);
    expect(entries.map((entry) => entry.path)).toEqual(['a.txt']);
    await expect(readTarZstEntries(archive, { maxEntries: 4 })).rejects.toThrow(
      /maximum allowed entry count/
    );
  });

  it('enforces total size limits and rejects traversal paths or invalid zstd', async () => {
    const archive = await buffer(
      createTarZstStream([
        { path: 'a.bin', type: 'file', mode: 0o644, content: Buffer.alloc(10) },
        { path: 'b.bin', type: 'file', mode: 0o644, content: Buffer.alloc(10) }
      ])
    );
    await expect(readTarZstEntries(archive, { maxTotalBytes: 15 })).rejects.toBeInstanceOf(
      ArchiveTooLargeError
    );

    const traversal = await rawTarZst([
      { header: { name: '../evil.txt', type: 'file', size: 1 }, body: Buffer.from('x') }
    ]);
    await expect(readTarZstEntries(traversal)).rejects.toThrow(/traversal/);

    await expect(readTarZstEntries(Buffer.from('not zstd'))).rejects.toThrow();
  });

  it('fails the encoded stream when streamed content does not match the declared size', async () => {
    const stream = createTarZstStream([
      {
        path: 'short.bin',
        type: 'file',
        mode: 0o644,
        size: 10,
        content: async () => Readable.from([Buffer.from('abc')])
      }
    ]);
    await expect(buffer(stream)).rejects.toThrow(/Size mismatch/);
  });
});

describe('compressZstd', () => {
  it('propagates transform errors to the compressed output stream', async () => {
    const failing = new Transform({
      transform(_chunk, _encoding, callback) {
        callback(new Error('verifier failed'));
      }
    });
    await expect(buffer(compressZstd(Readable.from([Buffer.from('x')]), failing))).rejects.toThrow(
      'verifier failed'
    );
  });

  it('handles pre-consumption errors and early destruction in createTarZstStream and createSizeLimitedStream without uncaughtException', async () => {
    const uncaughtErrors: unknown[] = [];
    const onUncaught = (error: unknown) => uncaughtErrors.push(error);
    process.on('uncaughtException', onUncaught);

    try {
      const delayedTarStream = createTarZstStream(
        (async function* () {
          throw new Error('early-producer-failure');
        })()
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      await expect(buffer(delayedTarStream)).rejects.toThrow('early-producer-failure');

      let sourceDestroyed = false;
      const source = new Readable({
        read() {},
        destroy(_err, cb) {
          sourceDestroyed = true;
          cb(null);
        }
      });
      const limited = createSizeLimitedStream({
        stream: source,
        maxBytes: 16,
        createExceededError: (bytes) => new Error(`exceeded:${bytes}`)
      });
      limited.destroy();
      expect(sourceDestroyed).toBe(true);

      const erroredSource = new Readable({
        read() {
          this.destroy(new Error('source-errored-before-read'));
        }
      });
      const limitedErrored = createSizeLimitedStream({
        stream: erroredSource,
        maxBytes: 16,
        createExceededError: (bytes) => new Error(`exceeded:${bytes}`)
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await expect(buffer(limitedErrored)).rejects.toThrow('source-errored-before-read');

      const closedSource = new Readable({ read() {} });
      const limitedClosed = createSizeLimitedStream({
        stream: closedSource,
        maxBytes: 16,
        createExceededError: (bytes) => new Error(`exceeded:${bytes}`)
      });
      const closedPromise = expect(buffer(limitedClosed)).rejects.toThrow();
      closedSource.destroy();
      await closedPromise;

      expect(uncaughtErrors).toEqual([]);
    } finally {
      process.off('uncaughtException', onUncaught);
    }
  });

  it('captures pipeline rejection without unhandledRejection when source fails while async onEntry is pending', async () => {
    const archive = await buffer(
      createTarZstStream([
        { path: 'first.txt', type: 'file', mode: 0o644, content: Buffer.from('hello') },
        { path: 'second.txt', type: 'file', mode: 0o644, content: Buffer.from('world') }
      ])
    );
    const source = new Readable({
      read() {}
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);

    let finishEntry!: () => void;
    let resolveEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      resolveEntered = resolve;
    });
    const parsePromise = parseTarZstStream({
      stream: source,
      onEntry: async () => {
        resolveEntered();
        await new Promise<void>((done) => {
          finishEntry = done;
        });
      }
    });

    source.push(archive);
    try {
      await entered;
      source.destroy(new Error('mid-entry-source-failure'));
      await new Promise((r) => setTimeout(r, 20));
      finishEntry();
      await expect(parsePromise).rejects.toThrow('mid-entry-source-failure');
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

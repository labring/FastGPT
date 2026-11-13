import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { FileInfo } from '@alibaba-group/opensandbox';
import {
  isSandboxPathDirectory,
  readSandboxSessionDirectoryArchive,
  prepareSandboxFileParentDirectories,
  writeUrlFilesToSandbox,
  computeSandboxFileEtag,
  resolveSandboxFilePath,
  listSandboxSessionDirectory,
  readSandboxSessionFile,
  writeSandboxSessionFile,
  createSandboxSessionDirectory,
  moveSandboxSessionEntry,
  deleteSandboxSessionEntry,
  SandboxFileConflictError,
  SandboxFileNotFoundError
} from '@fastgpt/service/core/ai/sandbox/application/file';
import { resolveSandboxRuntimePath } from '@fastgpt/service/core/ai/sandbox/utils';
import type { SandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';

const axiosMock = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/api/axios')>();
  return {
    ...mod,
    axios: axiosMock
  };
});

const sessionWorkDirectory = '/workspace/sessions/chat-1';
const resolveSessionPath = (path: string) =>
  resolveSandboxRuntimePath(
    path,
    { sessionWorkDirectory },
    {
      allowAbsolutePath: true
    }
  );

function makeSandbox(
  opensandboxOverrides: Partial<SandboxClient['opensandbox']> = {},
  runtimeDirectory = sessionWorkDirectory
): SandboxClient {
  return {
    opensandbox: opensandboxOverrides,
    getRuntimePaths: vi.fn(() => ({
      workspaceRoot: '/workspace',
      runtimeSkillsRoot: '/workspace/projects',
      sessionWorkDirectory: runtimeDirectory
    })),
    resolveRuntimePath: vi.fn((path?: string, options?: { allowAbsolutePath?: boolean }) =>
      resolveSandboxRuntimePath(
        path,
        { sessionWorkDirectory: runtimeDirectory },
        {
          allowAbsolutePath: options?.allowAbsolutePath ?? true
        }
      )
    )
  } as unknown as SandboxClient;
}

function makeDirectoryEntry(
  name: string,
  opts: {
    type?: 'file' | 'directory' | 'symlink';
    path?: string;
    size?: number;
    modifiedAt?: Date;
  } = {}
): FileInfo {
  return {
    path: opts.path ?? `/workspace/${name}`,
    type: opts.type ?? 'file',
    ...(opts.size !== undefined ? { size: opts.size } : {}),
    ...(opts.modifiedAt !== undefined ? { modifiedAt: opts.modifiedAt } : {})
  };
}

function makeFileInfoMap(path: string, info: Partial<FileInfo>): Map<string, FileInfo> {
  return new Map([[path, { path, ...info }]]);
}

describe('writeUrlFilesToSandbox', () => {
  beforeEach(() => {
    axiosMock.get.mockReset();
  });

  it('skips entries without a target path', async () => {
    const sandbox = {
      createDirectories: vi.fn(),
      writeFiles: vi.fn()
    } as unknown as Parameters<typeof writeUrlFilesToSandbox>[0]['sandbox'];

    await writeUrlFilesToSandbox({
      sandbox,
      files: [{ path: '', url: 'https://example.com/ignored.txt' }]
    });

    expect(axiosMock.get).not.toHaveBeenCalled();
    expect(sandbox.createDirectories).not.toHaveBeenCalled();
    expect(sandbox.writeFiles).not.toHaveBeenCalled();
  });

  it('downloads url files and writes them to sandbox', async () => {
    const first = Buffer.from('a');
    const second = Buffer.from('bc');
    axiosMock.get
      .mockResolvedValueOnce({ data: Readable.from([first]), headers: {} })
      .mockResolvedValueOnce({ data: Readable.from([second]), headers: {} });
    const sandbox = {
      createDirectories: vi.fn(async () => undefined),
      writeFiles: vi.fn(async () => undefined)
    } as unknown as Parameters<typeof writeUrlFilesToSandbox>[0]['sandbox'];

    await writeUrlFilesToSandbox({
      sandbox,
      files: [
        { path: '/workspace/a.txt', url: 'https://example.com/a.txt' },
        { path: '/workspace/reports/b.txt', url: 'https://example.com/b.txt' }
      ]
    });

    expect(axiosMock.get).toHaveBeenCalledWith(
      'https://example.com/a.txt',
      expect.objectContaining({ responseType: 'stream' })
    );
    expect(axiosMock.get).toHaveBeenCalledWith(
      'https://example.com/b.txt',
      expect.objectContaining({ responseType: 'stream' })
    );
    expect(sandbox.createDirectories).toHaveBeenCalledWith(['/workspace', '/workspace/reports']);
    expect(sandbox.writeFiles).toHaveBeenCalledWith([
      { path: '/workspace/a.txt', data: first },
      { path: '/workspace/reports/b.txt', data: second }
    ]);
    expect(
      (sandbox.createDirectories as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    ).toBeLessThan((sandbox.writeFiles as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
  });

  it('uses the injected reader for workflow context files', async () => {
    const sandbox = {
      createDirectories: vi.fn(async () => undefined),
      writeFiles: vi.fn(async () => undefined)
    };
    const readInputFile = vi.fn().mockResolvedValue(Buffer.from('private'));

    await writeUrlFilesToSandbox({
      sandbox: sandbox as any,
      files: [{ path: '/workspace/private.pdf', url: 'https://files.example.com/signed' }],
      readInputFile
    });

    expect(readInputFile).toHaveBeenCalledWith('https://files.example.com/signed');
    expect(axiosMock.get).not.toHaveBeenCalled();
    expect(sandbox.writeFiles).toHaveBeenCalledWith([
      { path: '/workspace/private.pdf', data: Buffer.from('private') }
    ]);
  });

  it('rejects relative input URLs instead of calling an internal axios', async () => {
    const sandbox = { writeFiles: vi.fn() };

    await expect(
      writeUrlFilesToSandbox({
        sandbox: sandbox as any,
        files: [{ path: '/workspace/a.txt', url: '/api/system/file/d/token' }]
      })
    ).rejects.toThrow('absolute HTTP(S)');
    expect(axiosMock.get).not.toHaveBeenCalled();
  });

  it('propagates writeFiles errors', async () => {
    const sandbox = {
      createDirectories: vi.fn(async () => undefined),
      writeFiles: vi.fn(async () => {
        throw new Error('ENOSPC');
      })
    };
    const readInputFile = vi.fn().mockResolvedValue(Buffer.from('data'));

    await expect(
      writeUrlFilesToSandbox({
        sandbox: sandbox as any,
        files: [{ path: '/workspace/a.txt', url: 'https://files.example.com/a.txt' }],
        readInputFile
      })
    ).rejects.toThrow('ENOSPC');
  });
});

describe('prepareSandboxFileParentDirectories', () => {
  it('skips paths without a writable parent directory', async () => {
    const sandbox = { createDirectories: vi.fn() };

    await prepareSandboxFileParentDirectories(sandbox as any, ['', 'file.txt', '/root.txt']);

    expect(sandbox.createDirectories).not.toHaveBeenCalled();
  });
});

describe('isSandboxPathDirectory', () => {
  it.each([
    { path: 'src', type: 'directory' as const, expected: true },
    { path: 'main.py', type: 'file' as const, expected: false }
  ])('判断 $path 目录属性', async ({ path, type, expected }) => {
    const providerPath = resolveSessionPath(path);
    const getFileInfo = vi.fn().mockResolvedValue(makeFileInfoMap(providerPath, { type }));
    const sandbox = makeSandbox({
      getFileInfo
    });

    expect(await isSandboxPathDirectory(sandbox, path)).toBe(expected);
    expect(getFileInfo).toHaveBeenCalledWith([providerPath]);
  });

  it('fileInfo 不存在时返回 false', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(new Map())
    });

    expect(await isSandboxPathDirectory(sandbox, '.')).toBe(false);
    expect(await isSandboxPathDirectory(sandbox, 'workspace/')).toBe(false);
    expect(await isSandboxPathDirectory(sandbox, 'main.py')).toBe(false);
  });
});

describe('readSandboxSessionDirectoryArchive', () => {
  it('zips directory inside container excluding .fastgpt at workspace root and cleans up temp zip', async () => {
    const execute = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const getFileInfo = vi.fn(async ([zipPath]: string[]) =>
      makeFileInfoMap(zipPath, { type: 'file', size: 128 })
    );
    const readFileStream = vi.fn(() => Readable.from([Buffer.from('zip-bytes')]));
    const deleteFiles = vi.fn().mockResolvedValue(undefined);
    const sandbox = makeSandbox(
      { execute, getFileInfo, readFileStream, deleteFiles },
      '/workspace'
    );

    const result = await readSandboxSessionDirectoryArchive(sandbox, '/workspace');

    expect(execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /^zip -r -y -q '\/tmp\/fastgpt-download-[^']+\.zip' \. -x '\.fastgpt' '\.fastgpt\/\*'$/
      ),
      { workingDirectory: '/workspace' }
    );
    expect(result.size).toBe(128);
    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString()).toBe('zip-bytes');
    await result.cleanup();
    expect(deleteFiles).toHaveBeenCalledWith([expect.stringMatching(/^\/tmp\/fastgpt-download-/)]);
  });

  it('returns standard empty zip buffer when zip exits with code 12', async () => {
    const execute = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 12 });
    const deleteFiles = vi.fn().mockResolvedValue(undefined);
    const sandbox = makeSandbox({ execute, deleteFiles });

    const result = await readSandboxSessionDirectoryArchive(sandbox, '.');
    expect(result.size).toBe(22);
    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).subarray(0, 4).toString('hex')).toBe('504b0506');
    expect(deleteFiles).toHaveBeenCalledOnce();
  });
});

describe('IDE session filesystem helpers (depth=1 lazy list & optimistic lock)', () => {
  it('enforces depth=1 on listSandboxSessionDirectory and rejects path traversal', async () => {
    const createDirectories = vi.fn().mockResolvedValue(undefined);
    const listDirectory = vi.fn().mockResolvedValue([
      makeDirectoryEntry('src', { path: `${sessionWorkDirectory}/src`, type: 'directory' }),
      makeDirectoryEntry('index.ts', {
        path: `${sessionWorkDirectory}/index.ts`,
        type: 'file',
        size: 42,
        modifiedAt: new Date(1700000000000)
      })
    ]);
    const sandbox = makeSandbox({ createDirectories, listDirectory });

    const entries = await listSandboxSessionDirectory(sandbox, '.');
    expect(createDirectories).toHaveBeenCalledWith([sessionWorkDirectory]);
    expect(listDirectory).toHaveBeenCalledWith(sessionWorkDirectory, { depth: 1 });
    expect(entries).toEqual([
      { name: 'src', path: 'src', type: 'directory' },
      { name: 'index.ts', path: 'index.ts', type: 'file', size: 42, mtime: 1700000000000 }
    ]);

    expect(() => resolveSandboxFilePath(sandbox, '../other-chat')).toThrow();
    expect(resolveSandboxFilePath(sandbox, 'src/index.ts')).toBe(
      `${sessionWorkDirectory}/src/index.ts`
    );
  });

  it('accepts absolute paths outside the workspace for authenticated file APIs', () => {
    const sandbox = makeSandbox();
    expect(resolveSandboxFilePath(sandbox, ' ')).toBe(sessionWorkDirectory);
    expect(resolveSandboxFilePath(sandbox, '/home/sandbox/notes.md')).toBe(
      '/home/sandbox/notes.md'
    );
  });

  it.each([
    sessionWorkDirectory,
    '/workspace/sessions//chat-1',
    '/workspace/sessions/chat-1/.',
    '/workspace',
    '/workspace/.',
    '/workspace/.fastgpt',
    '/workspace/.fastgpt/runtime/state.json',
    '/',
    '.',
    './.'
  ])('refuses to delete, move onto, or create the protected path %s', async (target) => {
    const deleteDirectories = vi.fn();
    const moveFiles = vi.fn();
    const createDirectories = vi.fn();
    const writeFiles = vi.fn();
    const sandbox = makeSandbox({ deleteDirectories, moveFiles, createDirectories, writeFiles });

    await expect(deleteSandboxSessionEntry(sandbox, target)).rejects.toThrow('root directory');
    await expect(moveSandboxSessionEntry(sandbox, { from: target, to: 'x' })).rejects.toThrow(
      'root directory'
    );
    await expect(moveSandboxSessionEntry(sandbox, { from: 'x', to: target })).rejects.toThrow(
      'root directory'
    );
    await expect(createSandboxSessionDirectory(sandbox, target)).rejects.toThrow(
      'Invalid sandbox directory path'
    );
    await expect(
      writeSandboxSessionFile(sandbox, {
        path: target,
        stream: Readable.from([Buffer.from('blocked')]),
        maxFileBytes: 1024
      })
    ).rejects.toThrow('Invalid sandbox file path');
    expect(deleteDirectories).not.toHaveBeenCalled();
    expect(moveFiles).not.toHaveBeenCalled();
    expect(createDirectories).not.toHaveBeenCalled();
    expect(writeFiles).not.toHaveBeenCalled();
  });

  it('deletes a symlink without recursing into its target', async () => {
    const linkPath = `${sessionWorkDirectory}/link`;
    const deleteDirectories = vi.fn();
    const deleteFiles = vi.fn().mockResolvedValue(undefined);
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(makeFileInfoMap(linkPath, { type: 'symlink' })),
      deleteDirectories,
      deleteFiles
    });

    await deleteSandboxSessionEntry(sandbox, 'link');
    expect(deleteFiles).toHaveBeenCalledWith([linkPath]);
    expect(deleteDirectories).not.toHaveBeenCalled();
  });

  it('falls back to non-recursive rm -f when execd deleteFiles reports path is a directory on a symlink-to-directory', async () => {
    const linkPath = `${sessionWorkDirectory}/link`;
    const deleteDirectories = vi.fn();
    const deleteFiles = vi
      .fn()
      .mockRejectedValue(new Error('INVALID_ARGUMENT: path is a directory'));
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0, truncated: false })
      .mockResolvedValueOnce({
        stdout: '',
        stderr: "rm: cannot remove '/workspace/sessions/chat-1/link': Is a directory\n",
        exitCode: 1,
        truncated: false
      });
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(makeFileInfoMap(linkPath, { type: 'symlink' })),
      deleteDirectories,
      deleteFiles,
      execute
    });

    await deleteSandboxSessionEntry(sandbox, 'link/');
    expect(deleteFiles).toHaveBeenCalledWith([linkPath]);
    expect(deleteDirectories).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(`rm -f -- '${linkPath}'`);

    await expect(deleteSandboxSessionEntry(sandbox, 'link')).rejects.toThrow(/Is a directory/i);
  });

  it('returns etag on readSandboxSessionFile and rejects stale oldEtag on writeSandboxSessionFile', async () => {
    const targetPath = `${sessionWorkDirectory}/hello.txt`;
    const initialInfo: FileInfo = {
      path: targetPath,
      type: 'file',
      size: 5,
      modifiedAt: new Date(1700000001000)
    };
    const getFileInfo = vi.fn().mockResolvedValue(new Map([[targetPath, initialInfo]]));
    const readFileStream = vi.fn(() => Readable.from([Buffer.from('hello')]));
    const writeFiles = vi.fn();
    const sandbox = makeSandbox({ getFileInfo, readFileStream, writeFiles });

    const readRes = await readSandboxSessionFile(sandbox, 'hello.txt');
    const chunks: Uint8Array[] = [];
    for await (const chunk of readRes.stream) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString('utf8')).toBe('hello');
    expect(readRes.etag).toBe(computeSandboxFileEtag(initialInfo));
    expect(readFileStream).toHaveBeenCalledWith(targetPath);
    await expect(
      writeSandboxSessionFile(sandbox, {
        path: 'hello.txt',
        stream: Readable.from([Buffer.from('overwrite')]),
        oldEtag: 'W/"0-0"',
        maxFileBytes: 1024
      })
    ).rejects.toBeInstanceOf(SandboxFileConflictError);
    expect(writeFiles).not.toHaveBeenCalled();
  });

  it('writes directly to target file, preserves mode, and enforces maxFileBytes', async () => {
    const targetPath = `${sessionWorkDirectory}/hello.txt`;
    const initialInfo: FileInfo = {
      path: targetPath,
      type: 'file',
      size: 5,
      mode: 0o755,
      modifiedAt: new Date(1700000001000)
    };
    let writtenBytes = Buffer.alloc(0);
    let hasWritten = false;
    const getFileInfo = vi.fn(async (paths: string[]) => {
      const map = new Map<string, FileInfo>();
      for (const path of paths) {
        if (path === targetPath) {
          map.set(
            path,
            hasWritten
              ? {
                  path,
                  type: 'file',
                  size: writtenBytes.length,
                  mode: 0o755,
                  modifiedAt: new Date(1700000002000)
                }
              : initialInfo
          );
        }
      }
      return map;
    });
    const writeFiles = vi.fn(async ([entry]) => {
      const chunks: Buffer[] = [];
      const reader = (entry.data as ReadableStream<Uint8Array>).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }
      writtenBytes = Buffer.concat(chunks);
      hasWritten = true;
    });
    const createDirectories = vi.fn().mockResolvedValue(undefined);
    const sandbox = makeSandbox({
      getFileInfo,
      writeFiles,
      createDirectories
    });

    const writeRes = await writeSandboxSessionFile(sandbox, {
      path: 'hello.txt',
      stream: Readable.from([Buffer.from('world!')]),
      oldEtag: computeSandboxFileEtag(initialInfo),
      maxFileBytes: 1024
    });

    expect(writeFiles).toHaveBeenCalledWith([
      expect.objectContaining({
        path: targetPath,
        mode: 0o755
      })
    ]);
    expect(writeRes).toEqual({
      bytesWritten: 6,
      etag: 'W/"6-1700000002000"'
    });

    await expect(
      writeSandboxSessionFile(sandbox, {
        path: 'hello.txt',
        stream: Readable.from([Buffer.from('too-large')]),
        maxFileBytes: 3
      })
    ).rejects.toThrow('File is too large');
  });

  it('dereferences symlinks in readSandboxSessionFile so size and etag match the target file rather than lstat symlink string length', async () => {
    const symlinkPath = `${sessionWorkDirectory}/dashboard/notes-link.md`;
    const realTargetPath = `${sessionWorkDirectory}/notes.md`;
    const getFileInfo = vi.fn(async (paths: string[]) => {
      const map = new Map();
      for (const p of paths) {
        if (p === symlinkPath) {
          map.set(symlinkPath, {
            path: symlinkPath,
            type: 'symlink',
            size: 11,
            modifiedAt: new Date(1700000001000)
          });
        } else if (p === realTargetPath) {
          map.set(realTargetPath, {
            path: realTargetPath,
            type: 'file',
            size: 15,
            modifiedAt: new Date(1700000005000)
          });
        }
      }
      return map;
    });
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ stdout: `${realTargetPath}\n`, stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: 'No such file', exitCode: 1 });
    const readFileStream = vi.fn(() =>
      (async function* () {
        yield new TextEncoder().encode('# Initial Notes');
      })()
    );
    const sandbox = makeSandbox({ getFileInfo, execute, readFileStream });

    const res = await readSandboxSessionFile(sandbox, 'dashboard/notes-link.md');
    expect(res.fileName).toBe('notes-link.md');
    expect(res.size).toBe(15);
    expect(res.etag).toBe('W/"15-1700000005000"');

    await expect(readSandboxSessionFile(sandbox, 'dashboard/notes-link.md')).rejects.toBeInstanceOf(
      SandboxFileNotFoundError
    );

    const fifoPath = `${sessionWorkDirectory}/named.pipe`;
    const fifoSandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(
        makeFileInfoMap(fifoPath, {
          type: 'other',
          size: 0
        })
      ),
      readFileStream: vi.fn()
    });
    await expect(readSandboxSessionFile(fifoSandbox, 'named.pipe')).rejects.toBeInstanceOf(
      SandboxFileNotFoundError
    );
    expect(fifoSandbox.opensandbox.readFileStream).not.toHaveBeenCalled();
  });

  it('hides top-level .fastgpt directory when listing /workspace root', async () => {
    const sandbox = makeSandbox(
      {
        createDirectories: vi.fn(async () => undefined),
        listDirectory: vi.fn(async () => [
          makeDirectoryEntry('.fastgpt', { type: 'directory', path: '/workspace/.fastgpt' }),
          makeDirectoryEntry('SKILL.md', { path: '/workspace/SKILL.md' })
        ])
      },
      '/workspace'
    );

    const entries = await listSandboxSessionDirectory(sandbox, '.');
    expect(entries.map((entry) => entry.name)).toEqual(['SKILL.md']);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import {
  isSandboxPathDirectory,
  getSandboxFileContent,
  addDirectoryToArchive,
  prepareSandboxFileParentDirectories,
  resolveSandboxWorkspacePath,
  writeUrlFilesToSandbox
} from '@fastgpt/service/core/ai/sandbox/application/file';
import type { SandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import type { DirectoryEntry, FileInfo, FileReadResult } from '@fastgpt-sdk/sandbox-adapter';

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

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile', () => ({
  getSandboxRuntimeProfile: () => ({ workDirectory: '/workspace' })
}));

const sessionWorkDirectory = '/workspace/sessions/chat-1';
const resolveSessionPath = (path: string) =>
  resolveSandboxWorkspacePath(path, sessionWorkDirectory, {
    allowAbsolutePath: true,
    workspaceRoot: '/workspace'
  });

// ─── helpers ───────────────────────────────────────────────────────────────

function makeSandbox(providerOverrides: Partial<SandboxClient['provider']> = {}): SandboxClient {
  return {
    provider: providerOverrides,
    resolveRuntimePath: vi.fn(resolveSessionPath)
  } as unknown as SandboxClient;
}

function makeDirectoryEntry(
  name: string,
  opts: { isDirectory?: boolean; path?: string } = {}
): DirectoryEntry {
  const isDirectory = opts.isDirectory ?? false;
  return {
    name,
    path: opts.path ?? `/workspace/${name}`,
    isDirectory,
    isFile: !isDirectory
  };
}

function makeReadResult(path: string, content: string, error: Error | null = null): FileReadResult {
  return {
    path,
    content: new TextEncoder().encode(content),
    error
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
    } as unknown as Parameters<typeof writeUrlFilesToSandbox>[0];

    await writeUrlFilesToSandbox(sandbox, [{ path: '', url: 'https://example.com/ignored.txt' }]);

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
    } as unknown as Parameters<typeof writeUrlFilesToSandbox>[0];

    await writeUrlFilesToSandbox(sandbox, [
      { path: '/workspace/a.txt', url: 'https://example.com/a.txt' },
      { path: '/workspace/reports/b.txt', url: 'https://example.com/b.txt' }
    ]);

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
    expect(sandbox.createDirectories.mock.invocationCallOrder[0]).toBeLessThan(
      sandbox.writeFiles.mock.invocationCallOrder[0]
    );
  });

  it('uses the injected reader for workflow context files', async () => {
    const sandbox = {
      createDirectories: vi.fn(async () => undefined),
      writeFiles: vi.fn(async () => undefined)
    };
    const readInputFile = vi.fn().mockResolvedValue(Buffer.from('private'));

    await writeUrlFilesToSandbox(
      sandbox as any,
      [{ path: '/workspace/private.pdf', url: 'https://files.example.com/signed' }],
      readInputFile
    );

    expect(readInputFile).toHaveBeenCalledWith('https://files.example.com/signed');
    expect(axiosMock.get).not.toHaveBeenCalled();
    expect(sandbox.writeFiles).toHaveBeenCalledWith([
      { path: '/workspace/private.pdf', data: Buffer.from('private') }
    ]);
  });

  it('rejects relative input URLs instead of calling an internal axios', async () => {
    const sandbox = { writeFiles: vi.fn() };

    await expect(
      writeUrlFilesToSandbox(sandbox as any, [
        { path: '/workspace/a.txt', url: '/api/system/file/d/token' }
      ])
    ).rejects.toThrow('absolute HTTP(S)');
    expect(axiosMock.get).not.toHaveBeenCalled();
  });
});

describe('prepareSandboxFileParentDirectories', () => {
  it('skips paths without a writable parent directory', async () => {
    const sandbox = { createDirectories: vi.fn() };

    await prepareSandboxFileParentDirectories(sandbox as any, ['', 'file.txt', '/root.txt']);

    expect(sandbox.createDirectories).not.toHaveBeenCalled();
  });
});

// ─── resolveSandboxWorkspacePath ───────────────────────────────────────────

describe('resolveSandboxWorkspacePath', () => {
  it('把根路径和相对路径锚定到 workDirectory，默认拒绝绝对路径', () => {
    expect(resolveSandboxWorkspacePath('.', '/home/devbox/workspace')).toBe(
      '/home/devbox/workspace'
    );
    expect(resolveSandboxWorkspacePath('', '/home/devbox/workspace/')).toBe(
      '/home/devbox/workspace'
    );
    expect(resolveSandboxWorkspacePath('skills/a/SKILL.md', '/home/devbox/workspace')).toBe(
      '/home/devbox/workspace/skills/a/SKILL.md'
    );
    expect(resolveSandboxWorkspacePath('./src/index.ts', '/workspace')).toBe(
      '/workspace/src/index.ts'
    );
    expect(() =>
      resolveSandboxWorkspacePath('/home/devbox/workspace/src/index.ts', '/workspace')
    ).toThrow('Absolute sandbox paths are not allowed');
  });
});

// ─── isSandboxPathDirectory ────────────────────────────────────────────────

describe('isSandboxPathDirectory', () => {
  it.each([
    { path: 'src', isDirectory: true },
    { path: 'main.py', isDirectory: false }
  ])('根据 provider 信息判断 $path', async ({ path, isDirectory }) => {
    const providerPath = resolveSessionPath(path);
    const getFileInfo = vi.fn().mockResolvedValue(makeFileInfoMap(providerPath, { isDirectory }));
    const sandbox = makeSandbox({
      getFileInfo
    });

    expect(await isSandboxPathDirectory(sandbox, path)).toBe(isDirectory);
    expect(getFileInfo).toHaveBeenCalledWith([providerPath]);
  });

  it('fileInfo 不存在时按路径形态判断目录', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(new Map())
    });

    expect(await isSandboxPathDirectory(sandbox, '.')).toBe(true);
    expect(await isSandboxPathDirectory(sandbox, '')).toBe(true);
    expect(await isSandboxPathDirectory(sandbox, 'workspace/')).toBe(true);
    expect(await isSandboxPathDirectory(sandbox, 'main.py')).toBe(false);
  });
});

// ─── getSandboxFileContent ─────────────────────────────────────────────────

describe('getSandboxFileContent', () => {
  it('默认按二进制读取 session 文件并返回文件名和内容', async () => {
    const readFiles = vi.fn().mockResolvedValue([makeReadResult('a/b/main.py', 'print(1)')]);
    const sandbox = makeSandbox({ readFiles });

    const result = await getSandboxFileContent(sandbox, 'a/b/main.py');

    expect(result.contentType).toBe('application/octet-stream');
    expect(result.fileName).toBe('main.py');
    expect(result.content).toEqual(Buffer.from('print(1)'));
    expect(readFiles).toHaveBeenCalledWith([resolveSessionPath('a/b/main.py')]);
  });

  it.each([
    { path: 'index.html', expectedContentType: 'text/html' },
    { path: 'foo.unknown123', expectedContentType: 'application/octet-stream' }
  ])('preview 时按 $path 推断 contentType', async ({ path, expectedContentType }) => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult(path, 'data')])
    });
    const result = await getSandboxFileContent(sandbox, path, true);
    expect(result.contentType).toBe(expectedContentType);
  });

  it('读取失败时 reject', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('file.txt', '', new Error('not found'))])
    });
    await expect(getSandboxFileContent(sandbox, 'file.txt')).rejects.toThrow(
      'Failed to read file: not found'
    );
  });
});

// ─── addDirectoryToArchive ─────────────────────────────────────────────────

describe('addDirectoryToArchive', () => {
  function makeArchive() {
    return { append: vi.fn() } as unknown as Parameters<typeof addDirectoryToArchive>[1];
  }

  it('逐文件把 provider download stream 交给 archive', async () => {
    const archive = makeArchive();
    const entries = [
      makeDirectoryEntry('ok.py', { path: '/workspace/ok.py' }),
      makeDirectoryEntry('other.py', { path: '/workspace/other.py' })
    ];
    const readFileStream = vi.fn((_path: string) =>
      (async function* () {
        yield new TextEncoder().encode('content');
      })()
    );
    const sandbox = makeSandbox({
      listDirectory: vi.fn().mockResolvedValue(entries),
      readFileStream
    });
    await addDirectoryToArchive(sandbox, archive, '/workspace', '');
    expect(archive.append).toHaveBeenCalledTimes(2);
    expect(archive.append).toHaveBeenCalledWith(expect.anything(), { name: 'ok.py' });
    expect(readFileStream).toHaveBeenCalledWith('/workspace/ok.py');
  });

  it('深层嵌套目录递归正确', async () => {
    const archive = makeArchive();
    const listDirectory = vi
      .fn()
      .mockResolvedValueOnce([makeDirectoryEntry('a', { isDirectory: true, path: '/workspace/a' })])
      .mockResolvedValueOnce([
        makeDirectoryEntry('b', { isDirectory: true, path: '/workspace/a/b' })
      ])
      .mockResolvedValueOnce([makeDirectoryEntry('c.txt', { path: '/workspace/a/b/c.txt' })]);
    const readFileStream = vi.fn(() =>
      (async function* () {
        yield new TextEncoder().encode('deep');
      })()
    );
    const sandbox = makeSandbox({ listDirectory, readFileStream });
    await addDirectoryToArchive(sandbox, archive, '/workspace', '');
    expect(archive.append).toHaveBeenCalledWith(expect.anything(), { name: 'a/b/c.txt' });
  });

  it('超过最大深度限制时停止递归', async () => {
    const archive = makeArchive();
    const listDirectory = vi
      .fn()
      .mockResolvedValue([
        makeDirectoryEntry('sub', { isDirectory: true, path: '/workspace/sub' })
      ]);
    const sandbox = makeSandbox({ listDirectory });
    // depth=21 超过 MAX_ARCHIVE_DEPTH(20)，应直接返回不做任何操作
    await addDirectoryToArchive(sandbox, archive, '/workspace', '', 21);
    expect(listDirectory).not.toHaveBeenCalled();
    expect(archive.append).not.toHaveBeenCalled();
  });

  it('允许归档 provider 返回的 workspace 外绝对路径', async () => {
    const archive = makeArchive();
    const readFileStream = vi.fn(() =>
      (async function* () {
        yield new TextEncoder().encode('secret');
      })()
    );
    const sandbox = makeSandbox({
      listDirectory: vi.fn().mockResolvedValue([
        makeDirectoryEntry('secret.txt', {
          path: '/etc/secret.txt'
        })
      ]),
      readFileStream
    });

    await addDirectoryToArchive(sandbox, archive, '/workspace', '');
    expect(readFileStream).toHaveBeenCalledWith('/etc/secret.txt');
    expect(archive.append).toHaveBeenCalledWith(expect.anything(), { name: 'secret.txt' });
  });
});

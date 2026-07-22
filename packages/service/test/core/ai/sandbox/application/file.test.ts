import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
  isSandboxPathDirectory,
  getSandboxFileContent,
  addDirectoryToArchive,
  resolveSandboxWorkspacePath,
  writeUrlFilesToSandbox
} from '@fastgpt/service/core/ai/sandbox/application/file';
import type { SandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import type { DirectoryEntry, FileInfo, FileReadResult } from '@fastgpt-sdk/sandbox-adapter';

const axiosMock = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  pickOutboundAxios: vi.fn(() => axiosMock)
}));

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

function makeProvider(
  overrides: Partial<SandboxClient['provider']> = {}
): SandboxClient['provider'] {
  return {
    listDirectory: vi.fn(),
    writeFiles: vi.fn(),
    readFiles: vi.fn(),
    getFileInfo: vi.fn(),
    ensureRunning: vi.fn(),
    execute: vi.fn(),
    delete: vi.fn(),
    stop: vi.fn(),
    provider: 'mock',
    ...overrides
  } as unknown as SandboxClient['provider'];
}

function makeSandbox(providerOverrides: Partial<SandboxClient['provider']> = {}): SandboxClient {
  return {
    provider: makeProvider(providerOverrides),
    resolveRuntimePath: vi.fn(resolveSessionPath)
  } as unknown as SandboxClient;
}

function makeDirectoryEntry(
  name: string,
  opts: { isDirectory?: boolean; size?: number; path?: string } = {}
): DirectoryEntry {
  const isDirectory = opts.isDirectory ?? false;
  return {
    name,
    path: opts.path ?? `/workspace/${name}`,
    isDirectory,
    isFile: !isDirectory,
    size: opts.size
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
      writeFiles: vi.fn()
    } as unknown as Parameters<typeof writeUrlFilesToSandbox>[0];

    await writeUrlFilesToSandbox(sandbox, [{ path: '', url: 'https://example.com/ignored.txt' }]);

    expect(axiosMock.get).not.toHaveBeenCalled();
    expect(sandbox.writeFiles).not.toHaveBeenCalled();
  });

  it('downloads URL files and writes them in one batch', async () => {
    const first = new ArrayBuffer(1);
    const second = new ArrayBuffer(2);
    axiosMock.get.mockResolvedValueOnce({ data: first }).mockResolvedValueOnce({ data: second });
    const sandbox = {
      writeFiles: vi.fn(async () => undefined)
    } as unknown as Parameters<typeof writeUrlFilesToSandbox>[0];

    await writeUrlFilesToSandbox(sandbox, [
      { path: '/workspace/a.txt', url: 'https://example.com/a.txt' },
      { path: '/workspace/b.txt', url: 'https://example.com/b.txt' }
    ]);

    expect(axiosMock.get).toHaveBeenCalledWith('https://example.com/a.txt', {
      responseType: 'arraybuffer'
    });
    expect(axiosMock.get).toHaveBeenCalledWith('https://example.com/b.txt', {
      responseType: 'arraybuffer'
    });
    expect(sandbox.writeFiles).toHaveBeenCalledWith([
      { path: '/workspace/a.txt', data: first },
      { path: '/workspace/b.txt', data: second }
    ]);
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
  it('使用 session 路径查询 provider 目录信息', async () => {
    const providerPath = resolveSessionPath('src');
    const getFileInfo = vi
      .fn()
      .mockResolvedValue(makeFileInfoMap(providerPath, { isDirectory: true }));
    const sandbox = makeSandbox({
      getFileInfo
    });

    expect(await isSandboxPathDirectory(sandbox, 'src')).toBe(true);
    expect(getFileInfo).toHaveBeenCalledWith([providerPath]);
  });

  it('getFileInfo 返回 isDirectory:false', async () => {
    const providerPath = resolveSessionPath('main.py');
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(makeFileInfoMap(providerPath, { isDirectory: false }))
    });
    expect(await isSandboxPathDirectory(sandbox, 'main.py')).toBe(false);
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

  it('preview=true 且可识别扩展名时返回正确 contentType', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('index.html', '<html/>')])
    });
    const result = await getSandboxFileContent(sandbox, 'index.html', true);
    expect(result.contentType).toBe('text/html');
  });

  it('preview=true 且扩展名无法识别时回退 application/octet-stream', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('foo.unknown123', 'data')])
    });
    const result = await getSandboxFileContent(sandbox, 'foo.unknown123', true);
    expect(result.contentType).toBe('application/octet-stream');
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
    return { append: vi.fn() } as unknown as import('archiver').Archiver;
  }

  it('混合场景：成功文件和失败文件', async () => {
    const archive = makeArchive();
    const entries = [
      makeDirectoryEntry('ok.py', { path: '/workspace/ok.py' }),
      makeDirectoryEntry('bad.py', { path: '/workspace/bad.py' })
    ];
    const readFiles = vi
      .fn()
      .mockResolvedValueOnce([makeReadResult('/workspace/ok.py', 'print(1)')])
      .mockResolvedValueOnce([makeReadResult('/workspace/bad.py', '', new Error('fail'))]);
    const sandbox = makeSandbox({ listDirectory: vi.fn().mockResolvedValue(entries), readFiles });
    await addDirectoryToArchive(sandbox, archive, '/workspace', '');
    expect(archive.append).toHaveBeenCalledTimes(1);
    expect(archive.append).toHaveBeenCalledWith(expect.any(Buffer), { name: 'ok.py' });
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
    const readFiles = vi.fn().mockResolvedValue([makeReadResult('/workspace/a/b/c.txt', 'deep')]);
    const sandbox = makeSandbox({ listDirectory, readFiles });
    await addDirectoryToArchive(sandbox, archive, '/workspace', '');
    expect(archive.append).toHaveBeenCalledWith(expect.any(Buffer), { name: 'a/b/c.txt' });
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

  it('拒绝归档 provider 返回的 workspace 外绝对路径', async () => {
    const archive = makeArchive();
    const sandbox = makeSandbox({
      listDirectory: vi.fn().mockResolvedValue([
        makeDirectoryEntry('secret.txt', {
          path: '/etc/secret.txt'
        })
      ])
    });

    await expect(addDirectoryToArchive(sandbox, archive, '/workspace', '')).rejects.toThrow(
      'Sandbox path is outside workspace'
    );
    expect(archive.append).not.toHaveBeenCalled();
  });
});

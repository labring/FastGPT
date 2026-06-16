import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isSandboxPathDirectory,
  getSandboxFileContent,
  addDirectoryToArchive,
  resolveSandboxWorkspacePath
} from '@/service/core/sandbox/fileService';
import type { SandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import type { DirectoryEntry, FileInfo, FileReadResult } from '@fastgpt-sdk/sandbox-adapter';

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
  return { provider: makeProvider(providerOverrides) } as unknown as SandboxClient;
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

// ─── resolveSandboxWorkspacePath ───────────────────────────────────────────

describe('resolveSandboxWorkspacePath', () => {
  it('把工作区根路径请求解析到 workDirectory', () => {
    expect(resolveSandboxWorkspacePath('.', '/home/devbox/workspace')).toBe(
      '/home/devbox/workspace'
    );
    expect(resolveSandboxWorkspacePath('', '/home/devbox/workspace/')).toBe(
      '/home/devbox/workspace'
    );
  });

  it('把相对路径锚定到 workDirectory，避免 Sealos 默认落到 /home/devbox', () => {
    expect(resolveSandboxWorkspacePath('skills/a/SKILL.md', '/home/devbox/workspace')).toBe(
      '/home/devbox/workspace/skills/a/SKILL.md'
    );
    expect(resolveSandboxWorkspacePath('./src/index.ts', '/workspace')).toBe(
      '/workspace/src/index.ts'
    );
  });

  it('公开 API 用户输入拒绝绝对路径，避免读取 workspace 外文件', () => {
    expect(() =>
      resolveSandboxWorkspacePath('/home/devbox/workspace/src/index.ts', '/workspace')
    ).toThrow('Absolute sandbox paths are not allowed');
  });

  it('内部 provider 路径可显式允许 workspace 内绝对路径', () => {
    expect(
      resolveSandboxWorkspacePath('/workspace/src/index.ts', '/workspace', {
        allowAbsolutePath: true
      })
    ).toBe('/workspace/src/index.ts');
  });

  it('内部 provider 路径即使显式允许绝对路径也不能越出 workspace', () => {
    expect(() =>
      resolveSandboxWorkspacePath('/home/devbox/workspace/src/index.ts', '/workspace', {
        allowAbsolutePath: true
      })
    ).toThrow('Sandbox path is outside workspace');
  });

  it('拒绝路径穿越', () => {
    expect(() => resolveSandboxWorkspacePath('../secret.txt', '/workspace')).toThrow(
      'Path traversal detected'
    );
  });
});

// ─── isSandboxPathDirectory ────────────────────────────────────────────────

describe('isSandboxPathDirectory', () => {
  it('getFileInfo 返回 isDirectory:true', async () => {
    const providerPath = resolveSandboxWorkspacePath('src');
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(makeFileInfoMap(providerPath, { isDirectory: true }))
    });
    expect(await isSandboxPathDirectory(sandbox, 'src')).toBe(true);
  });

  it('getFileInfo 返回 isDirectory:false', async () => {
    const providerPath = resolveSandboxWorkspacePath('main.py');
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(makeFileInfoMap(providerPath, { isDirectory: false }))
    });
    expect(await isSandboxPathDirectory(sandbox, 'main.py')).toBe(false);
  });

  it('fileInfo 不存在时，path 为 "." 返回 true', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(new Map())
    });
    expect(await isSandboxPathDirectory(sandbox, '.')).toBe(true);
  });

  it('fileInfo 不存在时，path 为 "" 返回 true', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(new Map())
    });
    expect(await isSandboxPathDirectory(sandbox, '')).toBe(true);
  });

  it('fileInfo 不存在时，path 以 "/" 结尾返回 true', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(new Map())
    });
    expect(await isSandboxPathDirectory(sandbox, 'workspace/')).toBe(true);
  });

  it('fileInfo 不存在时，普通文件路径返回 false', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(new Map())
    });
    expect(await isSandboxPathDirectory(sandbox, 'main.py')).toBe(false);
  });

  it('传递正确的 path 数组给 getFileInfo', async () => {
    const getFileInfo = vi.fn().mockResolvedValue(new Map());
    const sandbox = makeSandbox({ getFileInfo });
    await isSandboxPathDirectory(sandbox, 'some/path');
    expect(getFileInfo).toHaveBeenCalledWith([resolveSandboxWorkspacePath('some/path')]);
  });
});

// ─── getSandboxFileContent ─────────────────────────────────────────────────

describe('getSandboxFileContent', () => {
  it('preview=false 时 contentType 为 application/octet-stream', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('main.py', 'print(1)')])
    });
    const result = await getSandboxFileContent(sandbox, 'main.py', false);
    expect(result.contentType).toBe('application/octet-stream');
  });

  it('preview=undefined 时 contentType 为 application/octet-stream', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('main.py', 'code')])
    });
    const result = await getSandboxFileContent(sandbox, 'main.py');
    expect(result.contentType).toBe('application/octet-stream');
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

  it('正确提取 fileName（路径最后一段）', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('a/b/script.py', 'code')])
    });
    const result = await getSandboxFileContent(sandbox, 'a/b/script.py');
    expect(result.fileName).toBe('script.py');
  });

  it('路径不含 "/" 时 fileName 等于 path 本身', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('readme.md', 'hi')])
    });
    const result = await getSandboxFileContent(sandbox, 'readme.md');
    expect(result.fileName).toBe('readme.md');
  });

  it('content 正确转换为 Buffer', async () => {
    const text = 'hello world';
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('f.txt', text)])
    });
    const result = await getSandboxFileContent(sandbox, 'f.txt');
    expect(result.content).toEqual(Buffer.from(text));
  });

  it('传递正确的 path 数组给 readFiles', async () => {
    const readFiles = vi.fn().mockResolvedValue([makeReadResult('x.ts', '')]);
    const sandbox = makeSandbox({ readFiles });
    await getSandboxFileContent(sandbox, 'x.ts');
    expect(readFiles).toHaveBeenCalledWith([resolveSandboxWorkspacePath('x.ts')]);
  });
});

// ─── addDirectoryToArchive ─────────────────────────────────────────────────

describe('addDirectoryToArchive', () => {
  function makeArchive() {
    return { append: vi.fn() } as unknown as import('archiver').Archiver;
  }

  it('空目录不调用 append', async () => {
    const archive = makeArchive();
    const sandbox = makeSandbox({ listDirectory: vi.fn().mockResolvedValue([]) });
    await addDirectoryToArchive(sandbox, archive, '/workspace', '');
    expect(archive.append).not.toHaveBeenCalled();
  });

  it('顶层文件（archivePath 为空）使用 entry.name 作为归档路径', async () => {
    const archive = makeArchive();
    const sandbox = makeSandbox({
      listDirectory: vi.fn().mockResolvedValue([makeDirectoryEntry('main.py', { size: 10 })]),
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/workspace/main.py', 'code')])
    });
    await addDirectoryToArchive(sandbox, archive, '/workspace', '');
    expect(archive.append).toHaveBeenCalledWith(expect.any(Buffer), { name: 'main.py' });
  });

  it('嵌套文件时归档路径包含前缀', async () => {
    const archive = makeArchive();
    const sandbox = makeSandbox({
      listDirectory: vi.fn().mockResolvedValue([makeDirectoryEntry('utils.ts', { size: 50 })]),
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/workspace/src/utils.ts', 'export')])
    });
    await addDirectoryToArchive(sandbox, archive, '/workspace/src', 'src');
    expect(archive.append).toHaveBeenCalledWith(expect.any(Buffer), { name: 'src/utils.ts' });
  });

  it('递归处理子目录', async () => {
    const archive = makeArchive();
    const listDirectory = vi
      .fn()
      .mockResolvedValueOnce([
        makeDirectoryEntry('src', { isDirectory: true, path: '/workspace/src' })
      ])
      .mockResolvedValueOnce([makeDirectoryEntry('index.ts', { path: '/workspace/src/index.ts' })]);
    const readFiles = vi
      .fn()
      .mockResolvedValue([makeReadResult('/workspace/src/index.ts', 'code')]);
    const sandbox = makeSandbox({ listDirectory, readFiles });
    await addDirectoryToArchive(sandbox, archive, '/workspace', '');
    expect(archive.append).toHaveBeenCalledWith(expect.any(Buffer), { name: 'src/index.ts' });
  });

  it('读取失败的文件被跳过，不调用 append', async () => {
    const archive = makeArchive();
    const entries = [makeDirectoryEntry('broken.py', { size: 100 })];
    const sandbox = makeSandbox({
      listDirectory: vi.fn().mockResolvedValue(entries),
      readFiles: vi
        .fn()
        .mockResolvedValue([makeReadResult('/workspace/broken.py', '', new Error('read error'))])
    });
    await addDirectoryToArchive(sandbox, archive, '/workspace', '');
    expect(archive.append).not.toHaveBeenCalled();
  });

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

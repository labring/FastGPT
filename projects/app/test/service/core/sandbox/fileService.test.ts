import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listSandboxDirectory,
  writeSandboxFile,
  isSandboxPathDirectory,
  getSandboxFileContent,
  addDirectoryToArchive,
  type SandboxFileEntry
} from '@/service/core/sandbox/fileService';
import type { SandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import type {
  DirectoryEntry,
  FileInfo,
  FileReadResult,
  FileWriteResult
} from '@fastgpt-sdk/sandbox-adapter';

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

function makeWriteResult(path: string, error: Error | null = null): FileWriteResult {
  return { path, bytesWritten: error ? 0 : 10, error };
}

function makeFileInfoMap(path: string, info: Partial<FileInfo>): Map<string, FileInfo> {
  return new Map([[path, { path, ...info }]]);
}

// ─── listSandboxDirectory ──────────────────────────────────────────────────

describe('listSandboxDirectory', () => {
  it('空目录返回空数组', async () => {
    const sandbox = makeSandbox({ listDirectory: vi.fn().mockResolvedValue([]) });
    const result = await listSandboxDirectory(sandbox, '/workspace');
    expect(result).toEqual([]);
  });

  it('正确映射文件条目', async () => {
    const entries = [makeDirectoryEntry('index.ts', { size: 200 })];
    const sandbox = makeSandbox({ listDirectory: vi.fn().mockResolvedValue(entries) });
    const result = await listSandboxDirectory(sandbox, '/workspace');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject<SandboxFileEntry>({
      name: 'index.ts',
      path: '/workspace/index.ts',
      type: 'file',
      size: 200
    });
  });

  it('正确映射目录条目，size 为 undefined', async () => {
    const entries = [makeDirectoryEntry('src', { isDirectory: true })];
    const sandbox = makeSandbox({ listDirectory: vi.fn().mockResolvedValue(entries) });
    const result = await listSandboxDirectory(sandbox, '/workspace');

    expect(result[0]).toMatchObject<SandboxFileEntry>({
      name: 'src',
      type: 'directory',
      size: undefined
    });
  });

  it('混合条目正确映射', async () => {
    const entries = [
      makeDirectoryEntry('src', { isDirectory: true }),
      makeDirectoryEntry('main.py', { size: 512 })
    ];
    const sandbox = makeSandbox({ listDirectory: vi.fn().mockResolvedValue(entries) });
    const result = await listSandboxDirectory(sandbox, '/workspace');

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('directory');
    expect(result[1].type).toBe('file');
    expect(result[1].size).toBe(512);
  });

  it('传递正确的 path 参数给 provider', async () => {
    const listDirectory = vi.fn().mockResolvedValue([]);
    const sandbox = makeSandbox({ listDirectory });
    await listSandboxDirectory(sandbox, '/some/path');
    expect(listDirectory).toHaveBeenCalledWith('/some/path');
  });
});

// ─── writeSandboxFile ──────────────────────────────────────────────────────

describe('writeSandboxFile', () => {
  it('写入成功时正常返回', async () => {
    const writeFiles = vi.fn().mockResolvedValue([makeWriteResult('/file.txt')]);
    const sandbox = makeSandbox({ writeFiles });
    await expect(writeSandboxFile(sandbox, '/file.txt', 'hello')).resolves.toBeUndefined();
  });

  it('传递正确的 path 和 content 给 provider', async () => {
    const writeFiles = vi.fn().mockResolvedValue([makeWriteResult('/out.py')]);
    const sandbox = makeSandbox({ writeFiles });
    await writeSandboxFile(sandbox, '/out.py', 'print("hi")');
    expect(writeFiles).toHaveBeenCalledWith([{ path: '/out.py', data: 'print("hi")' }]);
  });

  it('写入失败时 reject error', async () => {
    const err = new Error('disk full');
    const writeFiles = vi.fn().mockResolvedValue([makeWriteResult('/file.txt', err)]);
    const sandbox = makeSandbox({ writeFiles });
    await expect(writeSandboxFile(sandbox, '/file.txt', 'data')).rejects.toThrow('disk full');
  });

  it('写入空字符串不会报错', async () => {
    const writeFiles = vi.fn().mockResolvedValue([makeWriteResult('/empty.txt')]);
    const sandbox = makeSandbox({ writeFiles });
    await expect(writeSandboxFile(sandbox, '/empty.txt', '')).resolves.toBeUndefined();
  });
});

// ─── isSandboxPathDirectory ────────────────────────────────────────────────

describe('isSandboxPathDirectory', () => {
  it('getFileInfo 返回 isDirectory:true', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(makeFileInfoMap('/src', { isDirectory: true }))
    });
    expect(await isSandboxPathDirectory(sandbox, '/src')).toBe(true);
  });

  it('getFileInfo 返回 isDirectory:false', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(makeFileInfoMap('/main.py', { isDirectory: false }))
    });
    expect(await isSandboxPathDirectory(sandbox, '/main.py')).toBe(false);
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
    expect(await isSandboxPathDirectory(sandbox, '/workspace/')).toBe(true);
  });

  it('fileInfo 不存在时，普通文件路径返回 false', async () => {
    const sandbox = makeSandbox({
      getFileInfo: vi.fn().mockResolvedValue(new Map())
    });
    expect(await isSandboxPathDirectory(sandbox, '/main.py')).toBe(false);
  });

  it('传递正确的 path 数组给 getFileInfo', async () => {
    const getFileInfo = vi.fn().mockResolvedValue(new Map());
    const sandbox = makeSandbox({ getFileInfo });
    await isSandboxPathDirectory(sandbox, '/some/path');
    expect(getFileInfo).toHaveBeenCalledWith(['/some/path']);
  });
});

// ─── getSandboxFileContent ─────────────────────────────────────────────────

describe('getSandboxFileContent', () => {
  it('preview=false 时 contentType 为 application/octet-stream', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/main.py', 'print(1)')])
    });
    const result = await getSandboxFileContent(sandbox, '/main.py', false);
    expect(result.contentType).toBe('application/octet-stream');
  });

  it('preview=undefined 时 contentType 为 application/octet-stream', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/main.py', 'code')])
    });
    const result = await getSandboxFileContent(sandbox, '/main.py');
    expect(result.contentType).toBe('application/octet-stream');
  });

  it('preview=true 且可识别扩展名时返回正确 contentType', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/index.html', '<html/>')])
    });
    const result = await getSandboxFileContent(sandbox, '/index.html', true);
    expect(result.contentType).toBe('text/html');
  });

  it('preview=true 且扩展名无法识别时回退 application/octet-stream', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/foo.unknown123', 'data')])
    });
    const result = await getSandboxFileContent(sandbox, '/foo.unknown123', true);
    expect(result.contentType).toBe('application/octet-stream');
  });

  it('读取失败时 reject', async () => {
    const sandbox = makeSandbox({
      readFiles: vi
        .fn()
        .mockResolvedValue([makeReadResult('/file.txt', '', new Error('not found'))])
    });
    await expect(getSandboxFileContent(sandbox, '/file.txt')).rejects.toBe('Failed to read file');
  });

  it('正确提取 fileName（路径最后一段）', async () => {
    const sandbox = makeSandbox({
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/a/b/script.py', 'code')])
    });
    const result = await getSandboxFileContent(sandbox, '/a/b/script.py');
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
      readFiles: vi.fn().mockResolvedValue([makeReadResult('/f.txt', text)])
    });
    const result = await getSandboxFileContent(sandbox, '/f.txt');
    expect(result.content).toEqual(Buffer.from(text));
  });

  it('传递正确的 path 数组给 readFiles', async () => {
    const readFiles = vi.fn().mockResolvedValue([makeReadResult('/x.ts', '')]);
    const sandbox = makeSandbox({ readFiles });
    await getSandboxFileContent(sandbox, '/x.ts');
    expect(readFiles).toHaveBeenCalledWith(['/x.ts']);
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
      .mockResolvedValueOnce([makeDirectoryEntry('a', { isDirectory: true, path: '/w/a' })])
      .mockResolvedValueOnce([makeDirectoryEntry('b', { isDirectory: true, path: '/w/a/b' })])
      .mockResolvedValueOnce([makeDirectoryEntry('c.txt', { path: '/w/a/b/c.txt' })]);
    const readFiles = vi.fn().mockResolvedValue([makeReadResult('/w/a/b/c.txt', 'deep')]);
    const sandbox = makeSandbox({ listDirectory, readFiles });
    await addDirectoryToArchive(sandbox, archive, '/w', '');
    expect(archive.append).toHaveBeenCalledWith(expect.any(Buffer), { name: 'a/b/c.txt' });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

vi.mock('@/service/core/sandbox/auth', () => ({
  authSandboxSession: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/runtime', () => ({
  getSandboxClient: vi.fn()
}));

const makeSandbox = () =>
  ({
    provider: {
      createDirectories: vi.fn(async () => undefined),
      deleteDirectories: vi.fn(async () => undefined),
      deleteFiles: vi.fn(async (paths: string[]) =>
        paths.map((path) => ({ path, success: true, error: null }))
      ),
      getFileInfo: vi.fn(async () => new Map()),
      listDirectory: vi.fn(async () => []),
      moveFiles: vi.fn(async () => undefined),
      readFiles: vi.fn(async () => []),
      writeFiles: vi.fn(async () => [])
    }
  }) as unknown as SandboxClient;

import { runSandboxFileOperation } from '@/pages/api/core/ai/sandbox/fileOp';

describe('runSandboxFileOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows common filename characters when creating directories', async () => {
    const sandbox = makeSandbox();

    await runSandboxFileOperation({
      sandbox,
      type: 'mkdir',
      path: 'foo(1) @#'
    });

    expect(sandbox.provider.createDirectories).toHaveBeenCalledWith(['/workspace/foo(1) @#']);
  });

  it('moves paths through the provider without building shell commands', async () => {
    const sandbox = makeSandbox();

    await runSandboxFileOperation({
      sandbox,
      type: 'move',
      path: 'foo(1).txt',
      destPath: 'dir @#/foo(2).txt'
    });

    expect(sandbox.provider.createDirectories).toHaveBeenCalledWith(['/workspace/dir @#']);
    expect(sandbox.provider.moveFiles).toHaveBeenCalledWith([
      {
        source: '/workspace/foo(1).txt',
        destination: '/workspace/dir @#/foo(2).txt'
      }
    ]);
  });

  it('deletes directories through deleteDirectories', async () => {
    const sandbox = makeSandbox();
    vi.mocked(sandbox.provider.getFileInfo).mockResolvedValueOnce(
      new Map([['/workspace/dir', { path: '/workspace/dir', isDirectory: true }]])
    );

    await runSandboxFileOperation({
      sandbox,
      type: 'delete',
      path: 'dir'
    });

    expect(sandbox.provider.deleteDirectories).toHaveBeenCalledWith(['/workspace/dir'], {
      recursive: true,
      force: true
    });
    expect(sandbox.provider.deleteFiles).not.toHaveBeenCalled();
  });

  it('copies files through readFiles and writeFiles', async () => {
    const sandbox = makeSandbox();
    const content = new Uint8Array([1, 2, 3]);
    vi.mocked(sandbox.provider.getFileInfo).mockResolvedValueOnce(
      new Map([['/workspace/foo(1).txt', { path: '/workspace/foo(1).txt', isFile: true }]])
    );
    vi.mocked(sandbox.provider.readFiles).mockResolvedValueOnce([
      { path: '/workspace/foo(1).txt', content, error: null }
    ]);
    vi.mocked(sandbox.provider.writeFiles).mockResolvedValueOnce([
      { path: '/workspace/copy @#/foo(2).txt', bytesWritten: 3, error: null }
    ]);

    await runSandboxFileOperation({
      sandbox,
      type: 'copy',
      path: 'foo(1).txt',
      destPath: 'copy @#/foo(2).txt'
    });

    expect(sandbox.provider.createDirectories).toHaveBeenCalledWith(['/workspace/copy @#']);
    expect(sandbox.provider.readFiles).toHaveBeenCalledWith(['/workspace/foo(1).txt']);
    expect(sandbox.provider.writeFiles).toHaveBeenCalledWith([
      { path: '/workspace/copy @#/foo(2).txt', data: content }
    ]);
  });

  it('rejects traversal paths before provider operations', async () => {
    const sandbox = makeSandbox();

    await expect(
      runSandboxFileOperation({
        sandbox,
        type: 'mkdir',
        path: '../outside'
      })
    ).rejects.toThrow('Path traversal detected');

    expect(sandbox.provider.createDirectories).not.toHaveBeenCalled();
  });
});

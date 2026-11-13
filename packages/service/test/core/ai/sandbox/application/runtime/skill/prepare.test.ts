import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

const mocks = vi.hoisted(() => ({
  downloadSkillPackageStream: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/skill/package', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/skill/package')>()),
  downloadSkillPackageStream: mocks.downloadSkillPackageStream
}));

import { deploySkillPackage } from '@fastgpt/service/core/ai/sandbox/application/runtime/skill/prepare';

const successResult = {
  exitCode: 0,
  stdout: '',
  stderr: ''
};

describe('skill package streaming prepare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('streams the S3 package into /tmp without polluting /workspace', async () => {
    const source = Readable.from([Buffer.from('chunk-1'), Buffer.from('chunk-2')]);
    mocks.downloadSkillPackageStream.mockResolvedValue(source);
    let uploaded = Buffer.alloc(0);
    let stagedZipPath = '';
    const sandbox = {
      createDirectories: vi.fn().mockResolvedValue(undefined),
      deleteFiles: vi.fn(async (paths: string[]) =>
        paths.map((path) => ({ path, success: true, error: null }))
      ),
      getFileInfo: vi.fn(async () => new Map()),
      execute: vi.fn().mockResolvedValue(successResult),
      writeFiles: vi.fn(async ([entry]: Array<{ path: string; data: ReadableStream | string }>) => {
        if (entry.path === '/workspace/.gitignore') {
          return [{ path: entry.path, error: null }];
        }

        expect(entry.path).toMatch(/^\/tmp\/\.fastgpt-skill-package-[^/]+\.zip$/);
        stagedZipPath = entry.path;
        if (!(entry.data instanceof ReadableStream)) {
          throw new Error('Expected package upload to use a ReadableStream');
        }

        const chunks: Buffer[] = [];
        for await (const chunk of entry.data) {
          chunks.push(Buffer.from(chunk));
        }
        uploaded = Buffer.concat(chunks);

        return [{ path: entry.path, error: null }];
      })
    };
    const baseContext = {
      sandbox: sandbox as any,
      workDirectory: '/workspace'
    };

    await deploySkillPackage({
      storageKey: 'version.zip'
    })(baseContext);

    expect(mocks.downloadSkillPackageStream).toHaveBeenCalledWith({ storageKey: 'version.zip' });
    expect(uploaded.toString()).toBe('chunk-1chunk-2');
    expect(source.destroyed).toBe(true);
    expect(sandbox.createDirectories).not.toHaveBeenCalled();
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining('unzip -Z1'), {
      workingDirectory: '/workspace'
    });
    expect(sandbox.deleteFiles).toHaveBeenCalledWith([stagedZipPath]);
    expect(sandbox.getFileInfo).toHaveBeenCalledWith(['/workspace/.gitignore']);
    expect(sandbox.writeFiles).toHaveBeenLastCalledWith([
      {
        path: '/workspace/.gitignore',
        data: expect.stringContaining('node_modules')
      }
    ]);
  });

  it('destroys an unconsumed S3 stream and cleans up staged zip when upload fails', async () => {
    const source = Readable.from([Buffer.from('content')]);
    mocks.downloadSkillPackageStream.mockResolvedValue(source);
    const sandbox = {
      deleteFiles: vi.fn().mockResolvedValue(undefined),
      getFileInfo: vi.fn(async () => new Map()),
      execute: vi.fn().mockResolvedValue(successResult),
      writeFiles: vi.fn().mockRejectedValue(new Error('upload failed'))
    };
    await expect(
      deploySkillPackage({ storageKey: 'version.zip' })({
        sandbox: sandbox as any,
        workDirectory: '/workspace'
      })
    ).rejects.toThrow('upload failed');
    expect(source.destroyed).toBe(true);
    expect(sandbox.deleteFiles).toHaveBeenCalledTimes(1);
  });
});

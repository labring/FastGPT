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

  it('streams the S3 package into sandbox.writeFiles', async () => {
    const source = Readable.from([Buffer.from('chunk-1'), Buffer.from('chunk-2')]);
    mocks.downloadSkillPackageStream.mockResolvedValue(source);
    let uploaded = Buffer.alloc(0);
    const sandbox = {
      createDirectories: vi.fn().mockResolvedValue(undefined),
      deleteFiles: vi.fn(async (paths: string[]) =>
        paths.map((path) => ({ path, success: true, error: null }))
      ),
      getFileInfo: vi.fn(async () => new Map()),
      execute: vi.fn().mockResolvedValue(successResult),
      writeFiles: vi.fn(async ([entry]: Array<{ path: string; data: ReadableStream | string }>) => {
        if (entry.path === '/workspace/.gitignore') {
          return [{ path: entry.path, bytesWritten: String(entry.data).length, error: null }];
        }

        expect(entry.path).toBe('/workspace/skills/package.zip');
        if (!(entry.data instanceof ReadableStream)) {
          throw new Error('Expected package upload to use a ReadableStream');
        }

        const chunks: Buffer[] = [];
        for await (const chunk of entry.data) {
          chunks.push(Buffer.from(chunk));
        }
        uploaded = Buffer.concat(chunks);

        return [{ path: entry.path, bytesWritten: uploaded.length, error: null }];
      })
    };
    const baseContext = {
      sandbox: sandbox as any,
      workDirectory: '/workspace'
    };

    await deploySkillPackage({
      storageKey: 'version.zip',
      skillsRootPath: '/workspace/skills'
    })(baseContext);

    expect(mocks.downloadSkillPackageStream).toHaveBeenCalledWith({ storageKey: 'version.zip' });
    expect(uploaded.toString()).toBe('chunk-1chunk-2');
    expect(source.destroyed).toBe(true);
    expect(sandbox.createDirectories).toHaveBeenCalledWith(['/workspace/skills']);
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining('unzip -Z1'), {
      workingDirectory: '/workspace'
    });
    expect(sandbox.deleteFiles).toHaveBeenCalledWith(['/workspace/skills/package.zip']);
    expect(sandbox.getFileInfo).toHaveBeenCalledWith(['/workspace/.gitignore']);
    expect(sandbox.writeFiles).toHaveBeenLastCalledWith([
      {
        path: '/workspace/.gitignore',
        data: expect.stringContaining('node_modules')
      }
    ]);
  });

  it('destroys an unconsumed S3 stream when sandbox upload fails', async () => {
    const source = Readable.from([Buffer.from('content')]);
    mocks.downloadSkillPackageStream.mockResolvedValue(source);
    const sandbox = {
      createDirectories: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockResolvedValue(successResult),
      writeFiles: vi.fn().mockResolvedValue([
        {
          path: '/workspace/skills/package.zip',
          bytesWritten: 0,
          error: new Error('upload failed')
        }
      ])
    };
    await expect(
      deploySkillPackage({ storageKey: 'version.zip', skillsRootPath: '/workspace/skills' })({
        sandbox: sandbox as any,
        workDirectory: '/workspace'
      })
    ).rejects.toThrow('Failed to write skill package ZIP');
    expect(source.destroyed).toBe(true);
  });
});

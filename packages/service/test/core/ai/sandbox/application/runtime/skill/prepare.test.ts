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
      execute: vi.fn().mockResolvedValue(successResult),
      writeFiles: vi.fn(async ([entry]: Array<{ path: string; data: ReadableStream }>) => {
        expect(entry.path).toBe('/workspace/skills/package.zip');
        expect(entry.data).toBeInstanceOf(ReadableStream);

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
    expect(sandbox.execute.mock.calls.at(-1)?.[0]).toContain('unzip -Z1');
  });

  it('destroys an unconsumed S3 stream when sandbox upload fails', async () => {
    const source = Readable.from([Buffer.from('content')]);
    mocks.downloadSkillPackageStream.mockResolvedValue(source);
    const sandbox = {
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

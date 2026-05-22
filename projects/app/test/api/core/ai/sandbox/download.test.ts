import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiResponse } from 'next';
import type { SandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';

const mocks = vi.hoisted(() => ({
  addDirectoryToArchive: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

vi.mock('@/service/core/sandbox/auth', () => ({
  authSandboxSession: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/runtime', () => ({
  getSandboxClient: vi.fn()
}));

vi.mock('@/service/core/sandbox/fileService', () => ({
  addDirectoryToArchive: mocks.addDirectoryToArchive,
  getSandboxFileContent: vi.fn(),
  isSandboxPathDirectory: vi.fn()
}));

class FakeArchive extends EventEmitter {
  pipe = vi.fn();
  finalize = vi.fn(async () => undefined);
  destroy = vi.fn();
}

import { writeDirectoryArchiveResponse } from '@/pages/api/core/ai/sandbox/download';

describe('writeDirectoryArchiveResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pipes and finalizes the directory archive', async () => {
    const archive = new FakeArchive();
    const res = {} as NextApiResponse;
    const sandbox = {} as SandboxClient;
    mocks.addDirectoryToArchive.mockResolvedValueOnce(undefined);

    await writeDirectoryArchiveResponse({
      sandbox,
      archive: archive as any,
      res,
      path: '/workspace'
    });

    expect(archive.pipe).toHaveBeenCalledWith(res);
    expect(mocks.addDirectoryToArchive).toHaveBeenCalledWith(sandbox, archive, '/workspace', '');
    expect(archive.finalize).toHaveBeenCalledTimes(1);
    expect(archive.destroy).not.toHaveBeenCalled();
  });

  it('rejects archive errors instead of throwing from the event listener', async () => {
    const archive = new FakeArchive();
    const res = {} as NextApiResponse;
    const sandbox = {} as SandboxClient;
    const archiveError = new Error('zip failed');
    mocks.addDirectoryToArchive.mockImplementationOnce(async () => {
      archive.emit('error', archiveError);
    });

    await expect(
      writeDirectoryArchiveResponse({
        sandbox,
        archive: archive as any,
        res,
        path: '/workspace'
      })
    ).rejects.toThrow('zip failed');

    expect(archive.destroy).toHaveBeenCalledTimes(1);
  });
});

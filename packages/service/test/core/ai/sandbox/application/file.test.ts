import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

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

import { writeUrlFilesToSandbox } from '@fastgpt/service/core/ai/sandbox/application/file';

describe('sandbox file application', () => {
  beforeEach(() => {
    axiosMock.get.mockReset();
  });

  it('does nothing when no valid file path is provided', async () => {
    const sandbox = {
      writeFiles: vi.fn()
    };

    await writeUrlFilesToSandbox(sandbox as any, [
      { path: '', url: 'https://example.com/ignored.txt' }
    ]);

    expect(axiosMock.get).not.toHaveBeenCalled();
    expect(sandbox.writeFiles).not.toHaveBeenCalled();
  });

  it('downloads url files and writes them to sandbox', async () => {
    const first = Buffer.from('a');
    const second = Buffer.from('bc');
    axiosMock.get
      .mockResolvedValueOnce({ data: Readable.from([first]), headers: {} })
      .mockResolvedValueOnce({ data: Readable.from([second]), headers: {} });
    const sandbox = {
      writeFiles: vi.fn(async () => undefined)
    };

    await writeUrlFilesToSandbox(sandbox as any, [
      { path: '/workspace/a.txt', url: 'https://example.com/a.txt' },
      { path: '/workspace/b.txt', url: 'https://example.com/b.txt' }
    ]);

    expect(axiosMock.get).toHaveBeenCalledWith(
      'https://example.com/a.txt',
      expect.objectContaining({ responseType: 'stream' })
    );
    expect(axiosMock.get).toHaveBeenCalledWith(
      'https://example.com/b.txt',
      expect.objectContaining({ responseType: 'stream' })
    );
    expect(sandbox.writeFiles).toHaveBeenCalledWith([
      { path: '/workspace/a.txt', data: first },
      { path: '/workspace/b.txt', data: second }
    ]);
  });

  it('uses the injected reader for workflow context files', async () => {
    const sandbox = { writeFiles: vi.fn(async () => undefined) };
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

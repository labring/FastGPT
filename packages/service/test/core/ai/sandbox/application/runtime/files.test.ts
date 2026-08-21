import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

const { axiosGetMock } = vi.hoisted(() => ({
  axiosGetMock: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/api/axios')>();
  return {
    ...mod,
    axios: { get: axiosGetMock }
  };
});

describe('sandbox runtime files', () => {
  const createSandbox = () => ({
    createDirectories: vi.fn(async () => undefined),
    writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) =>
      entries.map((entry) => ({
        path: entry.path,
        bytesWritten: entry.data.length,
        error: null as Error | null
      }))
    )
  });

  it('writes input files with safe unique filenames', async () => {
    const { injectInputFilesToSandbox } =
      await import('@fastgpt/service/core/ai/sandbox/application/runtime/files');
    const sandbox = createSandbox();

    axiosGetMock.mockImplementation(async () => ({
      data: Readable.from([Buffer.from('a')]),
      headers: {}
    }));

    await injectInputFilesToSandbox(sandbox as any, [
      {
        name: 'current.pdf',
        url: 'https://files/current.pdf'
      },
      {
        name: '../current.pdf',
        url: 'https://files/unsafe-current.pdf'
      },
      {
        name: 'folder/report.txt',
        url: 'https://files/report.txt'
      },
      {
        name: '..',
        url: 'https://files/nameless'
      }
    ]);

    expect(sandbox.createDirectories).toHaveBeenCalledWith(['user_files']);
    expect(sandbox.writeFiles).toHaveBeenCalledWith([
      {
        path: 'user_files/current.pdf',
        data: Buffer.from('a')
      },
      {
        path: 'user_files/current-1.pdf',
        data: Buffer.from('a')
      },
      {
        path: 'user_files/report.txt',
        data: Buffer.from('a')
      },
      {
        path: 'user_files/file-3',
        data: Buffer.from('a')
      }
    ]);
    expect(sandbox.createDirectories.mock.invocationCallOrder[0]).toBeLessThan(
      sandbox.writeFiles.mock.invocationCallOrder[0]
    );
  });

  it('uses an injected file reader without downloading the URL', async () => {
    const { injectInputFilesToSandbox } =
      await import('@fastgpt/service/core/ai/sandbox/application/runtime/files');
    const sandbox = createSandbox();
    const readInputFile = vi.fn().mockResolvedValue(Buffer.from('private file'));
    axiosGetMock.mockClear();

    await injectInputFilesToSandbox(
      sandbox as any,
      [
        {
          name: 'private.pdf',
          url: 'https://files.example.com/private.pdf'
        }
      ],
      '/workspace/sessions/chat-1',
      readInputFile
    );

    expect(readInputFile).toHaveBeenCalledWith('https://files.example.com/private.pdf');
    expect(axiosGetMock).not.toHaveBeenCalled();
    expect(sandbox.createDirectories).toHaveBeenCalledWith([
      '/workspace/sessions/chat-1/user_files'
    ]);
    expect(sandbox.writeFiles).toHaveBeenCalledWith([
      {
        path: '/workspace/sessions/chat-1/user_files/private.pdf',
        data: Buffer.from('private file')
      }
    ]);
  });

  it('rejects input injection when any sandbox file write fails', async () => {
    const { injectInputFilesToSandbox } =
      await import('@fastgpt/service/core/ai/sandbox/application/runtime/files');
    const sandbox = createSandbox();
    sandbox.writeFiles.mockResolvedValueOnce([
      {
        path: '/workspace/user_files/broken.pdf',
        bytesWritten: 0,
        error: new Error('disk full')
      }
    ]);

    await expect(
      injectInputFilesToSandbox(
        sandbox as any,
        [{ name: 'broken.pdf', url: 'https://files.example.com/broken.pdf' }],
        '/workspace',
        async () => Buffer.from('content')
      )
    ).rejects.toThrow(
      'Failed to write sandbox input file /workspace/user_files/broken.pdf: disk full'
    );
  });
});

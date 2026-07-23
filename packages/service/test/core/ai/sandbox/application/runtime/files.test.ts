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
  it('writes input files with safe unique filenames', async () => {
    const { injectInputFilesToSandbox } =
      await import('@fastgpt/service/core/ai/sandbox/application/runtime/files');
    const sandbox = {
      writeFiles: vi.fn()
    };

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
  });

  it('uses an injected file reader without downloading the URL', async () => {
    const { injectInputFilesToSandbox } =
      await import('@fastgpt/service/core/ai/sandbox/application/runtime/files');
    const sandbox = {
      writeFiles: vi.fn()
    };
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
      readInputFile
    );

    expect(readInputFile).toHaveBeenCalledWith('https://files.example.com/private.pdf');
    expect(axiosGetMock).not.toHaveBeenCalled();
    expect(sandbox.writeFiles).toHaveBeenCalledWith([
      {
        path: 'user_files/private.pdf',
        data: Buffer.from('private file')
      }
    ]);
  });
});

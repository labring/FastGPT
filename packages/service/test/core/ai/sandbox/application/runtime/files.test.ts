import { describe, expect, it, vi } from 'vitest';

const { pickOutboundAxiosGetMock } = vi.hoisted(() => ({
  pickOutboundAxiosGetMock: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  pickOutboundAxios: () => ({
    get: pickOutboundAxiosGetMock
  })
}));

describe('sandbox runtime files', () => {
  it('writes input files with safe unique filenames', async () => {
    const { injectInputFilesToSandbox } =
      await import('@fastgpt/service/core/ai/sandbox/application/runtime/files');
    const sandbox = {
      writeFiles: vi.fn()
    };

    pickOutboundAxiosGetMock.mockResolvedValue({ data: new ArrayBuffer(1) });

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
        data: expect.any(ArrayBuffer)
      },
      {
        path: 'user_files/current-1.pdf',
        data: expect.any(ArrayBuffer)
      },
      {
        path: 'user_files/report.txt',
        data: expect.any(ArrayBuffer)
      },
      {
        path: 'user_files/file-3',
        data: expect.any(ArrayBuffer)
      }
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosMock = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  pickOutboundAxios: vi.fn(() => axiosMock)
}));

import { writeUrlFilesToSandbox } from '@fastgpt/service/core/ai/sandbox/service/file';

describe('sandbox file service', () => {
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
    const first = new ArrayBuffer(1);
    const second = new ArrayBuffer(2);
    axiosMock.get.mockResolvedValueOnce({ data: first }).mockResolvedValueOnce({ data: second });
    const sandbox = {
      writeFiles: vi.fn(async () => undefined)
    };

    await writeUrlFilesToSandbox(sandbox as any, [
      { path: '/workspace/a.txt', url: 'https://example.com/a.txt' },
      { path: '/workspace/b.txt', url: 'https://example.com/b.txt' }
    ]);

    expect(axiosMock.get).toHaveBeenCalledWith('https://example.com/a.txt', {
      responseType: 'arraybuffer'
    });
    expect(axiosMock.get).toHaveBeenCalledWith('https://example.com/b.txt', {
      responseType: 'arraybuffer'
    });
    expect(sandbox.writeFiles).toHaveBeenCalledWith([
      { path: '/workspace/a.txt', data: first },
      { path: '/workspace/b.txt', data: second }
    ]);
  });
});

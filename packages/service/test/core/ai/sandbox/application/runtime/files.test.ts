import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  buildSandboxInputFileScopeKey,
  getSandboxInputFileNameAllocation
} from '@fastgpt/service/core/ai/sandbox/utils';

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
  const createSandbox = () => {
    const files = new Map<string, string>();
    return {
      files,
      createDirectories: vi.fn(async () => undefined),
      writeFiles: vi.fn(async (entries: Array<{ path: string; data: Buffer }>) => {
        entries.forEach((entry) => files.set(entry.path, entry.data.toString('utf-8')));
        return entries.map((entry) => ({
          path: entry.path,
          bytesWritten: entry.data.length,
          error: null as Error | null
        }));
      })
    };
  };

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

  it('preserves earlier same-named files when sibling or child runs inject different URLs into a shared sandbox session', async () => {
    const { injectInputFilesToSandbox } =
      await import('@fastgpt/service/core/ai/sandbox/application/runtime/files');
    const readInputFile = async (url: string) =>
      Buffer.from(url.includes('/a/') ? 'data A' : 'data B');
    const workDirectory = '/workspace/sessions/chat-shared';
    const injectForSource = (
      sandbox: ReturnType<typeof createSandbox>,
      sourceId: string,
      file: { name: string; url: string; sandboxPath?: string },
      contextOwner?: object
    ) =>
      injectInputFilesToSandbox(
        sandbox as any,
        [file],
        workDirectory,
        readInputFile,
        getSandboxInputFileNameAllocation({
          scopeKey: buildSandboxInputFileScopeKey({
            sourceType: ChatSourceTypeEnum.app,
            sourceId,
            userId: 'user-1',
            chatId: 'chat-shared'
          }),
          contextOwner,
          sandbox,
          workDirectory
        })
      );

    // 独立沙盒身份下各自写入 user_files/report.csv 互不影响
    const sandboxA = createSandbox();
    const sandboxB = createSandbox();
    await injectForSource(sandboxA, 'child-app-a', {
      name: 'report.csv',
      url: 'https://files.example.com/a/report.csv'
    });
    await injectForSource(sandboxB, 'child-app-b', {
      name: 'report.csv',
      url: 'https://files.example.com/b/report.csv'
    });
    expect(sandboxA.files.get(`${workDirectory}/user_files/report.csv`)).toBe('data A');
    expect(sandboxB.files.get(`${workDirectory}/user_files/report.csv`)).toBe('data B');

    // 共享根沙盒身份下，不同 URL 的同名文件递增分配，保持原路径内容不被覆盖
    const sharedSandbox = createSandbox();
    const sharedFileA: { name: string; url: string; sandboxPath?: string } = {
      name: 'report.csv',
      url: 'https://files.example.com/a/report.csv'
    };
    const sharedFileB: { name: string; url: string; sandboxPath?: string } = {
      name: 'report.csv',
      url: 'https://files.example.com/b/report.csv'
    };
    await injectForSource(sharedSandbox, 'root-app', sharedFileA);
    await injectForSource(sharedSandbox, 'root-app', sharedFileB);

    expect(sharedFileA).toMatchObject({ name: 'report.csv', sandboxPath: 'user_files/report.csv' });
    expect(sharedFileB).toMatchObject({
      name: 'report-1.csv',
      sandboxPath: 'user_files/report-1.csv'
    });
    expect(sharedSandbox.files.get(`${workDirectory}/user_files/report.csv`)).toBe('data A');
    expect(sharedSandbox.files.get(`${workDirectory}/user_files/report-1.csv`)).toBe('data B');

    // 新的请求上下文（contextOwner）即使复用同一 provider 对象，也会隔离分配状态
    const nextRequestFile: { name: string; url: string; sandboxPath?: string } = {
      name: 'report.csv',
      url: 'https://files.example.com/c/report.csv'
    };
    await injectForSource(sharedSandbox, 'root-app', nextRequestFile, {});
    expect(nextRequestFile).toMatchObject({
      name: 'report.csv',
      sandboxPath: 'user_files/report.csv'
    });
  });
});

import { exec } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecuteOptions, ExecuteResult } from '@fastgpt-sdk/sandbox-adapter';
import type { SandboxListRecursiveResponse } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { Call } from '@test/utils/request';

const mockSandboxRuntimeConfig = vi.hoisted(() => {
  const state = { workDirectory: '.' };
  return {
    state,
    getSandboxRuntimeProfile: vi.fn(() => ({ workDirectory: state.workDirectory }))
  };
});

vi.mock('@/service/core/sandbox/auth', () => ({
  authSandboxSession: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/runtime', () => ({
  getSandboxClient: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/profile', () => ({
  getSandboxRuntimeProfile: mockSandboxRuntimeConfig.getSandboxRuntimeProfile
}));

import handler from '@/pages/api/core/ai/sandbox/listRecursive';
import { authSandboxSession } from '@/service/core/sandbox/auth';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';

/**
 * 构造一个会真实执行 shell 命令的 sandbox 替身。
 * API handler、入参解析、鉴权调用和 fileService 都走真实路径，仅把远端 sandbox 换成本地临时目录。
 */
function createLocalSandbox(tempDir: string) {
  const execute = vi.fn(
    (command: string, options?: ExecuteOptions) =>
      new Promise<ExecuteResult>((resolve) => {
        exec(
          command,
          {
            cwd: tempDir,
            timeout: options?.timeoutMs,
            maxBuffer: options?.maxOutputBytes ?? 1024 * 1024
          },
          (error, stdout, stderr) => {
            const exitCode =
              typeof (error as NodeJS.ErrnoException | null)?.code === 'number'
                ? ((error as NodeJS.ErrnoException).code as number)
                : error
                  ? 1
                  : 0;

            resolve({
              stdout,
              stderr,
              exitCode,
              truncated:
                (error as NodeJS.ErrnoException | null)?.code ===
                'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
            });
          }
        );
      })
  );

  return {
    sandbox: {
      ensureAvailable: vi.fn().mockResolvedValue(undefined),
      provider: {
        execute
      }
    },
    execute
  };
}

describe('sandbox/listRecursive api', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), 'fastgpt-sandbox-list-'));
    mockSandboxRuntimeConfig.state.workDirectory = tempDir;

    await mkdir(join(tempDir, 'src/components'), { recursive: true });
    await mkdir(join(tempDir, 'src/nested'), { recursive: true });
    await mkdir(join(tempDir, 'node_modules/pkg'), { recursive: true });

    await writeFile(join(tempDir, 'README.md'), '# FastGPT');
    await writeFile(join(tempDir, 'src/index.ts'), 'console.log("hi");');
    await writeFile(
      join(tempDir, 'src/components/Button.tsx'),
      'export const Button = () => null;'
    );
    await writeFile(join(tempDir, 'src/nested/deep.txt'), 'deep');
    await writeFile(join(tempDir, 'node_modules/pkg/hidden.js'), 'hidden');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('通过 API handler 真实执行一次目录扫描并返回可渲染文件树', async () => {
    const { sandbox, execute } = createLocalSandbox(tempDir);
    vi.mocked(authSandboxSession).mockResolvedValue({
      uid: 'user-id',
      teamId: 'team-id'
    });
    vi.mocked(getSandboxClient).mockResolvedValue(sandbox as any);

    const res = await Call<unknown, unknown, SandboxListRecursiveResponse>(handler, {
      body: {
        appId: '68ad85a7463006c963799a05',
        chatId: 'chat-id',
        path: '.',
        excludeNames: ['node_modules'],
        maxDepth: 20
      }
    });

    expect(res.code).toBe(200);
    expect(vi.mocked(authSandboxSession)).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: '68ad85a7463006c963799a05',
        chatId: 'chat-id'
      })
    );
    expect(vi.mocked(getSandboxClient)).toHaveBeenCalledWith({
      appId: '68ad85a7463006c963799a05',
      userId: 'user-id',
      chatId: 'chat-id',
      teamId: 'team-id'
    });
    expect(sandbox.ensureAvailable).toHaveBeenCalledOnce();
    expect(mockSandboxRuntimeConfig.getSandboxRuntimeProfile).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][0]).toContain('find');
    expect(execute.mock.calls[0][0]).toContain(tempDir);
    expect(execute.mock.calls[0][0]).toContain("-name 'node_modules'");
    expect(execute.mock.calls[0][0]).toContain('-exec sh -c');

    expect(res.data).toEqual({
      files: [
        {
          name: 'src',
          path: 'src',
          type: 'directory',
          level: 0,
          loaded: true,
          children: [
            {
              name: 'components',
              path: 'src/components',
              type: 'directory',
              level: 1,
              loaded: true,
              children: [
                {
                  name: 'Button.tsx',
                  path: 'src/components/Button.tsx',
                  type: 'file',
                  size: expect.any(Number),
                  level: 2
                }
              ]
            },
            {
              name: 'nested',
              path: 'src/nested',
              type: 'directory',
              level: 1,
              loaded: true,
              children: [
                {
                  name: 'deep.txt',
                  path: 'src/nested/deep.txt',
                  type: 'file',
                  size: expect.any(Number),
                  level: 2
                }
              ]
            },
            {
              name: 'index.ts',
              path: 'src/index.ts',
              type: 'file',
              size: expect.any(Number),
              level: 1
            }
          ]
        },
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          size: expect.any(Number),
          level: 0
        }
      ],
      expandedPaths: ['src']
    });
    expect(JSON.stringify(res.data.files)).not.toContain('node_modules');
  });
});

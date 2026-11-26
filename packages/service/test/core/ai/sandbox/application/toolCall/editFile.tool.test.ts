import { describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import type { PreparedSandboxRuntime } from '@fastgpt/service/core/ai/sandbox/application/runtime/type';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import { sandboxEditFileTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/editFile.tool';
import { createToolRunner } from '@fastgpt/service/core/ai/sandbox/application/toolCall/type';
import { SANDBOX_PROVIDER } from '@fastgpt/service/core/ai/sandbox/type';

const createSandboxInstance = () =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    runWithRecovery: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    resolveRuntimePath: vi.fn((path: string) => path),
    opensandbox: {
      replaceContent: vi.fn(async (entries: { path: string }[]) =>
        entries.map((entry) => ({ path: entry.path, status: 'replaced', replacedCount: 1 }))
      )
    }
  }) as any;

describe('sandboxEditFileTool', () => {
  it('edits files through createToolRunner and centralizes ensureAvailable inside runWithRecovery', async () => {
    const sandbox = createSandboxInstance();

    await expect(
      createToolRunner(sandboxEditFileTool)({
        sandboxInstance: sandbox,
        input: {
          entries: [{ path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' }]
        }
      })
    ).resolves.toEqual({
      success: true,
      input: {
        entries: [{ path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' }]
      },
      response: 'Files edited successfully: /workspace/a.txt'
    });

    expect(sandbox.runWithRecovery).toHaveBeenCalledWith(expect.any(Function), undefined);
    expect(sandbox.ensureAvailable).not.toHaveBeenCalled();
    expect(sandbox.opensandbox.replaceContent).toHaveBeenCalledWith([
      { path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' }
    ]);
  });

  it.each([
    {
      results: [{ path: '/workspace/a.txt', status: 'unmatched' }],
      lines: ['Edit 1 not applied (oldContent not found): /workspace/a.txt']
    },
    {
      results: [{ path: '/workspace/a.txt', status: 'unknown' }],
      lines: ['Edit 1 result unknown (replacement count unavailable): /workspace/a.txt']
    },
    {
      results: [
        { path: '/workspace/a.txt', status: 'replaced', replacedCount: 1 },
        { path: '/workspace/b.txt', status: 'unknown' },
        { path: '/workspace/a.txt', status: 'unmatched' },
        { path: '/workspace/a.txt', status: 'skipped' }
      ],
      lines: [
        'Edit 1 applied (replacement count: 1): /workspace/a.txt',
        'Edit 2 result unknown (replacement count unavailable): /workspace/b.txt',
        'Edit 3 not applied (oldContent not found): /workspace/a.txt',
        'Edit 4 skipped (an earlier edit did not match): /workspace/a.txt'
      ]
    }
  ])('returns business outcomes as ordinary tool responses: $lines', async ({ results, lines }) => {
    const sandbox = createSandboxInstance();
    sandbox.opensandbox.replaceContent = vi.fn(async () => results);
    const input = {
      entries: results.map(({ path }) => ({ path, oldContent: 'old', newContent: 'new' }))
    };

    await expect(
      createToolRunner(sandboxEditFileTool)({
        sandboxInstance: sandbox,
        input
      })
    ).resolves.toEqual({
      success: true,
      input,
      response: [...lines, 'Read the files to verify their current contents before retrying.'].join(
        '\n'
      )
    });
  });

  it('propagates real provider exceptions to the Agent error handling', async () => {
    const sandbox = createSandboxInstance();
    const error = new Error('permission denied');
    sandbox.opensandbox.replaceContent.mockRejectedValueOnce(error);

    await expect(
      createToolRunner(sandboxEditFileTool)({
        sandboxInstance: sandbox,
        input: {
          entries: [{ path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' }]
        }
      })
    ).rejects.toBe(error);
  });

  it('recovers and retries edit tool execution through real SandboxClient.runWithRecovery', async () => {
    const query = {
      sandboxId: 'sandbox-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      userId: 'user-1',
      chatId: 'chat-1'
    };
    const brokenSandbox = {
      id: 'remote-1',
      close: vi.fn(async () => undefined),
      createDirectories: vi.fn(async () => undefined),
      replaceContent: vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))
    };
    const recoveredSandbox = {
      id: 'remote-2',
      close: vi.fn(async () => undefined),
      createDirectories: vi.fn(async () => undefined),
      replaceContent: vi.fn(async (entries: { path: string }[]) =>
        entries.map((entry) => ({ path: entry.path, status: 'replaced', replacedCount: 1 }))
      )
    };
    const initialRuntime = {
      resource: {
        ...query,
        provider: SANDBOX_PROVIDER,
        status: SandboxInstanceStatusEnum.running,
        teamId: 'team-1'
      },
      opensandbox: brokenSandbox
    } as unknown as PreparedSandboxRuntime;
    const recoveredRuntime = {
      resource: {
        ...query,
        provider: SANDBOX_PROVIDER,
        status: SandboxInstanceStatusEnum.running,
        teamId: 'team-1'
      },
      opensandbox: recoveredSandbox
    } as unknown as PreparedSandboxRuntime;

    let currentRuntime = initialRuntime;
    const prepare = vi.fn(async (_connection, options?: { verifyHealth?: boolean }) => {
      if (options?.verifyHealth) {
        currentRuntime = recoveredRuntime;
      }
      return currentRuntime;
    });
    const sandbox = new SandboxClient({
      query,
      runtime: initialRuntime,
      prepare
    });

    await expect(
      createToolRunner(sandboxEditFileTool)({
        sandboxInstance: sandbox,
        input: {
          entries: [{ path: '/home/sandbox/workspace/a.txt', oldContent: 'old', newContent: 'new' }]
        }
      })
    ).resolves.toMatchObject({
      success: true,
      response: 'Files edited successfully: /home/sandbox/workspace/a.txt'
    });
    expect(prepare).toHaveBeenCalledWith(expect.anything(), { verifyHealth: true });
    expect(brokenSandbox.close).toHaveBeenCalled();
    expect(recoveredSandbox.replaceContent).toHaveBeenCalledWith([
      {
        path: '/home/sandbox/workspace/a.txt',
        oldContent: 'old',
        newContent: 'new'
      }
    ]);
  });
});

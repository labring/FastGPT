import { describe, expect, it, vi } from 'vitest';
import { sandboxEditFileTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/editFile.tool';

const createSandboxInstance = () =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    resolveRuntimePath: vi.fn((path: string) => path),
    provider: {
      replaceContent: vi.fn(async (entries: { path: string }[]) =>
        entries.map((entry) => ({ path: entry.path, replacedCount: 1, error: null }))
      )
    }
  }) as any;

describe('sandboxEditFileTool', () => {
  it('edits files through the provider', async () => {
    const sandbox = createSandboxInstance();

    await expect(
      sandboxEditFileTool.execute({
        sandboxInstance: sandbox,
        params: {
          entries: [{ path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' }]
        }
      })
    ).resolves.toEqual({ response: 'Files edited successfully: /workspace/a.txt' });

    expect(sandbox.ensureAvailable).toHaveBeenCalledTimes(1);
    expect(sandbox.provider.replaceContent).toHaveBeenCalledWith([
      { path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' }
    ]);
  });

  it.each([
    {
      counts: [0],
      response: 'Edit 1 not applied (oldContent not found): /workspace/a.txt'
    },
    {
      counts: [null],
      response:
        'Edit 1 result unknown (replacement count unavailable): /workspace/a.txt. Read the file to verify before retrying.'
    },
    {
      counts: [1, 0, null],
      response: [
        'Edit 1 applied (replacement count: 1): /workspace/a.txt',
        'Edit 2 not applied (oldContent not found): /workspace/a.txt',
        'Edit 3 result unknown (replacement count unavailable): /workspace/a.txt. Read the file to verify before retrying.'
      ].join('\n')
    }
  ])('reports each entry accurately for counts $counts', async ({ counts, response }) => {
    const sandbox = createSandboxInstance();
    sandbox.provider.replaceContent = vi.fn(async () =>
      counts.map((replacedCount) => ({ path: '/workspace/a.txt', replacedCount, error: null }))
    );

    await expect(
      sandboxEditFileTool.execute({
        sandboxInstance: sandbox,
        params: {
          entries: counts.map(() => ({
            path: '/workspace/a.txt',
            oldContent: 'old',
            newContent: 'new'
          }))
        }
      })
    ).resolves.toEqual({ response });
  });

  it('reports a provider entry error instead of claiming success', async () => {
    const sandbox = createSandboxInstance();
    sandbox.provider.replaceContent = vi.fn(async () => [
      { path: '/workspace/a.txt', replacedCount: null, error: new Error('permission denied') }
    ]);

    await expect(
      sandboxEditFileTool.execute({
        sandboxInstance: sandbox,
        params: {
          entries: [{ path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' }]
        }
      })
    ).resolves.toEqual({ response: 'Edit 1 failed: /workspace/a.txt: permission denied' });
  });
});

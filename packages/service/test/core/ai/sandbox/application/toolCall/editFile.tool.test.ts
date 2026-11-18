import { describe, expect, it, vi } from 'vitest';
import { sandboxEditFileTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/editFile.tool';
import { createToolRunner } from '@fastgpt/service/core/ai/sandbox/application/toolCall/type';

const createSandboxInstance = () =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    resolveRuntimePath: vi.fn((path: string) => path),
    provider: {
      replaceContent: vi.fn(async (entries: { path: string }[]) =>
        entries.map((entry) => ({ path: entry.path, status: 'replaced', replacedCount: 1 }))
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
    sandbox.provider.replaceContent = vi.fn(async () => results);
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
    sandbox.provider.replaceContent.mockRejectedValueOnce(error);

    await expect(
      createToolRunner(sandboxEditFileTool)({
        sandboxInstance: sandbox,
        input: {
          entries: [{ path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' }]
        }
      })
    ).rejects.toBe(error);
  });
});

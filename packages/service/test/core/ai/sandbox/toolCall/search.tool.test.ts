import { describe, expect, it, vi } from 'vitest';
import { sandboxSearchTool } from '@fastgpt/service/core/ai/sandbox/toolCall/search.tool';

const createSandboxInstance = () =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    provider: {
      search: vi.fn(async () => ['plain.txt', { path: 'object.txt' }])
    }
  }) as any;

describe('sandboxSearchTool', () => {
  it('searches sandbox files and normalizes provider results', async () => {
    const sandbox = createSandboxInstance();

    const result = await sandboxSearchTool.execute({
      appId: 'app',
      userId: 'user',
      chatId: 'chat',
      sandboxInstance: sandbox,
      params: { pattern: 'needle', path: '/workspace' }
    });

    expect(JSON.parse(result.response)).toEqual(['plain.txt', 'object.txt']);
    expect(sandbox.ensureAvailable).toHaveBeenCalledTimes(1);
    expect(sandbox.provider.search).toHaveBeenCalledWith('needle', '/workspace');
  });

  it('treats empty provider search results as an empty list', async () => {
    const sandbox = createSandboxInstance();
    sandbox.provider.search.mockResolvedValueOnce(undefined);

    const result = await sandboxSearchTool.execute({
      appId: 'app',
      userId: 'user',
      chatId: 'chat',
      sandboxInstance: sandbox,
      params: { pattern: 'needle' }
    });

    expect(JSON.parse(result.response)).toEqual([]);
    expect(sandbox.provider.search).toHaveBeenCalledWith('needle', undefined);
  });
});

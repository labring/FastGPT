import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  runToolStream: vi.fn(),
  getTool: vi.fn()
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: {
    runToolStream: mocks.runToolStream,
    getTool: mocks.getTool
  }
}));

import {
  getSystemToolWithVersionFallback,
  isSystemToolVersionMissingError,
  runSystemToolStreamWithVersionFallback
} from '@fastgpt/service/core/app/tool/systemTool/runtime';

describe('system tool runtime version fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects tool version missing errors', () => {
    expect(isSystemToolVersionMissingError(new Error('Tool version not found'))).toBe(true);
    expect(isSystemToolVersionMissingError('tool does not exist')).toBe(true);
    expect(isSystemToolVersionMissingError({ error: 'version 不存在' })).toBe(true);
    expect(isSystemToolVersionMissingError('network timeout')).toBe(false);
  });

  it('retries tool metadata with latest version when saved version is missing', async () => {
    mocks.getTool
      .mockRejectedValueOnce(new Error('Tool version not found'))
      .mockResolvedValueOnce({ pluginId: 'search', version: '2.0.0' });

    const result = await getSystemToolWithVersionFallback({
      pluginId: 'search',
      version: '1.0.0',
      source: 'system'
    });

    expect(result).toEqual({ pluginId: 'search', version: '2.0.0' });
    expect(mocks.getTool).toHaveBeenNthCalledWith(1, {
      pluginId: 'search',
      version: '1.0.0',
      source: 'system'
    });
    expect(mocks.getTool).toHaveBeenNthCalledWith(2, {
      pluginId: 'search',
      version: undefined,
      source: 'system'
    });
  });

  it('retries tool execution with latest version when saved version is missing', async () => {
    mocks.runToolStream
      .mockResolvedValueOnce({ error: 'Tool version not found' })
      .mockResolvedValueOnce({ output: { ok: true } });

    const params = {
      pluginId: 'search',
      version: '1.0.0',
      source: 'system',
      input: {},
      secrets: {},
      systemVar: {}
    };

    const result = await runSystemToolStreamWithVersionFallback(params);

    expect(result).toEqual({ output: { ok: true } });
    expect(mocks.runToolStream).toHaveBeenNthCalledWith(1, params);
    expect(mocks.runToolStream).toHaveBeenNthCalledWith(2, {
      ...params,
      version: ''
    });
  });

  it('keeps non-version runtime errors unchanged', async () => {
    mocks.runToolStream.mockResolvedValueOnce({ error: 'permission denied' });

    const result = await runSystemToolStreamWithVersionFallback({
      pluginId: 'search',
      version: '1.0.0',
      source: 'system',
      input: {},
      secrets: {},
      systemVar: {}
    });

    expect(result).toEqual({ error: 'permission denied' });
    expect(mocks.runToolStream).toHaveBeenCalledTimes(1);
  });
});

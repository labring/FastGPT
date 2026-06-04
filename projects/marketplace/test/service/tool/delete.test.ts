import { beforeEach, describe, expect, it, vi } from 'vitest';

const repoMocks = vi.hoisted(() => ({
  deleteToolVersion: vi.fn()
}));

const dataMocks = vi.hoisted(() => ({
  refreshToolList: vi.fn()
}));

vi.mock('../../../src/service/plugin/repo', () => ({
  pluginRepo: repoMocks
}));

vi.mock('../../../src/service/tool/data', () => dataMocks);

describe('deleteMarketplacePkg', () => {
  beforeEach(() => {
    repoMocks.deleteToolVersion.mockReset();
    dataMocks.refreshToolList.mockReset();
  });

  it('deletes a marketplace package and refreshes cache', async () => {
    repoMocks.deleteToolVersion.mockResolvedValue({
      pluginId: 'tool-a',
      version: '1.0.0',
      source: 'official'
    });
    dataMocks.refreshToolList.mockResolvedValue(undefined);

    const { deleteMarketplacePkg } = await import('../../../src/service/tool/delete');
    const result = await deleteMarketplacePkg({
      pluginId: 'tool-a',
      version: '1.0.0'
    });

    expect(repoMocks.deleteToolVersion).toHaveBeenCalledWith({
      pluginId: 'tool-a',
      version: '1.0.0',
      source: 'official'
    });
    expect(dataMocks.refreshToolList).toHaveBeenCalled();
    expect(result).toEqual({
      pluginId: 'tool-a',
      version: '1.0.0',
      source: 'official'
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repoMocks = vi.hoisted(() => ({
  listToolVersionIndexes: vi.fn(),
  listToolManifests: vi.fn(),
  invalidateToolCache: vi.fn()
}));

const downloadMocks = vi.hoisted(() => ({
  getDownloadCounts: vi.fn()
}));

const compareVersions = (a: string, b: string) => {
  const aParts = a.split(/[.-]/).map((item) => Number(item));
  const bParts = b.split(/[.-]/).map((item) => Number(item));
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < maxLength; index++) {
    const aPart = aParts[index] ?? 0;
    const bPart = bParts[index] ?? 0;
    if (Number.isNaN(aPart) || Number.isNaN(bPart)) return a.localeCompare(b);
    if (aPart !== bPart) return aPart - bPart;
  }

  return 0;
};

vi.mock('../../../src/service/plugin/repo', () => ({
  compareVersions,
  pluginRepo: repoMocks
}));

vi.mock('../../../src/service/downloadCount', () => downloadMocks);

const createManifest = ({
  pluginId = 'tool-a',
  version = '1.0.0',
  etag = `etag-${version}`,
  children = []
}: {
  pluginId?: string;
  version?: string;
  etag?: string;
  children?: Array<Record<string, unknown>>;
} = {}) => ({
  type: 'tool',
  pluginId,
  version,
  etag,
  tool: {
    type: 'tool',
    pluginId,
    version,
    etag,
    name: { en: pluginId },
    description: { en: `${pluginId} description` },
    icon: 'icon.svg',
    author: 'FastGPT',
    tags: ['search'],
    children
  },
  downloadObjectKey: `pkgs/${pluginId}/${version}.pkg`,
  downloadUrl: `https://cdn.example.com/${pluginId}/${version}.pkg`,
  readmeUrl: `https://cdn.example.com/${pluginId}/README.md`,
  filename: `${pluginId}@${version}@${etag}.pkg`,
  source: 'official',
  size: 12,
  createTime: new Date('2024-01-01T00:00:00.000Z'),
  updateTime: new Date('2024-01-02T00:00:00.000Z')
});

describe('marketplace tool data service', () => {
  beforeEach(() => {
    repoMocks.listToolVersionIndexes.mockReset();
    repoMocks.listToolManifests.mockReset();
    repoMocks.invalidateToolCache.mockReset();
    downloadMocks.getDownloadCounts.mockReset();
    Reflect.deleteProperty(globalThis, 'toolListData');
    Reflect.deleteProperty(globalThis, 'expire');
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'toolListData');
    Reflect.deleteProperty(globalThis, 'expire');
  });

  it('sorts version list by plugin id and descending version', async () => {
    repoMocks.listToolVersionIndexes.mockResolvedValue([
      { type: 'tool', pluginId: 'tool-b', version: '1.0.0', etag: 'b1' },
      { type: 'tool', pluginId: 'tool-a', version: '1.0.0', etag: 'a1' },
      { type: 'tool', pluginId: 'tool-a', version: '2.0.0', etag: 'a2' }
    ]);

    const { getToolVersionList } = await import('../../../src/service/tool/data');
    await expect(getToolVersionList('tool-a')).resolves.toEqual([
      { toolId: 'tool-a', version: '2.0.0', etag: 'a2' },
      { toolId: 'tool-a', version: '1.0.0', etag: 'a1' },
      { toolId: 'tool-b', version: '1.0.0', etag: 'b1' }
    ]);
    expect(repoMocks.listToolVersionIndexes).toHaveBeenCalledWith('tool-a');
  });

  it('maps repo manifests into parent and child marketplace tools', async () => {
    repoMocks.listToolManifests.mockResolvedValue([
      createManifest({
        children: [
          {
            id: 'child',
            name: { en: 'Child tool' },
            description: { en: 'Child description' },
            inputSchema: {},
            outputSchema: {}
          }
        ]
      })
    ]);
    downloadMocks.getDownloadCounts.mockResolvedValue(
      new Map([['tool-a', { type: 'tool', downloadCount: 7 }]])
    );

    const { getToolList } = await import('../../../src/service/tool/data');
    const list = await getToolList();

    expect(list).toMatchObject([
      {
        pluginId: 'tool-a',
        toolId: 'tool-a',
        id: 'tool-a',
        version: '1.0.0',
        isLatestVersion: true,
        isToolset: true,
        source: 'official',
        downloadCount: 7,
        downloadUrl: 'https://cdn.example.com/tool-a/1.0.0.pkg'
      },
      {
        pluginId: 'tool-a/child',
        toolId: 'tool-a/child',
        id: 'tool-a/child',
        parentId: 'tool-a',
        version: '1.0.0',
        author: 'FastGPT',
        tags: ['search'],
        source: 'official',
        downloadCount: 0,
        downloadUrl: 'https://cdn.example.com/tool-a/1.0.0.pkg'
      }
    ]);
    expect(repoMocks.listToolManifests).toHaveBeenCalledWith({ latestOnly: true });
  });

  it('uses cache for unfiltered list calls', async () => {
    repoMocks.listToolManifests.mockResolvedValue([createManifest()]);
    downloadMocks.getDownloadCounts.mockResolvedValue(new Map());

    const { getToolList } = await import('../../../src/service/tool/data');

    const first = await getToolList();
    const second = await getToolList();

    expect(first).toBe(second);
    expect(repoMocks.listToolManifests).toHaveBeenCalledTimes(1);
  });

  it('bypasses cache for explicit tool and version lookup', async () => {
    repoMocks.listToolManifests.mockResolvedValue([createManifest({ version: '2.0.0' })]);
    downloadMocks.getDownloadCounts.mockResolvedValue(new Map());

    const { getToolList } = await import('../../../src/service/tool/data');
    await getToolList({ toolId: 'tool-a', version: '2.0.0' });
    await getToolList({ toolId: 'tool-a', version: '2.0.0' });

    expect(repoMocks.listToolManifests).toHaveBeenCalledTimes(2);
    expect(repoMocks.listToolManifests).toHaveBeenCalledWith({
      toolId: 'tool-a',
      version: '2.0.0',
      latestOnly: false
    });
  });

  it('refreshes list and invalidates manifest cache', async () => {
    global.toolListData = [createManifest().tool as any];
    global.expire = new Date(Date.now() + 10000);

    const { refreshToolList } = await import('../../../src/service/tool/data');
    await refreshToolList();

    expect(global.toolListData).toEqual([]);
    expect(global.expire.getTime()).toBe(0);
    expect(repoMocks.invalidateToolCache).toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const modelMocks = vi.hoisted(() => ({
  find: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
  deleteOne: vi.fn()
}));

const s3Mocks = vi.hoisted(() => ({
  deleteObjectFromS3: vi.fn(),
  deleteObjectsByPrefixFromS3: vi.fn(),
  downloadBufferFromS3: vi.fn(),
  getPkgDownloadURLByKey: vi.fn((key: string) => `https://cdn.example.com/${key}`),
  getPkgFilename: vi.fn(({ pluginId, version, etag }) => `${pluginId}@${version}@${etag}.pkg`),
  getPkgObjectKey: vi.fn(({ source, pluginId, version, filename }) =>
    source && filename
      ? `pkgs/${source}/${filename}`
      : `pkgs/${pluginId}/${version}.pkg`
  ),
  getPluginAssetObjectKey: vi.fn(({ source, pluginId, version, etag, filePath }) =>
    [source ?? 'assets', pluginId, version, etag, ...filePath].join('/')
  ),
  getPluginAssetPrefix: vi.fn(({ source, pluginId, version, etag }) =>
    [source ?? 'assets', pluginId, version, etag].join('/')
  ),
  getPublicURLByKey: vi.fn((key: string) => `https://cdn.example.com/${key}`),
  getToolManifestObjectKey: vi.fn(
    ({ source, pluginId, version }) =>
      source
        ? `marketplace/tools/${source}/${pluginId}/${version}.json`
        : `marketplace/tools/${pluginId}/${version}.json`
  ),
  uploadJsonToS3: vi.fn()
}));

const sdkMocks = vi.hoisted(() => ({
  parsePkg: vi.fn()
}));

vi.mock('../../../src/service/mongo/models/tool', () => ({
  MarketplaceToolIndexZodSchema: {
    parse: (value: any) => ({
      ...value,
      createTime: new Date(value.createTime),
      updateTime: new Date(value.updateTime)
    })
  },
  MarketplaceToolManifestZodSchema: {
    parse: (value: any) => ({
      ...value,
      createTime: new Date(value.createTime),
      updateTime: new Date(value.updateTime)
    })
  },
  MongoMarketplaceTool: modelMocks
}));

vi.mock('../../../src/service/s3', () => s3Mocks);

vi.mock('@fastgpt/global/sdk/fastgpt-plugin', () => sdkMocks);

vi.mock('../../../src/service/logger', () => ({
  LogCategories: {
    MODULE: {
      API: 'api'
    }
  },
  getLogger: () => ({
    warning: vi.fn(),
    error: vi.fn()
  })
}));

const createIndex = ({
  pluginId = 'tool-a',
  version = '1.0.0',
  etag = `etag-${version}`,
  source,
  filename
}: {
  pluginId?: string;
  version?: string;
  etag?: string;
  source?: string;
  filename?: string;
} = {}) => ({
  type: 'tool' as const,
  pluginId,
  version,
  etag,
  ...(source ? { source } : {}),
  ...(filename ? { filename } : {}),
  createTime: new Date('2024-01-01T00:00:00.000Z'),
  updateTime: new Date('2024-01-02T00:00:00.000Z')
});

const createManifest = (index = createIndex()) => ({
  ...index,
  tool: {
    type: 'tool',
    pluginId: index.pluginId,
    version: index.version,
    etag: index.etag,
    name: { en: index.pluginId },
    description: { en: `${index.pluginId} description` }
  },
  downloadObjectKey: `pkgs/${index.pluginId}/${index.version}.pkg`,
  downloadUrl: `https://cdn.example.com/${index.pluginId}/${index.version}.pkg`,
  readmeUrl: `https://cdn.example.com/${index.pluginId}/README.md`,
  filename: `${index.pluginId}@${index.version}@${index.etag}.pkg`,
  source: index.source ?? 'official',
  size: 10
});

const mockLean = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) });

describe('PluginRepo', () => {
  beforeEach(() => {
    modelMocks.find.mockReset();
    modelMocks.findOne.mockReset();
    modelMocks.updateOne.mockReset();
    modelMocks.deleteOne.mockReset();
    Object.values(s3Mocks).forEach((mock) => {
      if (typeof mock === 'function' && 'mockClear' in mock) {
        mock.mockClear();
      }
    });
    sdkMocks.parsePkg.mockReset();
    Reflect.deleteProperty(globalThis, 'marketplacePluginManifestCache');
  });

  it('compares numeric versions segment by segment', async () => {
    const { compareVersions } = await import('../../../src/service/plugin/repo');

    expect(compareVersions('1.10.0', '1.2.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0')).toBe(0);
    expect(compareVersions('1.0.0-alpha', '1.0.0')).toBeGreaterThan(0);
  });

  it('returns only latest version per tool when no toolId filter is provided', async () => {
    modelMocks.find.mockReturnValue(
      mockLean([
        createIndex({ pluginId: 'tool-a', version: '1.0.0', etag: 'a1' }),
        createIndex({ pluginId: 'tool-a', version: '2.0.0', etag: 'a2' }),
        createIndex({ pluginId: 'tool-b', version: '1.5.0', etag: 'b1' })
      ])
    );

    const { PluginRepo } = await import('../../../src/service/plugin/repo');
    const result = await new PluginRepo().listToolVersionIndexes();

    expect(result.map(({ pluginId, version }) => `${pluginId}@${version}`)).toEqual([
      'tool-a@2.0.0',
      'tool-b@1.5.0'
    ]);
    expect(modelMocks.find).toHaveBeenCalledWith({ type: 'tool' });
  });

  it('returns all versions for a specific tool', async () => {
    modelMocks.find.mockReturnValue(
      mockLean([
        createIndex({ pluginId: 'tool-a', version: '1.0.0' }),
        createIndex({ pluginId: 'tool-a', version: '2.0.0' })
      ])
    );

    const { PluginRepo } = await import('../../../src/service/plugin/repo');
    const result = await new PluginRepo().listToolVersionIndexes('tool-a');

    expect(result).toHaveLength(2);
    expect(modelMocks.find).toHaveBeenCalledWith({ type: 'tool', pluginId: 'tool-a' });
  });

  it('loads manifest JSON from storage and caches it by etag', async () => {
    const index = createIndex({ pluginId: 'tool-a', version: '1.0.0', etag: 'etag-1' });
    const manifest = createManifest(index);
    modelMocks.find.mockReturnValue(mockLean([index]));
    s3Mocks.downloadBufferFromS3.mockResolvedValue(Buffer.from(JSON.stringify(manifest)));

    const { PluginRepo } = await import('../../../src/service/plugin/repo');
    const repo = new PluginRepo();

    await expect(repo.listToolManifests()).resolves.toEqual([manifest]);
    await expect(repo.listToolManifests()).resolves.toEqual([manifest]);

    expect(s3Mocks.downloadBufferFromS3).toHaveBeenCalledTimes(1);
    expect(s3Mocks.downloadBufferFromS3).toHaveBeenCalledWith(
      'marketplace/tools/tool-a/1.0.0.json'
    );
  });

  it('falls back to parsing pkg when manifest etag is stale', async () => {
    const index = createIndex({ pluginId: 'tool-a', version: '1.0.0', etag: 'etag-new' });
    modelMocks.find.mockReturnValue(mockLean([index]));
    s3Mocks.downloadBufferFromS3
      .mockResolvedValueOnce(Buffer.from(JSON.stringify(createManifest({ ...index, etag: 'old' }))))
      .mockResolvedValueOnce(Buffer.from('pkg-buffer'));
    sdkMocks.parsePkg.mockResolvedValue([
      {
        info: {
          type: 'tool',
          pluginId: 'tool-a',
          version: '1.0.0',
          etag: 'etag-new',
          readmeUrl: 'https://cdn.example.com/tool-a/README.md'
        }
      },
      null
    ]);

    const { PluginRepo } = await import('../../../src/service/plugin/repo');
    const [manifest] = await new PluginRepo().listToolManifests();

    expect(manifest).toMatchObject({
      pluginId: 'tool-a',
      version: '1.0.0',
      etag: 'etag-new',
      downloadObjectKey: 'pkgs/tool-a/1.0.0.pkg',
      filename: 'tool-a@1.0.0@etag-new.pkg'
    });
    expect(sdkMocks.parsePkg).toHaveBeenCalledWith({
      input: Buffer.from('pkg-buffer'),
      getAccessURL: expect.any(Function)
    });
  });

  it('publishes manifest index and deletes old assets when etag changes', async () => {
    const existing = createIndex({ pluginId: 'tool-a', version: '1.0.0', etag: 'old-etag' });
    const record = createManifest(
      createIndex({
        pluginId: 'tool-a',
        version: '1.0.0',
        etag: 'new-etag',
        source: 'official'
      })
    );
    modelMocks.findOne.mockReturnValue(mockLean(existing));
    modelMocks.updateOne.mockResolvedValue({ acknowledged: true });
    s3Mocks.uploadJsonToS3.mockResolvedValue(undefined);
    s3Mocks.deleteObjectsByPrefixFromS3.mockResolvedValue({ keys: [] });

    const { PluginRepo } = await import('../../../src/service/plugin/repo');
    await new PluginRepo().publishToolManifest(record);

    const indexFilter = {
      type: 'tool',
      pluginId: 'tool-a',
      version: '1.0.0'
    };

    expect(modelMocks.findOne).toHaveBeenCalledWith(indexFilter);
    expect(s3Mocks.uploadJsonToS3).toHaveBeenCalledWith({
      objectKey: 'marketplace/tools/official/tool-a/1.0.0.json',
      data: {
        ...record,
        createTime: existing.createTime
      }
    });
    expect(modelMocks.updateOne).toHaveBeenCalledWith(
      {
        pluginId: 'tool-a',
        version: '1.0.0'
      },
      expect.objectContaining({
        $set: expect.objectContaining({ etag: 'new-etag', source: 'official' }),
        $setOnInsert: { createTime: existing.createTime }
      }),
      { strict: false, upsert: true }
    );
    expect(s3Mocks.deleteObjectsByPrefixFromS3).toHaveBeenCalledWith(
      'assets/tool-a/1.0.0/old-etag/'
    );
  });

  it('rejects non-official manifests when the toolId already exists under another source', async () => {
    const record = createManifest(
      createIndex({
        pluginId: 'tool-a',
        version: '2.0.0',
        etag: 'new-etag',
        source: 'community'
      })
    );

    modelMocks.findOne
      .mockReturnValueOnce(mockLean(null))
      .mockReturnValueOnce(
        mockLean(createIndex({ pluginId: 'tool-a', version: '1.0.0', source: 'official' }))
      );

    const { PluginRepo } = await import('../../../src/service/plugin/repo');

    await expect(new PluginRepo().publishToolManifest(record)).rejects.toThrow(
      'Marketplace toolId already exists: tool-a'
    );

    expect(modelMocks.findOne).toHaveBeenNthCalledWith(2, {
      type: 'tool',
      pluginId: 'tool-a',
      source: { $ne: 'community' }
    });
    expect(s3Mocks.uploadJsonToS3).not.toHaveBeenCalled();
    expect(modelMocks.updateOne).not.toHaveBeenCalled();
  });

  it('deletes a tool version record, manifest, pkg and assets by source', async () => {
    const index = createIndex({
      pluginId: 'tool-a',
      version: '1.0.0',
      etag: 'etag-1',
      source: 'official',
      filename: 'tool-a@1.0.0@etag-1.pkg'
    });
    modelMocks.findOne.mockReturnValue(mockLean(index));
    modelMocks.deleteOne.mockResolvedValue({ deletedCount: 1 });
    s3Mocks.deleteObjectFromS3.mockResolvedValue(undefined);
    s3Mocks.deleteObjectsByPrefixFromS3.mockResolvedValue({ keys: [] });

    const { PluginRepo } = await import('../../../src/service/plugin/repo');
    const repo = new PluginRepo();
    const result = await repo.deleteToolVersion({
      pluginId: 'tool-a',
      version: '1.0.0',
      source: 'official'
    });

    expect(modelMocks.findOne).toHaveBeenCalledWith({
      type: 'tool',
      pluginId: 'tool-a',
      version: '1.0.0',
      $or: [{ source: 'official' }, { source: { $exists: false } }, { source: null }]
    });
    expect(modelMocks.deleteOne).toHaveBeenCalledWith({
      type: 'tool',
      pluginId: 'tool-a',
      version: '1.0.0',
      $or: [{ source: 'official' }, { source: { $exists: false } }, { source: null }]
    });
    expect(s3Mocks.deleteObjectFromS3).toHaveBeenCalledWith(
      'marketplace/tools/official/tool-a/1.0.0.json'
    );
    expect(s3Mocks.deleteObjectFromS3).toHaveBeenCalledWith(
      'pkgs/official/tool-a@1.0.0@etag-1.pkg'
    );
    expect(s3Mocks.deleteObjectsByPrefixFromS3).toHaveBeenCalledWith(
      'official/tool-a/1.0.0/etag-1/'
    );
    expect(result).toEqual({
      pluginId: 'tool-a',
      version: '1.0.0',
      source: 'official'
    });
  });

  it('rejects deleting a missing tool version before touching storage', async () => {
    modelMocks.findOne.mockReturnValue(mockLean(null));

    const { PluginRepo } = await import('../../../src/service/plugin/repo');

    await expect(
      new PluginRepo().deleteToolVersion({
        pluginId: 'tool-a',
        version: '9.9.9',
        source: 'official'
      })
    ).rejects.toThrow('Marketplace tool not found: tool-a@9.9.9');

    expect(modelMocks.deleteOne).not.toHaveBeenCalled();
    expect(s3Mocks.deleteObjectFromS3).not.toHaveBeenCalled();
    expect(s3Mocks.deleteObjectsByPrefixFromS3).not.toHaveBeenCalled();
  });

  it('uses legacy asset prefix when deleting an official record without source', async () => {
    const index = createIndex({
      pluginId: 'tool-a',
      version: '1.0.0',
      etag: 'etag-1'
    });
    modelMocks.findOne.mockReturnValue(mockLean(index));
    modelMocks.deleteOne.mockResolvedValue({ deletedCount: 1 });
    s3Mocks.deleteObjectFromS3.mockResolvedValue(undefined);
    s3Mocks.deleteObjectsByPrefixFromS3.mockResolvedValue({ keys: [] });

    const { PluginRepo } = await import('../../../src/service/plugin/repo');
    await new PluginRepo().deleteToolVersion({
      pluginId: 'tool-a',
      version: '1.0.0',
      source: 'official'
    });

    expect(s3Mocks.deleteObjectFromS3).toHaveBeenCalledWith(
      'marketplace/tools/tool-a/1.0.0.json'
    );
    expect(s3Mocks.deleteObjectsByPrefixFromS3).toHaveBeenCalledWith(
      'assets/tool-a/1.0.0/etag-1/'
    );
  });
});

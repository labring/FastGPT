import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdkMocks = vi.hoisted(() => ({
  parsePkg: vi.fn()
}));

const repoMocks = vi.hoisted(() => ({
  publishToolManifest: vi.fn()
}));

const s3Mocks = vi.hoisted(() => ({
  getPkgFilename: vi.fn(({ pluginId, version, etag }) => `${pluginId}@${version}@${etag}.pkg`),
  getPkgDownloadURLByKey: vi.fn((key: string) => `https://cdn.example.com/${key}`),
  getPkgObjectKey: vi.fn(({ source, pluginId, version, filename }) =>
    source && filename
      ? `pkgs/${source}/${filename}`
      : `pkgs/${pluginId}/${version}.pkg`
  ),
  getPluginAssetObjectKey: vi.fn(({ source, pluginId, version, etag, filePath }) =>
    [source ?? 'assets', pluginId, version, etag, ...filePath].join('/')
  ),
  getPublicURLByKey: vi.fn((key: string) => `https://cdn.example.com/${key}`),
  uploadBufferToS3: vi.fn(),
  uploadPkgToS3: vi.fn()
}));

const dataMocks = vi.hoisted(() => ({
  refreshToolList: vi.fn()
}));

vi.mock('@fastgpt/global/sdk/fastgpt-plugin', () => sdkMocks);

vi.mock('../../../src/service/plugin/repo', () => ({
  pluginRepo: repoMocks
}));

vi.mock('../../../src/service/s3', () => s3Mocks);

vi.mock('../../../src/service/tool/data', () => dataMocks);

vi.mock('../../../src/service/mongo/models/tool', () => ({
  MarketplaceToolManifestZodSchema: { parse: (value: unknown) => value }
}));

const createFile = (filename: string, body: string, contentType = 'text/plain') => ({
  filename,
  contentType,
  stream: Readable.from([body])
});

const createToolInfo = () => ({
  type: 'tool',
  pluginId: 'tool-a',
  version: '1.2.3',
  etag: 'etag-123',
  name: { en: 'Tool A' },
  description: { en: 'Tool A description' },
  readmeUrl: 'https://cdn.example.com/assets/tool-a/README.md'
});

describe('uploadMarketplacePkg', () => {
  beforeEach(() => {
    sdkMocks.parsePkg.mockReset();
    repoMocks.publishToolManifest.mockReset();
    Object.values(s3Mocks).forEach((mock) => {
      if (typeof mock === 'function' && 'mockClear' in mock) {
        mock.mockClear();
      }
    });
    dataMocks.refreshToolList.mockReset();
  });

  it('uploads pkg, parsed assets, publishes manifest and refreshes cache', async () => {
    const tool = createToolInfo();
    sdkMocks.parsePkg.mockResolvedValue([
      {
        info: tool,
        files: {
          readme: createFile('README.md', '# readme'),
          logos: [createFile('logo.svg', '<svg />', 'image/svg+xml')],
          assets: [createFile('docs/guide.md', 'guide')]
        }
      },
      null
    ]);
    s3Mocks.uploadPkgToS3.mockResolvedValue(undefined);
    s3Mocks.uploadBufferToS3.mockResolvedValue(undefined);
    repoMocks.publishToolManifest.mockResolvedValue(undefined);
    dataMocks.refreshToolList.mockResolvedValue(undefined);

    const { uploadMarketplacePkg } = await import('../../../src/service/tool/upload');
    const result = await uploadMarketplacePkg({
      buffer: Buffer.from('pkg'),
      source: 'official'
    });

    expect(sdkMocks.parsePkg).toHaveBeenCalledWith({
      input: Buffer.from('pkg'),
      getAccessURL: expect.any(Function)
    });
    expect(s3Mocks.uploadPkgToS3).toHaveBeenCalledWith({
      objectKey: 'pkgs/official/tool-a@1.2.3@etag-123.pkg',
      buffer: Buffer.from('pkg'),
      filename: 'tool-a@1.2.3@etag-123.pkg'
    });
    expect(s3Mocks.uploadBufferToS3).toHaveBeenCalledTimes(3);
    expect(s3Mocks.uploadBufferToS3).toHaveBeenCalledWith({
      objectKey: 'official/tool-a/1.2.3/etag-123/README.md',
      buffer: Buffer.from('# readme'),
      filename: 'README.md',
      contentType: 'text/plain'
    });
    expect(repoMocks.publishToolManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool',
        pluginId: 'tool-a',
        version: '1.2.3',
        etag: 'etag-123',
        source: 'official',
        downloadObjectKey: 'pkgs/official/tool-a@1.2.3@etag-123.pkg',
        downloadUrl: 'https://cdn.example.com/pkgs/official/tool-a@1.2.3@etag-123.pkg',
        filename: 'tool-a@1.2.3@etag-123.pkg',
        size: 3
      })
    );
    expect(dataMocks.refreshToolList).toHaveBeenCalled();
    expect(result).toEqual({
      pluginId: 'tool-a',
      version: '1.2.3',
      etag: 'etag-123',
      source: 'official',
      downloadUrl: 'https://cdn.example.com/pkgs/official/tool-a@1.2.3@etag-123.pkg',
      tool
    });
  });

  it('formats parser reason when pkg parsing fails', async () => {
    sdkMocks.parsePkg.mockResolvedValue([null, { reason: 'Invalid manifest' }]);

    const { uploadMarketplacePkg } = await import('../../../src/service/tool/upload');

    await expect(uploadMarketplacePkg({ buffer: Buffer.from('bad pkg') })).rejects.toThrow(
      'Invalid manifest'
    );
    expect(s3Mocks.uploadPkgToS3).not.toHaveBeenCalled();
    expect(repoMocks.publishToolManifest).not.toHaveBeenCalled();
  });

  it('rejects unsupported pkg types', async () => {
    sdkMocks.parsePkg.mockResolvedValue([
      {
        info: {
          type: 'app',
          pluginId: 'app-a',
          version: '1.0.0',
          etag: 'etag'
        },
        files: {}
      },
      null
    ]);

    const { uploadMarketplacePkg } = await import('../../../src/service/tool/upload');

    await expect(uploadMarketplacePkg({ buffer: Buffer.from('pkg') })).rejects.toThrow(
      'Unsupported plugin type: app'
    );
    expect(s3Mocks.uploadPkgToS3).not.toHaveBeenCalled();
  });
});

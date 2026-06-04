import { parsePkg, type ToolDetailType } from '@fastgpt/global/sdk/fastgpt-plugin';
import {
  MarketplaceToolIndexZodSchema,
  MarketplaceToolManifestZodSchema,
  MongoMarketplaceTool,
  type MarketplaceToolIndexSchemaType,
  type MarketplaceToolManifestSchemaType
} from '../mongo/models/tool';
import {
  deleteObjectFromS3,
  deleteObjectsByPrefixFromS3,
  downloadBufferFromS3,
  getPkgFilename,
  getPkgDownloadURLByKey,
  getPkgObjectKey,
  getPluginAssetObjectKey,
  getPluginAssetPrefix,
  getPublicURLByKey,
  getToolManifestObjectKey,
  uploadJsonToS3
} from '../s3';
import { getLogger, LogCategories } from '../logger';
import { MarketplaceOfficialSource } from '@fastgpt/global/openapi/core/plugin/marketplace/api';

const logger = getLogger(LogCategories.MODULE.API);

type ToolIndexFilter = {
  toolId?: string;
  version?: string;
};

type ToolListParams = ToolIndexFilter & {
  latestOnly?: boolean;
};

const getSourceFilter = (source: string) => {
  if (source === MarketplaceOfficialSource) {
    return {
      $or: [{ source }, { source: { $exists: false } }, { source: null }]
    };
  }

  return { source };
};

declare global {
  // eslint-disable-next-line no-var
  var marketplacePluginManifestCache:
    | Map<string, MarketplaceToolManifestSchemaType>
    | undefined;
}

const getManifestCache = () => {
  if (!global.marketplacePluginManifestCache) {
    global.marketplacePluginManifestCache = new Map();
  }
  return global.marketplacePluginManifestCache;
};

const getCacheKey = (
  index: Pick<MarketplaceToolIndexSchemaType, 'pluginId' | 'version' | 'etag' | 'source'>
) =>
  `${index.source ?? MarketplaceOfficialSource}:${index.pluginId}:${index.version}:${index.etag}`;

const getIndexSource = (index: Pick<MarketplaceToolIndexSchemaType, 'source'>) =>
  index.source ?? MarketplaceOfficialSource;

export const compareVersions = (a: string, b: string) => {
  const aParts = a.split(/[.-]/).map((item) => Number(item));
  const bParts = b.split(/[.-]/).map((item) => Number(item));
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < maxLength; index++) {
    const aPart = aParts[index] ?? 0;
    const bPart = bParts[index] ?? 0;
    if (Number.isNaN(aPart) || Number.isNaN(bPart)) {
      return a.localeCompare(b);
    }
    if (aPart !== bPart) return aPart - bPart;
  }

  return 0;
};

const getLatestToolIndexes = (indexes: MarketplaceToolIndexSchemaType[]) => {
  const latestIndexMap = new Map<string, MarketplaceToolIndexSchemaType>();

  for (const index of indexes) {
    const latestKey = index.pluginId;
    const existing = latestIndexMap.get(latestKey);
    if (!existing || compareVersions(index.version, existing.version) > 0) {
      latestIndexMap.set(latestKey, index);
    }
  }

  return Array.from(latestIndexMap.values()).sort((a, b) => {
    return a.pluginId.localeCompare(b.pluginId);
  });
};

export class PluginRepo {
  async listToolIndexes(filter: ToolIndexFilter = {}) {
    const indexes = await MongoMarketplaceTool.find({
      type: 'tool',
      ...(filter.toolId ? { pluginId: filter.toolId } : {}),
      ...(filter.version ? { version: filter.version } : {})
    }).lean();

    return indexes.map((index) => MarketplaceToolIndexZodSchema.parse(index));
  }

  async getToolIndex({ pluginId, version }: { pluginId: string; version: string }) {
    const index = await MongoMarketplaceTool.findOne({
      type: 'tool',
      pluginId,
      version
    }).lean();

    return index ? MarketplaceToolIndexZodSchema.parse(index) : null;
  }

  async deleteToolVersion({
    pluginId,
    version,
    source = MarketplaceOfficialSource
  }: {
    pluginId: string;
    version: string;
    source?: string;
  }) {
    const index = await MongoMarketplaceTool.findOne({
      type: 'tool',
      pluginId,
      version,
      ...getSourceFilter(source)
    }).lean();

    if (!index) {
      throw new Error(`Marketplace tool not found: ${pluginId}@${version}`);
    }

    const parsedIndex = MarketplaceToolIndexZodSchema.parse(index);
    const manifestObjectKey = getToolManifestObjectKey(parsedIndex);
    const pkgObjectKey = getPkgObjectKey(parsedIndex);

    await MongoMarketplaceTool.deleteOne({
      type: 'tool',
      pluginId,
      version,
      ...getSourceFilter(source)
    });

    await Promise.all([
      deleteObjectFromS3(manifestObjectKey).catch((error) => {
        logger.error('Delete marketplace tool manifest failed', {
          pluginId,
          version,
          source,
          objectKey: manifestObjectKey,
          error
        });
      }),
      deleteObjectFromS3(pkgObjectKey).catch((error) => {
        logger.error('Delete marketplace tool pkg failed', {
          pluginId,
          version,
          source,
          objectKey: pkgObjectKey,
          error
        });
      }),
      this.deleteToolAssets({
        source: parsedIndex.source,
        pluginId,
        version,
        etag: parsedIndex.etag
      })
    ]);

    this.invalidateToolCache({
      pluginId,
      version
    });

    return {
      pluginId,
      version,
      source
    };
  }

  private async ensureNonOfficialToolIdAvailable(record: MarketplaceToolManifestSchemaType) {
    if (record.source === MarketplaceOfficialSource) return;

    const existing = await MongoMarketplaceTool.findOne({
      type: 'tool',
      pluginId: record.pluginId,
      source: { $ne: record.source }
    }).lean();

    if (existing) {
      throw new Error(`Marketplace toolId already exists: ${record.pluginId}`);
    }
  }

  async listToolVersionIndexes(toolId?: string) {
    const indexes = await this.listToolIndexes(toolId ? { toolId } : {});
    return toolId ? indexes : getLatestToolIndexes(indexes);
  }

  async listToolManifests(params: ToolListParams = {}) {
    const indexes = await this.listToolIndexes({
      toolId: params.toolId,
      version: params.version
    });
    const displayIndexes = params.latestOnly === false ? indexes : getLatestToolIndexes(indexes);

    return Promise.all(displayIndexes.map((index) => this.getToolManifest(index)));
  }

  async publishToolManifest(record: MarketplaceToolManifestSchemaType) {
    const existing = await this.getToolIndex({
      pluginId: record.pluginId,
      version: record.version
    });
    const recordToPublish = existing ? { ...record, createTime: existing.createTime } : record;
    const manifestObjectKey = getToolManifestObjectKey(record);

    await this.ensureNonOfficialToolIdAvailable(record);

    await uploadJsonToS3({
      objectKey: manifestObjectKey,
      data: recordToPublish
    });

    await MongoMarketplaceTool.updateOne(
      {
        pluginId: record.pluginId,
        version: record.version
      },
      {
        $set: {
          type: record.type,
          pluginId: record.pluginId,
          version: record.version,
          etag: record.etag,
          source: record.source,
          filename: record.filename,
          updateTime: record.updateTime
        },
        $setOnInsert: {
          createTime: recordToPublish.createTime
        },
        $unset: {
          tool: '',
          downloadObjectKey: '',
          downloadUrl: '',
          readmeUrl: '',
          size: ''
        }
      },
      {
        strict: false,
        upsert: true
      }
    );

    this.invalidateToolCache({
      pluginId: record.pluginId,
      version: record.version
    });

    if (existing && existing.etag !== record.etag) {
      await this.deleteToolAssets({
        source: existing.source,
        pluginId: record.pluginId,
        version: record.version,
        etag: existing.etag
      });
    }
  }

  invalidateToolCache(filter?: { pluginId?: string; version?: string }) {
    if (!filter?.pluginId) {
      getManifestCache().clear();
      return;
    }

    for (const key of getManifestCache().keys()) {
      const [, pluginId, version] = key.split(':');
      if (pluginId !== filter.pluginId) continue;
      if (filter.version && version !== filter.version) continue;
      getManifestCache().delete(key);
    }
  }

  private async getToolManifest(index: MarketplaceToolIndexSchemaType) {
    const cacheKey = getCacheKey(index);
    const cached = getManifestCache().get(cacheKey);
    if (cached) return cached;

    const manifest = await this.loadToolManifest(index);
    getManifestCache().set(cacheKey, manifest);
    return manifest;
  }

  private async loadToolManifest(index: MarketplaceToolIndexSchemaType) {
    const objectKey = getToolManifestObjectKey(index);

    try {
      const buffer = await downloadBufferFromS3(objectKey);
      const record = MarketplaceToolManifestZodSchema.parse(JSON.parse(buffer.toString()));
      if (record.etag === index.etag) {
        return record;
      }

      logger.warning('Marketplace tool manifest etag mismatch, fallback to pkg', {
        pluginId: index.pluginId,
        version: index.version,
        mongoEtag: index.etag,
        manifestEtag: record.etag
      });
    } catch (error) {
      logger.warning('Load marketplace tool manifest from S3 failed, fallback to pkg', {
        pluginId: index.pluginId,
        version: index.version,
        error
      });
    }

    return this.loadToolManifestFromPkg(index);
  }

  private async loadToolManifestFromPkg(index: MarketplaceToolIndexSchemaType) {
    const pkgObjectKey = getPkgObjectKey(index);
    const buffer = await downloadBufferFromS3(pkgObjectKey);
    const [parsedPkg, parseError] = await parsePkg({
      input: buffer,
      getAccessURL: async ({ pluginId, version, etag, filePath }) => {
        const objectKey = getPluginAssetObjectKey({
          source: index.source,
          pluginId,
          version,
          etag,
          filePath
        });
        return [getPublicURLByKey(objectKey), null];
      }
    });

    if (parseError || !parsedPkg || parsedPkg.info.type !== 'tool') {
      throw new Error(`Parse marketplace pkg failed: ${index.pluginId}@${index.version}`);
    }

    const tool = parsedPkg.info as ToolDetailType;
    return MarketplaceToolManifestZodSchema.parse({
      type: 'tool',
      pluginId: index.pluginId,
      version: index.version,
      etag: index.etag,
      source: getIndexSource(index),
      tool,
      downloadObjectKey: pkgObjectKey,
      downloadUrl: getPkgDownloadURLByKey(pkgObjectKey),
      readmeUrl: tool.readmeUrl,
      filename: index.filename ?? getPkgFilename(index),
      size: buffer.length,
      createTime: index.createTime,
      updateTime: index.updateTime
    });
  }

  private async deleteToolAssets({
    source,
    pluginId,
    version,
    etag
  }: {
    source?: string;
    pluginId: string;
    version: string;
    etag: string;
  }) {
    const prefix = `${getPluginAssetPrefix({ source, pluginId, version, etag })}/`;

    try {
      const result = await deleteObjectsByPrefixFromS3(prefix);
      if (result.keys.length > 0) {
        logger.warning('Delete old marketplace tool assets partially failed', {
          pluginId,
          version,
          etag,
          failedKeys: result.keys
        });
      }
    } catch (error) {
      logger.error('Delete old marketplace tool assets failed', {
        pluginId,
        version,
        etag,
        error
      });
    }
  }
}

export const pluginRepo = new PluginRepo();

import type { Readable } from 'node:stream';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import {
  parsePkg,
  type ParsedPkgFile,
  type ToolDetailType
} from '@fastgpt/global/sdk/fastgpt-plugin';
import {
  MarketplaceOfficialSource,
  MarketplacePkgSourceSchema
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import { MarketplaceToolManifestZodSchema } from '../mongo/models/tool';
import { pluginRepo } from '../plugin/repo';
import {
  getPkgFilename,
  getPkgDownloadURLByKey,
  getPkgObjectKey,
  getPluginAssetObjectKey,
  getPublicURLByKey,
  uploadBufferToS3,
  uploadPkgToS3
} from '../s3';
import { refreshToolList } from './data';

const streamToBuffer = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const uploadParsedFile = async ({
  file,
  source,
  pluginId,
  version,
  etag
}: {
  file: ParsedPkgFile;
  source: string;
  pluginId: string;
  version: string;
  etag: string;
}) => {
  const objectKey = getPluginAssetObjectKey({
    source,
    pluginId,
    version,
    etag,
    filePath: [file.filename]
  });

  await uploadBufferToS3({
    objectKey,
    buffer: await streamToBuffer(file.stream),
    filename: file.filename,
    contentType: file.contentType
  });
};

const formatPkgParseError = (error: unknown) => {
  const reason = (error as { reason?: unknown })?.reason;
  if (reason) {
    return typeof reason === 'string'
      ? reason
      : parseI18nString(reason as { en: string; 'zh-CN'?: string; 'zh-Hant'?: string }, 'zh-CN') ||
          JSON.stringify(reason);
  }
  return error instanceof Error ? error.message : String(error);
};

export const uploadMarketplacePkg = async ({
  buffer,
  source: rawSource = MarketplaceOfficialSource
}: {
  buffer: Buffer;
  source?: string;
}) => {
  const source = MarketplacePkgSourceSchema.parse(rawSource);

  const [parsedPkg, parseError] = await parsePkg({
    input: buffer,
    getAccessURL: async ({ pluginId, version, etag, filePath }) => {
      const objectKey = getPluginAssetObjectKey({
        source,
        pluginId,
        version,
        etag,
        filePath
      });
      return [getPublicURLByKey(objectKey), null];
    }
  });

  if (parseError || !parsedPkg) {
    throw new Error(formatPkgParseError(parseError || 'Parse pkg failed'));
  }

  if (parsedPkg.info.type !== 'tool') {
    throw new Error(`Unsupported plugin type: ${parsedPkg.info.type}`);
  }

  const tool = parsedPkg.info as ToolDetailType;
  const pkgFilename = getPkgFilename({
    pluginId: tool.pluginId,
    version: tool.version,
    etag: tool.etag
  });
  const pkgObjectKey = getPkgObjectKey({
    source,
    pluginId: tool.pluginId,
    version: tool.version,
    filename: pkgFilename
  });
  const downloadUrl = getPkgDownloadURLByKey(pkgObjectKey);

  await Promise.all([
    uploadPkgToS3({
      objectKey: pkgObjectKey,
      buffer,
      filename: pkgFilename
    }),
    ...(parsedPkg.files.readme
      ? [
          uploadParsedFile({
            file: parsedPkg.files.readme,
            source,
            pluginId: tool.pluginId,
            version: tool.version,
            etag: tool.etag
          })
        ]
      : []),
    ...(parsedPkg.files.logos ?? []).map((file) =>
      uploadParsedFile({
        file,
        source,
        pluginId: tool.pluginId,
        version: tool.version,
        etag: tool.etag
      })
    ),
    ...(parsedPkg.files.assets ?? []).map((file) =>
      uploadParsedFile({
        file,
        source,
        pluginId: tool.pluginId,
        version: tool.version,
        etag: tool.etag
      })
    )
  ]);

  const now = new Date();
  const record = MarketplaceToolManifestZodSchema.parse({
    type: 'tool',
    pluginId: tool.pluginId,
    version: tool.version,
    etag: tool.etag,
    source,
    tool,
    downloadObjectKey: pkgObjectKey,
    downloadUrl,
    readmeUrl: tool.readmeUrl,
    filename: pkgFilename,
    size: buffer.length,
    createTime: now,
    updateTime: now
  });

  await pluginRepo.publishToolManifest(record);

  await refreshToolList();

  return {
    pluginId: record.pluginId,
    version: record.version,
    etag: record.etag,
    source: record.source,
    downloadUrl: record.downloadUrl,
    tool: record.tool
  };
};

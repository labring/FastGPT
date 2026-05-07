import type { Readable } from 'node:stream';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { parsePkg, type ParsedPkgFile, type ToolDetailType } from '@fastgpt-plugin/sdk-client';
import { MongoMarketplaceTool, MarketplaceToolZodSchema } from '../mongo/models/tool';
import {
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
  pluginId,
  version,
  etag
}: {
  file: ParsedPkgFile;
  pluginId: string;
  version: string;
  etag: string;
}) => {
  const objectKey = getPluginAssetObjectKey({
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
      : parseI18nString(
          reason as { en: string; 'zh-CN'?: string; 'zh-Hant'?: string },
          'zh-CN'
        ) || JSON.stringify(reason);
  }
  return error instanceof Error ? error.message : String(error);
};

export const uploadMarketplacePkg = async ({
  buffer,
  filename
}: {
  buffer: Buffer;
  filename: string;
}) => {
  const [parsedPkg, parseError] = await parsePkg({
    input: buffer,
    getAccessURL: async ({ pluginId, version, etag, filePath }) => {
      const objectKey = getPluginAssetObjectKey({
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
  const pkgObjectKey = getPkgObjectKey({
    pluginId: tool.pluginId,
    version: tool.version
  });
  const downloadUrl = getPkgDownloadURLByKey(pkgObjectKey);

  await Promise.all([
    uploadPkgToS3({
      objectKey: pkgObjectKey,
      buffer,
      filename
    }),
    ...(parsedPkg.files.readme
      ? [
          uploadParsedFile({
            file: parsedPkg.files.readme,
            pluginId: tool.pluginId,
            version: tool.version,
            etag: tool.etag
          })
        ]
      : []),
    ...(parsedPkg.files.logos ?? []).map((file) =>
      uploadParsedFile({
        file,
        pluginId: tool.pluginId,
        version: tool.version,
        etag: tool.etag
      })
    ),
    ...(parsedPkg.files.assets ?? []).map((file) =>
      uploadParsedFile({
        file,
        pluginId: tool.pluginId,
        version: tool.version,
        etag: tool.etag
      })
    )
  ]);

  const now = new Date();
  const record = MarketplaceToolZodSchema.parse({
    type: 'tool',
    pluginId: tool.pluginId,
    version: tool.version,
    etag: tool.etag,
    tool,
    downloadObjectKey: pkgObjectKey,
    downloadUrl,
    readmeUrl: tool.readmeUrl,
    filename,
    size: buffer.length,
    createTime: now,
    updateTime: now
  });
  const { createTime, ...recordUpdate } = record;

  await MongoMarketplaceTool.updateOne(
    {
      pluginId: record.pluginId,
      version: record.version
    },
    {
      $set: {
        ...recordUpdate,
        updateTime: now
      },
      $setOnInsert: {
        createTime
      }
    },
    {
      upsert: true
    }
  );

  await refreshToolList();

  return {
    pluginId: record.pluginId,
    version: record.version,
    etag: record.etag,
    downloadUrl: record.downloadUrl,
    tool: record.tool
  };
};

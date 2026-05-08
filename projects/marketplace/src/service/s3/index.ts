import { createStorage, MinioStorageAdapter, type IStorageOptions } from '@fastgpt-sdk/storage';
import { marketplaceEnv, marketplaceStorageEnv } from '@/env';
import type { Readable } from 'node:stream';

type StorageClient = ReturnType<typeof createStorage>;

const getStorageConfig = (endpoint = marketplaceStorageEnv.endpoint): IStorageOptions => {
  const { vendor, publicBucket, region, accessKeyId, secretAccessKey } = marketplaceStorageEnv;
  const credentials = {
    accessKeyId,
    secretAccessKey
  };

  if (vendor === 'minio' || vendor === 'aws-s3') {
    return {
      vendor,
      bucket: publicBucket,
      region,
      credentials,
      endpoint,
      forcePathStyle: marketplaceEnv.STORAGE_S3_FORCE_PATH_STYLE,
      maxRetries: marketplaceEnv.STORAGE_S3_MAX_RETRIES,
      publicAccessExtraSubPath: marketplaceEnv.STORAGE_PUBLIC_ACCESS_EXTRA_SUB_PATH
    };
  }

  if (vendor === 'cos') {
    return {
      vendor,
      bucket: publicBucket,
      region,
      credentials,
      protocol: marketplaceEnv.STORAGE_COS_PROTOCOL,
      useAccelerate: marketplaceEnv.STORAGE_COS_USE_ACCELERATE,
      domain: marketplaceEnv.STORAGE_COS_CNAME_DOMAIN,
      proxy: marketplaceEnv.STORAGE_COS_PROXY
    };
  }

  if (vendor === 'oss') {
    return {
      vendor,
      bucket: publicBucket,
      region,
      credentials,
      endpoint: marketplaceEnv.STORAGE_OSS_ENDPOINT,
      cname: marketplaceEnv.STORAGE_OSS_CNAME,
      internal: marketplaceEnv.STORAGE_OSS_INTERNAL,
      secure: marketplaceEnv.STORAGE_OSS_SECURE,
      enableProxy: marketplaceEnv.STORAGE_OSS_ENABLE_PROXY
    };
  }

  throw new Error(`Unsupported storage vendor: ${vendor}`);
};

declare global {
  // eslint-disable-next-line no-var
  var marketplacePublicStorage: ReturnType<typeof createStorage> | undefined;
  // eslint-disable-next-line no-var
  var marketplaceExternalPublicStorage: ReturnType<typeof createStorage> | undefined;
}

const ensurePublicBucket = (storage: StorageClient, label: string) => {
  storage
    .ensureBucket()
    .then(() => {
      if (!(storage instanceof MinioStorageAdapter)) {
        return;
      }

      storage.ensurePublicBucketPolicy().catch((error) => {
        console.warn(`Failed to ensure marketplace ${label} bucket policy`, error);
      });
    })
    .catch((error) => {
      console.error(`Failed to ensure marketplace ${label} bucket exists`, error);
    });
};

const getPublicStorage = () => {
  if (!global.marketplacePublicStorage) {
    global.marketplacePublicStorage = createStorage(getStorageConfig());
    ensurePublicBucket(global.marketplacePublicStorage, 'public');
  }
  return global.marketplacePublicStorage;
};

const getPublicUrlStorage = () => {
  const { vendor, externalEndpoint } = marketplaceStorageEnv;

  if ((vendor !== 'minio' && vendor !== 'aws-s3') || !externalEndpoint) {
    return getPublicStorage();
  }

  if (!global.marketplaceExternalPublicStorage) {
    global.marketplaceExternalPublicStorage = createStorage(getStorageConfig(externalEndpoint));
    ensurePublicBucket(global.marketplaceExternalPublicStorage, 'external public');
  }

  return global.marketplaceExternalPublicStorage;
};

const encodeObjectKeyPart = (value: string) => encodeURIComponent(value);

export const getPkgObjectKey = ({ pluginId, version }: { pluginId: string; version: string }) => {
  return `pkgs/${encodeObjectKeyPart(pluginId)}/${encodeObjectKeyPart(version)}.pkg`;
};

export const getPkgFilename = ({
  pluginId,
  version,
  etag
}: {
  pluginId: string;
  version: string;
  etag: string;
}) => {
  return `${pluginId}@${version}@${etag}.pkg`;
};

export const getToolManifestObjectKey = ({
  pluginId,
  version
}: {
  pluginId: string;
  version: string;
}) => {
  return `marketplace/tools/${encodeObjectKeyPart(pluginId)}/${encodeObjectKeyPart(version)}.json`;
};

export const getPluginAssetPrefix = ({
  pluginId,
  version,
  etag
}: {
  pluginId: string;
  version: string;
  etag: string;
}) => {
  return [
    'system',
    'plugin',
    'tools',
    encodeObjectKeyPart(pluginId),
    encodeObjectKeyPart(version),
    encodeObjectKeyPart(etag)
  ].join('/');
};

export const getPluginAssetObjectKey = ({
  pluginId,
  version,
  etag,
  filePath
}: {
  pluginId: string;
  version: string;
  etag: string;
  filePath: string[];
}) => {
  const safeFilePath = filePath
    .flatMap((item) => item.split('/'))
    .filter((item) => item && item !== '.' && item !== '..');
  return [
    getPluginAssetPrefix({
      pluginId,
      version,
      etag
    }),
    ...safeFilePath.map(encodeObjectKeyPart)
  ].join('/');
};

export const getPkgDownloadURLByKey = (objectKey: string) => {
  return getPublicURLByKey(objectKey);
};

export const getPublicURLByKey = (objectKey: string) => {
  return getPublicUrlStorage().generatePublicGetUrl({ key: objectKey }).url;
};

export const uploadBufferToS3 = async ({
  objectKey,
  buffer,
  filename,
  contentType = 'application/octet-stream'
}: {
  objectKey: string;
  buffer: Buffer;
  filename: string;
  contentType?: string;
}) => {
  await getPublicStorage().uploadObject({
    key: objectKey,
    body: buffer,
    contentType,
    contentLength: buffer.length,
    contentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    metadata: {
      originFilename: encodeURIComponent(filename),
      uploadTime: new Date().toISOString()
    }
  });
};

const streamToBuffer = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export const downloadBufferFromS3 = async (objectKey: string) => {
  const result = await getPublicStorage().downloadObject({ key: objectKey });
  return streamToBuffer(result.body);
};

export const uploadJsonToS3 = async ({
  objectKey,
  data
}: {
  objectKey: string;
  data: unknown;
}) => {
  const content = JSON.stringify(data);
  await getPublicStorage().uploadObject({
    key: objectKey,
    body: content,
    contentType: 'application/json; charset=utf-8',
    contentLength: Buffer.byteLength(content),
    metadata: {
      uploadTime: new Date().toISOString()
    }
  });
};

export const deleteObjectsByPrefixFromS3 = async (prefix: string) => {
  return getPublicStorage().deleteObjectsByPrefix({ prefix });
};

export const uploadPkgToS3 = async (params: {
  objectKey: string;
  buffer: Buffer;
  filename: string;
}) => uploadBufferToS3(params);

export const getPkgdownloadURL = (toolId: string) => {
  return getPublicURLByKey(`pkgs/${encodeObjectKeyPart(toolId)}.pkg`);
};

export const getReadmeURL = (toolId: string) => {
  return getPublicURLByKey(`system/plugin/tools/${encodeObjectKeyPart(toolId)}/README.md`);
};

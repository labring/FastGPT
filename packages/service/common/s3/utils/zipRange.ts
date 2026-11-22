import type { IStorage } from '@fastgpt-sdk/storage';
import type { ZipByteRangeReader } from '../../file/zip';
import { withStorageKeyFallback } from './assert';

/**
 * 为对象存储源（`S3BaseBucket` 实例或单测 mock）解析真实存在对象键、总长度与 Range 读取器。
 */
export async function resolveStorageZipRangeSource({
  bucket,
  key,
  maxZipBytes,
  label
}: {
  bucket: {
    client: Pick<IStorage, 'getObjectMetadata' | 'downloadObject'>;
  };
  key: string;
  maxZipBytes?: number;
  label: string;
}): Promise<{
  resolvedKey: string;
  totalSize: number;
  readRange: ZipByteRangeReader;
}> {
  const { resolvedKey, contentLength } = await withStorageKeyFallback(key, async (candidate) => {
    const metadata = await bucket.client.getObjectMetadata({ key: candidate });
    if (metadata.contentLength === undefined || metadata.contentLength < 0) {
      throw new Error(`Missing contentLength metadata for object: ${candidate}`);
    }
    return {
      resolvedKey: candidate,
      contentLength: metadata.contentLength
    };
  });

  if (maxZipBytes !== undefined && contentLength > maxZipBytes) {
    throw new Error(`${label} size exceeds maximum allowed bytes (${maxZipBytes} bytes)`);
  }

  return {
    resolvedKey,
    totalSize: contentLength,
    readRange: async ({ start, end, signal }) => {
      const response = await bucket.client.downloadObject({
        key: resolvedKey,
        range: { start, end },
        ...(signal ? { abortSignal: signal } : {})
      });
      if (!response.body) {
        throw new Error(`Failed to download ${label} range: ${resolvedKey}`);
      }
      return response.body;
    }
  };
}

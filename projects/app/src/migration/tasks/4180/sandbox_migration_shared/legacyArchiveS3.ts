/**
 * 旧版 S3 工作区冷归档包（`sandbox/archive/<sandboxId>/package.zip`）自包含流式读取与清理。
 *
 * 直接复用底层 `S3PrivateBucket`，不向 `packages/service/common/s3` 回写任何已下线的沙箱归档契约。
 */
import { Readable } from 'node:stream';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { readStreamToBuffer } from '@fastgpt/service/common/s3/utils';

const LEGACY_ARCHIVE_FILENAME = 'package.zip';
export const EMPTY_ZIP_BUFFER = Buffer.from('504b0506000000000000000000000000000000000000', 'hex');

let cachedPrivateBucket: S3PrivateBucket | undefined;

function getPrivateBucket(): S3PrivateBucket {
  cachedPrivateBucket ??= new S3PrivateBucket();
  return cachedPrivateBucket;
}

/** 构造旧版沙箱工作区归档对象存储 Key。 */
export function getLegacySandboxArchiveKey(sandboxId: string): string {
  return `sandbox/archive/${sandboxId}/${LEGACY_ARCHIVE_FILENAME}`;
}

export type LegacyArchiveInspectResult =
  | { exists: false }
  | { exists: true; key: string; isEmptyZip: boolean };

/**
 * 检查指定沙箱在 `S3PrivateBucket` 中是否存在 `package.zip`，并识别 22 字节空归档占位包。
 */
export async function inspectLegacyWorkspaceArchive(
  sandboxId: string
): Promise<LegacyArchiveInspectResult> {
  const bucket = getPrivateBucket();
  const rawKey = getLegacySandboxArchiveKey(sandboxId);
  const resolvedKey = await bucket.resolveExistingObjectKey(rawKey);
  if (!resolvedKey) {
    return { exists: false };
  }

  const metadata = await bucket.client.getObjectMetadata({ key: resolvedKey });
  if (metadata.contentLength === EMPTY_ZIP_BUFFER.length) {
    const downloaded = await bucket.client.downloadObject({ key: resolvedKey });
    if (downloaded.body) {
      const content = await readStreamToBuffer({
        stream: downloaded.body,
        maxBytes: EMPTY_ZIP_BUFFER.length + 1
      });
      if (content.equals(EMPTY_ZIP_BUFFER)) {
        return { exists: true, key: resolvedKey, isEmptyZip: true };
      }
    }
  }

  return { exists: true, key: resolvedKey, isEmptyZip: false };
}

/**
 * 按已确认存在的对象 Key 打开 `S3PrivateBucket` 归档包的 Web `ReadableStream`，供流式写入临时迁移容器。
 */
export async function openLegacyWorkspaceArchiveWebStream(resolvedKey: string): Promise<{
  stream: ReadableStream<Uint8Array>;
  close: () => void;
}> {
  const bucket = getPrivateBucket();
  const response = await bucket.client.downloadObject({ key: resolvedKey });
  const nodeStream = response.body;
  if (!nodeStream) {
    throw new Error(`Empty S3 download body for legacy sandbox archive key ${resolvedKey}`);
  }

  return {
    stream: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>,
    close: () => {
      if (!nodeStream.destroyed) {
        nodeStream.destroy();
      }
    }
  };
}

/**
 * 幂等删除 `S3PrivateBucket` 中的旧版归档包。
 */
export async function deleteLegacyWorkspaceArchive(sandboxId: string): Promise<void> {
  const bucket = getPrivateBucket();
  const rawKey = getLegacySandboxArchiveKey(sandboxId);
  await bucket.removeObject(rawKey);
}

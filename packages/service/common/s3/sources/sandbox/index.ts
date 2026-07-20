import type { Readable } from 'node:stream';
import { S3PrivateBucket } from '../../buckets/private';
import { readStreamToBuffer } from '../../utils';

const SANDBOX_WORKSPACE_ARCHIVE_FILENAME = 'package.zip';

const getWorkspaceArchiveKey = (sandboxId: string): string =>
  `agent-sandbox/${sandboxId}/${SANDBOX_WORKSPACE_ARCHIVE_FILENAME}`;

export class S3SandboxSource extends S3PrivateBucket {
  constructor() {
    super();
  }

  async uploadWorkspaceArchive(params: {
    sandboxId: string;
    body: Buffer | string | Readable;
    idempotencyKey?: string;
  }) {
    await this.client.uploadObject({
      key: getWorkspaceArchiveKey(params.sandboxId),
      body: params.body,
      contentType: 'application/zip',
      metadata: {
        uploadTime: new Date().toISOString(),
        originFilename: encodeURIComponent(SANDBOX_WORKSPACE_ARCHIVE_FILENAME),
        ...(params.idempotencyKey ? { durableSagaIdempotencyKey: params.idempotencyKey } : {})
      }
    });
  }

  async downloadWorkspaceArchive(params: {
    sandboxId: string;
    maxBytes?: number;
  }): Promise<Buffer> {
    const key = getWorkspaceArchiveKey(params.sandboxId);
    const response = await this.client.downloadObject({ key });
    if (!response.body) {
      throw new Error(`Failed to download sandbox archive: ${params.sandboxId}`);
    }

    return readStreamToBuffer({
      stream: response.body,
      maxBytes: params.maxBytes,
      exceededMessage:
        params.maxBytes === undefined
          ? undefined
          : `Sandbox archive exceeds maximum allowed size (${params.maxBytes} bytes)`
    });
  }

  deleteWorkspaceArchive(params: { sandboxId: string }) {
    return this.addDeleteJob({
      key: getWorkspaceArchiveKey(params.sandboxId)
    });
  }

  /** 同步删除 Workspace 归档，返回前保证对象已经不存在。 */
  async deleteWorkspaceArchiveNow(params: { sandboxId: string }) {
    const key = getWorkspaceArchiveKey(params.sandboxId);
    await this.removeObject(key);
    if (await this.isObjectExists(key)) {
      throw new Error(`Failed to delete sandbox archive: ${params.sandboxId}`);
    }
  }

  /** 检查指定 Sandbox 的 Workspace 归档是否存在。 */
  isWorkspaceArchiveExists(params: { sandboxId: string }) {
    return this.isObjectExists(getWorkspaceArchiveKey(params.sandboxId));
  }

  /** Returns the durable step key that produced the current archive object, if it has one. */
  async getWorkspaceArchiveIdempotencyKey(params: { sandboxId: string }) {
    const key = getWorkspaceArchiveKey(params.sandboxId);
    if (!(await this.isObjectExists(key))) return undefined;
    const metadata = await this.client.getObjectMetadata({ key });
    return metadata.metadata.durableSagaIdempotencyKey;
  }
}

export function getS3SandboxSource() {
  if (global.sandboxBucket) {
    return global.sandboxBucket;
  }
  global.sandboxBucket = new S3SandboxSource();
  return global.sandboxBucket;
}

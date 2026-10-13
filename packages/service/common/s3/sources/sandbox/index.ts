import type { Readable } from 'node:stream';
import { S3PrivateBucket } from '../../buckets/private';
import { readStreamToBuffer } from '../../utils';
import { getContentDisposition } from '@fastgpt/global/common/file/tools';
import { encodeS3Filename } from '../../filename';

const SANDBOX_WORKSPACE_ARCHIVE_FILENAME = 'package.zip';

const getWorkspaceArchiveKey = (sandboxId: string): string =>
  `sandbox/archive/${sandboxId}/${SANDBOX_WORKSPACE_ARCHIVE_FILENAME}`;

type WorkspaceArchiveBody = Buffer | string | Readable;

export class S3SandboxSource extends S3PrivateBucket {
  constructor() {
    super();
  }

  private async uploadWorkspaceArchiveByKey(params: { key: string; body: WorkspaceArchiveBody }) {
    await this.client.uploadObject({
      key: params.key,
      body: params.body,
      contentType: 'application/zip',
      contentDisposition: getContentDisposition({
        filename: SANDBOX_WORKSPACE_ARCHIVE_FILENAME,
        type: 'attachment'
      }),
      metadata: {
        uploadTime: new Date().toISOString(),
        originFilename: encodeS3Filename(SANDBOX_WORKSPACE_ARCHIVE_FILENAME)
      }
    });
  }

  private async downloadWorkspaceArchiveByKey(params: {
    key: string;
    sandboxId: string;
    maxBytes?: number;
  }) {
    const response = await this.client.downloadObject({ key: params.key });
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

  private async deleteWorkspaceArchiveNowByKey(params: { key: string; sandboxId: string }) {
    const { key, sandboxId } = params;
    await this.removeObject(key);
    if (await this.isObjectExists(key)) {
      throw new Error(`Failed to delete sandbox archive: ${sandboxId}`);
    }
  }

  /** 上传 v2 Sandbox 的完整 Workspace 归档。 */
  uploadWorkspaceArchive(params: { sandboxId: string; body: WorkspaceArchiveBody }) {
    return this.uploadWorkspaceArchiveByKey({
      key: getWorkspaceArchiveKey(params.sandboxId),
      body: params.body
    });
  }

  /** 下载 v2 Sandbox 的完整 Workspace 归档。 */
  downloadWorkspaceArchive(params: { sandboxId: string; maxBytes?: number }) {
    return this.downloadWorkspaceArchiveByKey({
      ...params,
      key: getWorkspaceArchiveKey(params.sandboxId)
    });
  }

  /** 同步删除 v2 Sandbox 的 Workspace 归档，返回前保证对象已经不存在。 */
  deleteWorkspaceArchiveNow(params: { sandboxId: string }) {
    return this.deleteWorkspaceArchiveNowByKey({
      ...params,
      key: getWorkspaceArchiveKey(params.sandboxId)
    });
  }

  /** 检查指定 v2 Sandbox 的 Workspace 归档是否存在。 */
  isWorkspaceArchiveExists(params: { sandboxId: string }) {
    return this.isObjectExists(getWorkspaceArchiveKey(params.sandboxId));
  }
}

export function getS3SandboxSource() {
  if (global.sandboxBucket) {
    return global.sandboxBucket;
  }
  global.sandboxBucket = new S3SandboxSource();
  return global.sandboxBucket;
}

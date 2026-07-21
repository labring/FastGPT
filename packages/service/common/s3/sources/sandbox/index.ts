import type { Readable } from 'node:stream';
import { S3PrivateBucket } from '../../buckets/private';
import { readStreamToBuffer } from '../../utils';

const SANDBOX_WORKSPACE_ARCHIVE_FILENAME = 'package.zip';

const getLegacyWorkspaceArchiveKey = (sandboxId: string): string =>
  `agent-sandbox/${sandboxId}/${SANDBOX_WORKSPACE_ARCHIVE_FILENAME}`;
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
      metadata: {
        uploadTime: new Date().toISOString(),
        originFilename: encodeURIComponent(SANDBOX_WORKSPACE_ARCHIVE_FILENAME)
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

  /** 上传 Legacy Sandbox 迁移使用的 Workspace 归档。 */
  uploadLegacyWorkspaceArchive(params: { sandboxId: string; body: WorkspaceArchiveBody }) {
    return this.uploadWorkspaceArchiveByKey({
      key: getLegacyWorkspaceArchiveKey(params.sandboxId),
      body: params.body
    });
  }

  /** 下载 Legacy Sandbox 迁移使用的 Workspace 归档。 */
  downloadLegacyWorkspaceArchive(params: { sandboxId: string; maxBytes?: number }) {
    return this.downloadWorkspaceArchiveByKey({
      ...params,
      key: getLegacyWorkspaceArchiveKey(params.sandboxId)
    });
  }

  /** 同步删除 Source 最终清理时保留的 Legacy Workspace 归档。 */
  deleteLegacyWorkspaceArchiveNow(params: { sandboxId: string }) {
    return this.deleteWorkspaceArchiveNowByKey({
      ...params,
      key: getLegacyWorkspaceArchiveKey(params.sandboxId)
    });
  }

  /** 检查指定 Legacy Sandbox 的 Workspace 归档是否存在。 */
  isLegacyWorkspaceArchiveExists(params: { sandboxId: string }) {
    return this.isObjectExists(getLegacyWorkspaceArchiveKey(params.sandboxId));
  }
}

export function getS3SandboxSource() {
  if (global.sandboxBucket) {
    return global.sandboxBucket;
  }
  global.sandboxBucket = new S3SandboxSource();
  return global.sandboxBucket;
}

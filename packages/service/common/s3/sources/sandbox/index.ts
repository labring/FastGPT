import type { Readable } from 'node:stream';
import streamConsumer from 'node:stream/consumers';
import { S3PrivateBucket } from '../../buckets/private';

const SANDBOX_WORKSPACE_ARCHIVE_FILENAME = 'package.zip';

const getWorkspaceArchiveKey = (sandboxId: string): string =>
  `agent-sandbox/${sandboxId}/${SANDBOX_WORKSPACE_ARCHIVE_FILENAME}`;

export class S3SandboxSource extends S3PrivateBucket {
  constructor() {
    super();
  }

  async uploadWorkspaceArchive(params: { sandboxId: string; body: Buffer | string | Readable }) {
    await this.client.uploadObject({
      key: getWorkspaceArchiveKey(params.sandboxId),
      body: params.body,
      contentType: 'application/zip',
      metadata: {
        uploadTime: new Date().toISOString(),
        originFilename: encodeURIComponent(SANDBOX_WORKSPACE_ARCHIVE_FILENAME)
      }
    });
  }

  async downloadWorkspaceArchive(params: { sandboxId: string }): Promise<Buffer> {
    const key = getWorkspaceArchiveKey(params.sandboxId);
    const response = await this.client.downloadObject({ key });
    return streamConsumer.buffer(response.body);
  }

  deleteWorkspaceArchive(params: { sandboxId: string }) {
    return this.addDeleteJob({
      key: getWorkspaceArchiveKey(params.sandboxId)
    });
  }
}

export function getS3SandboxSource() {
  if (global.sandboxBucket) {
    return global.sandboxBucket;
  }
  global.sandboxBucket = new S3SandboxSource();
  return global.sandboxBucket;
}

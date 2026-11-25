import path from 'node:path';
import type { Readable } from 'node:stream';
import { throwIfAborted } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../logger';
import { S3PrivateBucket } from '../../buckets/private';

const logger = getLogger(LogCategories.INFRA.S3);

/** 4.18.0 Agent Sandbox 新版 `.tar.zst` 归档 S3 前缀，与 4.17.x 旧 `sandbox/archive/` 完全隔离。 */
export const SANDBOX_ARCHIVE_PREFIX = 'sandbox/archive-v2';

/** 4.17.x 旧版 Sandbox S3 归档前缀（运行期严格只读保护，仅在清理任务中移除）。 */
export const LEGACY_SANDBOX_ARCHIVE_PREFIX = 'sandbox/archive';

/**
 * 构造 Agent Sandbox `.tar.zst` 代次归档对象键。
 *
 * 每个归档批次拥有独立 `<generation>`，实现 Copy-on-Write，避免上传中途覆盖上一代可用冷备。
 */
export const buildSandboxArchiveObjectKey = (sandboxId: string, generation: string): string =>
  `${SANDBOX_ARCHIVE_PREFIX}/${encodeURIComponent(sandboxId)}/${generation}.tar.zst`;

export class S3SandboxSource extends S3PrivateBucket {
  /**
   * 流式上传 `.tar.zst` Workspace 归档。
   *
   * 复用通用 Unknown-length S3 Multipart 分片逻辑（<= 5 MiB 单次 PUT，> 5 MiB 分片流式推送），
   * 避免整包缓冲进主站内存，并在失败或中止时主动 `abortMultipartUpload`。
   */
  async uploadArchiveStream(params: {
    key: string;
    body: Readable;
    signal?: AbortSignal;
  }): Promise<{ sizeBytes: number }> {
    return this.uploadStreamWithMultipart({
      key: params.key,
      body: params.body,
      contentType: 'application/zstd',
      filename: path.basename(params.key) || 'archive.tar.zst',
      signal: params.signal
    });
  }

  /**
   * 获取指定 S3 对象键的只读下载流（调用方负责消费、限流与销毁，不在主站整包缓冲进内存）。
   */
  async downloadArchiveStream(params: {
    key: string;
    sandboxId: string;
    signal?: AbortSignal;
  }): Promise<Readable> {
    const response = await this.client.downloadObject({
      key: params.key,
      ...(params.signal ? { abortSignal: params.signal } : {})
    });
    if (!response.body) {
      throw new Error(`Failed to download sandbox archive: ${params.sandboxId}`);
    }
    return response.body;
  }

  private getArchivePrefix(sandboxId: string): string {
    const normalizedSandboxId = sandboxId.trim();
    if (
      !normalizedSandboxId ||
      normalizedSandboxId === '.' ||
      normalizedSandboxId === '..' ||
      normalizedSandboxId.includes('/') ||
      normalizedSandboxId.includes('\\')
    ) {
      throw new Error(`Invalid sandboxId for archive prefix: ${sandboxId}`);
    }
    return `${SANDBOX_ARCHIVE_PREFIX}/${encodeURIComponent(normalizedSandboxId)}/`;
  }

  /**
   * 同步删除单个归档对象，用于清理上传失败或测试中的孤立归档对象。
   */
  async deleteArchiveObject(params: { key: string }) {
    await this.removeObject(params.key);
  }

  /**
   * 清理 `sandbox/archive-v2/<sandboxId>/` 下已被新 generation 取代（或中断残留）的旧归档对象，严格保留当前 `keepObjectKey`。
   *
   * 4.17.x 旧 `package.zip` 位于独立的 `sandbox/archive/` 前缀下，因此无需过滤扩展名。
   */
  async deleteSupersededSandboxArchives({
    sandboxId,
    keepObjectKey,
    signal
  }: {
    sandboxId: string;
    keepObjectKey?: string;
    signal?: AbortSignal;
  }): Promise<void> {
    throwIfAborted(signal);
    const { keys } = await this.client.listObjects({ prefix: this.getArchivePrefix(sandboxId) });
    throwIfAborted(signal);
    const keysToDelete = keys.filter((key) => key !== keepObjectKey);
    if (keysToDelete.length === 0) return;

    throwIfAborted(signal);
    const result = await this.client.deleteObjectsByMultiKeys({ keys: keysToDelete });
    const failedKeys = Array.isArray((result as { keys?: unknown })?.keys)
      ? (result as { keys: string[] }).keys
      : [];
    if (failedKeys.length > 0) {
      logger.warn('Partial failure deleting superseded sandbox archives', {
        sandboxId,
        failedCount: failedKeys.length,
        failedKeys: failedKeys.slice(0, 10)
      });
    }
  }

  /**
   * 清理指定逻辑沙盒名下的全部 `sandbox/archive-v2/` S3 归档。
   *
   * 运行期严禁删除 4.17.x 旧前缀 `sandbox/archive/` 下的任何对象，以保证回滚 4.17.x 时旧冷备零损耗。
   */
  async deleteSandboxArchives(params: { sandboxId: string }) {
    await this.client.deleteObjectsByPrefix({
      prefix: this.getArchivePrefix(params.sandboxId)
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

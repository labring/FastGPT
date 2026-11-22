import path from 'node:path';
import type { Readable } from 'node:stream';
import { throwIfAborted } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../logger';
import { S3PrivateBucket } from '../../buckets/private';

const logger = getLogger(LogCategories.INFRA.S3);

/**
 * 构造 Agent Sandbox `.tar.zst` 代次归档对象键。
 *
 * 每个归档批次拥有独立 `<generation>`，实现 Copy-on-Write，避免上传中途覆盖上一代可用冷备。
 */
export const buildSandboxArchiveObjectKey = (sandboxId: string, generation: string): string =>
  `sandbox/archive/${encodeURIComponent(sandboxId)}/${generation}.tar.zst`;

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
    return `sandbox/archive/${encodeURIComponent(normalizedSandboxId)}/`;
  }

  /**
   * 同步删除单个归档对象，用于清理已被新 generation 取代的历史 `.tar.zst` 或旧 `package.zip`。
   */
  async deleteArchiveObject(params: { key: string }) {
    await this.removeObject(params.key);
  }

  /**
   * 清理已被新 generation `.tar.zst` 取代（或中断残留）的旧归档对象，严格保留当前 `keepObjectKey` 与历史 `package.zip`。
   *
   * 兼容期说明（>= 4.19.0 移除窗口）：`package.zip` 仅在 4.18.0 迁移及 `cleanup_legacy_sandbox_resources`
   * 清理前保留；待历史归档全部完成转码并确认无需回滚后，不再区分保留旧 `package.zip`。
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
    const keysToDelete = keys.filter((key) => key.endsWith('.tar.zst') && key !== keepObjectKey);
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
   * 清理指定逻辑沙盒名下的全部 S3 归档（含当前代次 `.tar.zst`、前缀下所有代次对象及历史 `package.zip`）。
   */
  async deleteSandboxArchives(params: { sandboxId: string; currentObjectKey?: string }) {
    const prefix = this.getArchivePrefix(params.sandboxId);
    const tasks: Promise<unknown>[] = [this.client.deleteObjectsByPrefix({ prefix })];
    if (params.currentObjectKey && !params.currentObjectKey.startsWith(prefix)) {
      tasks.push(this.removeObject(params.currentObjectKey));
    }
    await Promise.all(tasks);
  }
}

export function getS3SandboxSource() {
  if (global.sandboxBucket) {
    return global.sandboxBucket;
  }
  global.sandboxBucket = new S3SandboxSource();
  return global.sandboxBucket;
}

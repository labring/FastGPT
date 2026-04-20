/**
 * Skill Storage Service
 *
 * Provides utilities for uploading, downloading, and managing skill packages
 * in object storage (MinIO/S3) using @fastgpt-sdk/storage.
 */

import { S3PrivateBucket } from '../../common/s3/buckets/private';
import type { ClientSession } from '../../common/mongo';
import { getSkillSizeLimits } from './sandboxConfig';

export type SkillStorageInfo = {
  bucket: string;
  key: string;
  size: number;
  checksum?: string;
};

export type UploadSkillPackageParams = {
  teamId: string;
  skillId: string;
  version: number;
  zipBuffer: Buffer;
  checksum?: string;
};

export type DownloadSkillPackageParams = {
  storageInfo: SkillStorageInfo;
};

export type GetSkillStorageInfoParams = {
  teamId: string;
  skillId: string;
  version: number;
};

/**
 * Generate storage key for skill package
 */
export function getSkillStorageKey(teamId: string, skillId: string, version: number): string {
  return `agent-skills/${teamId}/${skillId}/v${version}/package.zip`;
}

/**
 * Parse storage key to extract teamId, skillId, and version
 */
export function parseSkillStorageKey(
  key: string
): { teamId: string; skillId: string; version: number } | null {
  const match = key.match(/^agent-skills\/([^/]+)\/([^/]+)\/v(\d+)\/package\.zip$/);
  if (!match) return null;

  return {
    teamId: match[1],
    skillId: match[2],
    version: parseInt(match[3], 10)
  };
}

/**
 * Upload skill package to MinIO/S3 storage
 */
export async function uploadSkillPackage(
  params: UploadSkillPackageParams
): Promise<SkillStorageInfo> {
  const { teamId, skillId, version, zipBuffer, checksum } = params;

  // Generate storage key
  const key = getSkillStorageKey(teamId, skillId, version);

  // Use S3PrivateBucket for upload
  const bucket = new S3PrivateBucket();

  await bucket.client.uploadObject({
    key,
    body: zipBuffer,
    contentType: 'application/zip',
    metadata: {
      'x-amz-meta-team-id': teamId,
      'x-amz-meta-skill-id': skillId,
      'x-amz-meta-version': version.toString(),
      ...(checksum && { 'x-amz-meta-checksum': checksum })
    }
  });

  return {
    bucket: bucket.bucketName,
    key,
    size: zipBuffer.length,
    ...(checksum && { checksum })
  };
}

/**
 * Download skill package from MinIO/S3 storage
 */
export async function downloadSkillPackage(params: DownloadSkillPackageParams): Promise<Buffer> {
  const { storageInfo } = params;
  const { maxDownloadBytes } = getSkillSizeLimits();

  const bucket = new S3PrivateBucket();

  const response = await bucket.client.downloadObject({
    key: storageInfo.key
  });

  if (!response.body) {
    throw new Error(`Failed to download skill package: ${storageInfo.key}`);
  }

  // Convert stream to buffer with size limit to prevent OOM
  const chunks: Buffer[] = [];
  let totalSize = 0;
  for await (const chunk of response.body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalSize += buf.length;
    if (totalSize > maxDownloadBytes) {
      throw new Error(
        `Skill package exceeds maximum allowed size (${maxDownloadBytes / 1024 / 1024}MB)`
      );
    }
    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}

/**
 * Delete skill package from MinIO/S3 storage
 */
export async function deleteSkillPackage(storageInfo: SkillStorageInfo): Promise<void> {
  const bucket = new S3PrivateBucket();

  await bucket.client.deleteObject({
    key: storageInfo.key
  });
}

/**
 * Delete all packages for a skill across all versions using prefix deletion.
 * Fire-and-forget: enqueues to BullMQ and returns immediately.
 * Prefix covers: agent-skills/{teamId}/{skillId}/ (all versions)
 */
export function deleteSkillAllPackages(teamId: string, skillId: string): void {
  const prefix = `agent-skills/${teamId}/${skillId}/`;
  const bucket = new S3PrivateBucket();
  bucket.addDeleteJob({ prefix });
}

/**
 * Check if skill package exists in storage
 */
export async function checkSkillPackageExists(storageInfo: SkillStorageInfo): Promise<boolean> {
  try {
    const bucket = new S3PrivateBucket();

    const { exists } = await bucket.client.checkObjectExists({
      key: storageInfo.key
    });

    return exists ?? false;
  } catch {
    return false;
  }
}

/**
 * Get skill storage info for a specific version
 */
export async function getSkillStorageInfo(
  params: GetSkillStorageInfoParams
): Promise<SkillStorageInfo & { exists: boolean }> {
  const { teamId, skillId, version } = params;

  const key = getSkillStorageKey(teamId, skillId, version);
  const bucket = new S3PrivateBucket();

  // Check if object exists and get metadata
  const { exists } = await bucket.client.checkObjectExists({ key });

  if (!exists) {
    return {
      bucket: bucket.bucketName,
      key,
      size: 0,
      exists: false
    };
  }

  // Get object metadata to get size
  try {
    const metadata = await bucket.client.getObjectMetadata({ key });

    return {
      bucket: bucket.bucketName,
      key,
      size: metadata.contentLength ?? 0,
      exists: true
    };
  } catch {
    return {
      bucket: bucket.bucketName,
      key,
      size: 0,
      exists: true
    };
  }
}

/**
 * Copy skill package to a new version
 */
export async function copySkillPackage(
  sourceStorageInfo: SkillStorageInfo,
  targetParams: Omit<UploadSkillPackageParams, 'zipBuffer' | 'checksum'>
): Promise<SkillStorageInfo> {
  // Download the source package
  const zipBuffer = await downloadSkillPackage({
    storageInfo: sourceStorageInfo
  });

  // Upload to the new location
  return uploadSkillPackage({
    ...targetParams,
    zipBuffer
  });
}

/**
 * 获取会话制品列表
 */
export async function listSessionArtifacts(sessionId: string): Promise<string[]> {
  const prefix = `agent-sessions/${sessionId}/`;
  const bucket = new S3PrivateBucket();

  const { keys } = await bucket.client.listObjects({ prefix });
  return keys.map((key) => key.replace(prefix, ''));
}

/**
 * 下载制品
 */
export async function downloadSessionArtifact(
  sessionId: string,
  filePath: string
): Promise<Buffer> {
  const key = `agent-sessions/${sessionId}/${filePath}`;
  const bucket = new S3PrivateBucket();

  const response = await bucket.client.downloadObject({ key });

  if (!response.body) {
    throw new Error(`Failed to download artifact: ${key}`);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of response.body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

/**
 * 清理单个会话的所有制品
 */
export async function cleanSessionArtifacts(sessionId: string): Promise<{ deletedCount: number }> {
  const prefix = `agent-sessions/${sessionId}/`;
  const bucket = new S3PrivateBucket();

  const { keys: failedKeys } = await bucket.client.deleteObjectsByPrefix({ prefix });

  // deleteObjectsByPrefix 不返回实际删除数量，以 0 失败 key 数为成功标志
  return { deletedCount: failedKeys.length === 0 ? 1 : 0 };
}

/**
 * 批量清理多个会话的制品
 */
export async function cleanExpiredSessionArtifacts(
  sessionIds: string[]
): Promise<{ deletedCount: number }> {
  let totalDeleted = 0;

  for (const sessionId of sessionIds) {
    const { deletedCount } = await cleanSessionArtifacts(sessionId);
    totalDeleted += deletedCount;
  }

  return { deletedCount: totalDeleted };
}

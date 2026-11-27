/**
 * Skill 包对象存储服务。
 *
 * 在私有 S3 同时兼容存储 `.tar.zst`（编辑发布 / 空白新建）与 `.zip`（外部导入，写入 1 小时临时 TTL）；
 * 创建副本时按原扩展名流式直拷；读取时统一以 `.tar.zst` 流交付，全程不落盘 `/tmp`。
 */

import type { Readable } from 'node:stream';
import {
  getS3SkillSource,
  getSkillPackageKey,
  isSkillTarZstKey
} from '../../../../common/s3/sources/skill';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { ClientSession } from '../../../../common/mongo';
import { getAgentSandboxDiskBytes } from '../../sandbox/config';
import { createSizeLimitedStream } from '../../../../common/file/stream';
import { createTarZstStream } from '../../../../common/file/tarZst';
import { iterateRemoteZipAsTarEntries } from '../../../../common/file/zip';
import { resolveStorageZipRangeSource } from '../../../../common/s3/utils/zipRange';

export type SkillStorageInfo = {
  key: string;
};

type UploadSkillPackageParams = {
  teamId: string;
  skillId: string;
  packageObjectId: string;
  packageBuffer: Buffer;
  extension?: 'tar.zst' | 'zip';
};

type DownloadSkillPackageParams = {
  storageKey: string;
  maxBytes?: number;
  abortSignal?: AbortSignal;
};

type UploadSkillPackageStreamParams = Omit<UploadSkillPackageParams, 'packageBuffer'> & {
  packageStream: Readable;
  contentLength?: number;
  signal?: AbortSignal;
};

/**
 * 上传定长 Skill 包（默认 `.tar.zst`）到私有对象存储。
 */
export async function uploadSkillPackage(
  params: UploadSkillPackageParams
): Promise<SkillStorageInfo> {
  const { teamId, skillId, packageObjectId, packageBuffer, extension } = params;
  const maxBytes = getAgentSandboxDiskBytes();

  if (packageBuffer.length > maxBytes) {
    throw new UserError(SkillErrEnum.archiveTooLarge);
  }

  const bucket = getS3SkillSource();

  const { key } = await bucket.uploadPackage({
    teamId,
    skillId,
    packageObjectId,
    body: packageBuffer,
    contentLength: packageBuffer.length,
    extension
  });

  return { key };
}

/**
 * 将 Skill 包流（默认 `.tar.zst`）直接上传到私有对象存储。
 *
 * `contentLength` 已知时走单次定长上传，否则走自适应 5 MiB Multipart 流式上传，始终逐块强制大小上限。
 */
export async function uploadSkillPackageStream(
  params: UploadSkillPackageStreamParams
): Promise<SkillStorageInfo> {
  const { teamId, skillId, packageObjectId, packageStream, contentLength, extension, signal } =
    params;
  const maxBytes = getAgentSandboxDiskBytes();
  const knownContentLength =
    contentLength !== undefined && Number.isFinite(contentLength) && contentLength >= 0
      ? contentLength
      : undefined;

  if (knownContentLength !== undefined && knownContentLength > maxBytes) {
    throw new UserError(SkillErrEnum.archiveTooLarge);
  }

  const boundedStream = createSizeLimitedStream({
    stream: packageStream,
    maxBytes,
    createExceededError: () => new UserError(SkillErrEnum.archiveTooLarge)
  });

  const bucket = getS3SkillSource();
  if (knownContentLength !== undefined) {
    const { key } = await bucket.uploadPackage({
      teamId,
      skillId,
      packageObjectId,
      body: boundedStream,
      contentLength: knownContentLength,
      extension,
      signal
    });
    return { key };
  }

  const { key } = await bucket.uploadPackageStream({
    teamId,
    skillId,
    packageObjectId,
    body: boundedStream,
    extension,
    signal
  });
  return { key };
}

/**
 * 移除 Skill 包的临时 S3 TTL。
 *
 * uploadSkillPackage / uploadSkillPackageStream 默认写入一条 TTL 记录；只有当版本记录和
 * currentVersionId 在 Mongo 事务内绑定成功后，才移除 TTL；事务失败时由 TTL cron 清理孤儿包。
 */
export async function removeSkillPackageTTL(
  storageKey: string,
  session?: ClientSession
): Promise<void> {
  await getS3SkillSource().removePackageTTL(storageKey, session);
}

/**
 * 从私有对象存储返回带实际字节上限的 Skill 包流。
 */
export async function downloadSkillPackageStream(
  params: DownloadSkillPackageParams
): Promise<Readable> {
  const { storageKey, maxBytes = getAgentSandboxDiskBytes(), abortSignal } = params;
  const response = await getS3SkillSource().client.downloadObject({
    key: storageKey,
    ...(abortSignal ? { abortSignal } : {})
  });

  if (!response.body) {
    throw new Error(`Failed to download skill package: ${storageKey}`);
  }

  return createSizeLimitedStream({
    stream: response.body,
    maxBytes,
    createExceededError: () =>
      new Error(`Skill package exceeds maximum allowed size (${maxBytes / 1024 / 1024}MB)`)
  });
}

/**
 * 以 `.tar.zst` 流读取 Skill 包：`.tar.zst` 直接返回限流下载流；导入的 `.zip` 基于 S3 HTTP Range
 * 实时转码（压缩包与解压总字节均受 `maxBytes` 约束）。
 */
export async function openSkillPackageTarZstStream(params: {
  storageKey: string;
  maxBytes?: number;
  signal?: AbortSignal;
}): Promise<Readable> {
  const { storageKey, maxBytes = getAgentSandboxDiskBytes(), signal } = params;
  if (isSkillTarZstKey(storageKey)) {
    return downloadSkillPackageStream({ storageKey, maxBytes, abortSignal: signal });
  }

  const { totalSize, readRange } = await resolveStorageZipRangeSource({
    bucket: getS3SkillSource(),
    key: storageKey,
    maxZipBytes: maxBytes,
    label: 'Skill package'
  });
  return createTarZstStream(
    iterateRemoteZipAsTarEntries({ totalSize, readRange, signal, maxUncompressedBytes: maxBytes })
  );
}

/**
 * 删除单个版本的 Skill 包。
 */
export async function deleteSkillPackage(storageKey: string): Promise<void> {
  const bucket = getS3SkillSource();

  await bucket.client.deleteObject({
    key: storageKey
  });
}

/**
 * 按前缀异步批量清理 Skill 的所有历史版本包。
 */
export function deleteSkillAllPackages(teamId: string, skillId: string): Promise<void> {
  return getS3SkillSource().deleteSkillPackagesByPrefix({ teamId, skillId });
}

/**
 * 通过 S3 服务端直拷复制 Skill 包到新的目标位置（保留源扩展名 `.tar.zst` 或 `.zip` 并写入临时 TTL），
 * 不经 Node 内存或 `/tmp` 中转。
 */
export async function copySkillPackage(
  sourceStorageKey: string,
  targetParams: Omit<UploadSkillPackageParams, 'packageBuffer' | 'extension'>
): Promise<SkillStorageInfo> {
  const extension = isSkillTarZstKey(sourceStorageKey) ? 'tar.zst' : 'zip';
  const targetKey = getSkillPackageKey({
    ...targetParams,
    extension
  });

  await getS3SkillSource().copy({
    from: sourceStorageKey,
    to: targetKey,
    options: { temporary: true }
  });
  return { key: targetKey };
}

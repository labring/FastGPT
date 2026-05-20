/**
 * Skill 包对象存储服务。
 *
 * 只负责 Skill ZIP 包和编辑会话制品在私有对象存储中的读写、复制、存在性检查和清理。
 * 包内容解析放在 package/archiveUtils 与 package/zipBuilder，版本落库放在 version 模块。
 */

import { S3PrivateBucket } from '../../../../common/s3/buckets/private';
import { getSkillSizeLimits } from '../sandbox/config';

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
 * 生成 Skill 版本包的对象存储 key。
 *
 * key 中包含 teamId、skillId 和版本号，便于按 skill 前缀清理所有历史版本。
 */
export function getSkillStorageKey(teamId: string, skillId: string, version: number): string {
  return `agent-skills/${teamId}/${skillId}/v${version}/package.zip`;
}

/**
 * 从对象存储 key 反解析 teamId、skillId 和版本号。
 *
 * 只识别 getSkillStorageKey 生成的标准格式，非标准历史 key 会返回 null。
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
 * 上传 Skill ZIP 包到私有对象存储。
 *
 * metadata 主要用于对象侧排查和后续兼容校验，业务读取仍以数据库版本记录为准。
 */
export async function uploadSkillPackage(
  params: UploadSkillPackageParams
): Promise<SkillStorageInfo> {
  const { teamId, skillId, version, zipBuffer, checksum } = params;

  const key = getSkillStorageKey(teamId, skillId, version);

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
 * 从私有对象存储下载 Skill ZIP 包。
 *
 * 下载过程中按流式累计大小，超过 sandbox 配置的上限即中断，避免异常大包撑爆内存。
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

  // 流式累加并检查上限，防止异常对象导致 OOM。
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
 * 删除单个版本的 Skill ZIP 包。
 */
export async function deleteSkillPackage(storageInfo: SkillStorageInfo): Promise<void> {
  const bucket = new S3PrivateBucket();

  await bucket.client.deleteObject({
    key: storageInfo.key
  });
}

/**
 * 清理某个 skill 的所有版本包。
 *
 * 这里使用异步删除队列，调用方不等待实际对象删除完成；数据库软删除流程不能依赖这个返回值
 * 表示对象已经立刻消失。
 */
export function deleteSkillAllPackages(teamId: string, skillId: string): void {
  const prefix = `agent-skills/${teamId}/${skillId}/`;
  const bucket = new S3PrivateBucket();
  bucket.addDeleteJob({ prefix });
}

/**
 * 检查 Skill ZIP 包是否存在。
 *
 * 对象存储异常时保守返回 false，避免调用方误以为包可下载。
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
 * 获取指定版本的对象存储信息。
 *
 * 即使对象不存在也会返回标准 key，方便上层展示缺包状态或执行补偿逻辑。
 */
export async function getSkillStorageInfo(
  params: GetSkillStorageInfoParams
): Promise<SkillStorageInfo & { exists: boolean }> {
  const { teamId, skillId, version } = params;

  const key = getSkillStorageKey(teamId, skillId, version);
  const bucket = new S3PrivateBucket();

  const { exists } = await bucket.client.checkObjectExists({ key });

  if (!exists) {
    return {
      bucket: bucket.bucketName,
      key,
      size: 0,
      exists: false
    };
  }

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
 * 复制 Skill 包到新版本位置。
 *
 * 当前对象存储封装没有直接 copy API，因此这里下载后重新上传；调用方应避免在大批量迁移中使用。
 */
export async function copySkillPackage(
  sourceStorageInfo: SkillStorageInfo,
  targetParams: Omit<UploadSkillPackageParams, 'zipBuffer' | 'checksum'>
): Promise<SkillStorageInfo> {
  const zipBuffer = await downloadSkillPackage({
    storageInfo: sourceStorageInfo
  });

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

/**
 * Skill 包对象存储服务。
 *
 * 只负责 Skill ZIP 包和编辑会话制品在私有对象存储中的读写、复制、存在性检查和清理。
 * 包内容解析放在 package/zipBuilder，版本落库放在 version 模块。
 */

import { getS3SkillSource } from '../../../../common/s3/sources/skill';
import { getSkillSizeLimits } from '../sandbox/config';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import type { ClientSession } from '../../../../common/mongo';

export type SkillStorageInfo = {
  key: string;
};

export type UploadSkillPackageParams = {
  teamId: string;
  skillId: string;
  packageObjectId: string;
  zipBuffer: Buffer;
};

export type DownloadSkillPackageParams = {
  storageKey: string;
};

/**
 * 上传 Skill ZIP 包到私有对象存储。
 *
 * 对象 key 由 S3SkillSource 统一生成，业务读取仍以数据库版本记录为准。
 */
export async function uploadSkillPackage(
  params: UploadSkillPackageParams
): Promise<SkillStorageInfo> {
  const { teamId, skillId, packageObjectId, zipBuffer } = params;
  const { maxUploadBytes } = getSkillSizeLimits();

  if (zipBuffer.length > maxUploadBytes) {
    throw new Error(SkillErrEnum.archiveTooLarge);
  }

  const bucket = getS3SkillSource();

  const { key } = await bucket.uploadPackage({
    teamId,
    skillId,
    packageObjectId,
    body: zipBuffer
  });

  return { key };
}

/**
 * 移除 Skill 包的临时 S3 TTL。
 *
 * uploadSkillPackage 通过 S3 bucket 封装上传，默认会写入一条 TTL 记录。只有当版本记录和
 * currentVersionId 在 Mongo 事务内绑定成功后，才移除 TTL；事务失败时 TTL 会保留并由现有
 * S3 cleanup cron 清理孤儿包。
 */
export async function removeSkillPackageTTL(
  storageKey: string,
  session?: ClientSession
): Promise<void> {
  await getS3SkillSource().removePackageTTL(storageKey, session);
}

/**
 * 从私有对象存储下载 Skill ZIP 包。
 *
 * 下载过程中按流式累计大小，超过 sandbox 配置的上限即中断，避免异常大包撑爆内存。
 */
export async function downloadSkillPackage(params: DownloadSkillPackageParams): Promise<Buffer> {
  const { storageKey } = params;
  const { maxDownloadBytes } = getSkillSizeLimits();

  const bucket = getS3SkillSource();

  const response = await bucket.client.downloadObject({
    key: storageKey
  });

  if (!response.body) {
    throw new Error(`Failed to download skill package: ${storageKey}`);
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
export async function deleteSkillPackage(storageKey: string): Promise<void> {
  const bucket = getS3SkillSource();

  await bucket.client.deleteObject({
    key: storageKey
  });
}

/**
 * 清理某个 skill 的所有版本包。
 *
 * 这里使用异步删除队列，调用方不等待实际对象删除完成；数据库软删除流程不能依赖这个返回值
 * 表示对象已经立刻消失。
 */
export function deleteSkillAllPackages(teamId: string, skillId: string): Promise<void> {
  return getS3SkillSource().deleteSkillPackagesByPrefix({ teamId, skillId });
}

/**
 * 检查 Skill ZIP 包是否存在。
 *
 * 对象存储异常时保守返回 false，避免调用方误以为包可下载。
 */
export async function checkSkillPackageExists(storageKey: string): Promise<boolean> {
  try {
    const bucket = getS3SkillSource();

    const { exists } = await bucket.client.checkObjectExists({
      key: storageKey
    });

    return exists ?? false;
  } catch {
    return false;
  }
}

/**
 * 复制 Skill 包到新版本位置。
 *
 * 当前对象存储封装没有直接 copy API，因此这里下载后重新上传；调用方应避免在大批量迁移中使用。
 */
export async function copySkillPackage(
  sourceStorageKey: string,
  targetParams: Omit<UploadSkillPackageParams, 'zipBuffer'>
): Promise<SkillStorageInfo> {
  const zipBuffer = await downloadSkillPackage({ storageKey: sourceStorageKey });

  return uploadSkillPackage({
    ...targetParams,
    zipBuffer
  });
}

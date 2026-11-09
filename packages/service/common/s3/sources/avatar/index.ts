import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import type { ClientSession } from 'mongoose';
import { getFileS3Key } from '../../utils';
import { MongoS3TTL } from '../../models/ttl';
import { S3PublicBucket } from '../../buckets/public';
import { avatarAllowedExtensions, createUploadConstraints } from '../../utils/uploadConstraints';
import { markSiteAvatarDeletionPending } from '../../siteAvatarReferences';

/** 站点头像失去引用后的回收宽限期：留出撤销/改回的时间，避免误删刚被重新引用的图片。 */
export const SITE_AVATAR_DELETE_DELAY_MS = 24 * 60 * 60 * 1000;

class S3AvatarSource extends S3PublicBucket {
  constructor() {
    super();
  }

  get prefix(): string {
    return imageBaseUrl;
  }

  async createUploadAvatarURL({
    filename,
    teamId,
    size,
    autoExpired = true
  }: {
    filename: string;
    teamId: string;
    size?: number;
    autoExpired?: boolean;
  }) {
    const { fileKey } = getFileS3Key.avatar({ teamId, filename });
    const uploadPolicy = createUploadConstraints({
      filename,
      uploadConstraints: {
        allowedExtensions: avatarAllowedExtensions
      }
    });

    return this.createUploadAccessUrl(
      { filename, rawKey: fileKey, ...(size !== undefined ? { size } : {}) },
      {
        expiredHours: autoExpired ? 1 : undefined, // 1 Hours
        maxFileSize: 5, // 5MB
        uploadPolicy
      }
    );
  }

  async removeAvatarTTL(avatar: string, session?: ClientSession): Promise<void> {
    const key = avatar.slice(this.prefix.length);
    await MongoS3TTL.deleteOne({ minioKey: key, bucketName: this.bucketName }, session);
  }

  /**
   * 为失去引用的头像安排延迟删除。
   *
   * 只写入/延长 TTL，不立即删除对象；若期间头像重新被引用，removeAvatarTTL 会取消。
   * 到期的记录由现有 S3 TTL 清理任务处理，避免保存后的异步删除误伤后续重新引用的图片。
   */
  async scheduleAvatarDeletion({
    avatar,
    delayMs = SITE_AVATAR_DELETE_DELAY_MS,
    savedRevision,
    session
  }: {
    avatar: string;
    delayMs?: number;
    /** 本次站点保存后的 revision，用于避免旧保存的延迟回调覆盖新引用。 */
    savedRevision?: number;
    session?: ClientSession;
  }): Promise<void> {
    const key = avatar.slice(this.prefix.length);
    // 先登记待删除状态，最终删除任务只有成功领取该状态后才能删除 S3 对象；
    // 若已有删除任务领取或存在更新的引用，本次不写入 TTL，避免重复排队。
    if (!(await markSiteAvatarDeletionPending({ avatarKey: key, savedRevision, session }))) return;
    await MongoS3TTL.updateOne(
      { minioKey: key, bucketName: this.bucketName },
      {
        // 已有更晚的 TTL 时不缩短
        $max: { expiredTime: new Date(Date.now() + delayMs) }
      },
      { upsert: true, session }
    );
  }

  /** 批量检查头像对象是否仍存在，返回缺失对象 key，供保存前拒绝已过期头像。 */
  async findMissingAvatars({ avatarKeys }: { avatarKeys: string[] }): Promise<string[]> {
    const missing: string[] = [];
    for (const avatarKey of avatarKeys) {
      // 兼容历史 key 的候选格式，避免把仍可读取的旧头像误判为缺失。
      if (!(await this.isObjectExists(avatarKey))) missing.push(avatarKey);
    }
    return missing;
  }

  async deleteAvatar(avatar: string, session?: ClientSession): Promise<void> {
    const key = avatar.slice(this.prefix.length);
    await MongoS3TTL.deleteOne({ minioKey: key, bucketName: this.bucketName }, session);
    await this.removeObject(key);
  }

  async refreshAvatar(newAvatar?: string, oldAvatar?: string, session?: ClientSession) {
    if (!newAvatar || newAvatar === oldAvatar) return;

    // remove the TTL for the new avatar
    await this.removeAvatarTTL(newAvatar, session);

    if (oldAvatar) {
      // delete the old avatar
      // 1. delete the TTL record if it exists
      // 2. delete the avatar in S3
      await this.deleteAvatar(oldAvatar, session);
    }
  }

  async copyAvatar({
    key,
    teamId,
    filename,
    temporary = false
  }: {
    key: string;
    teamId: string;
    filename: string;
    temporary: boolean;
  }) {
    const from = key.slice(this.prefix.length);
    const to = getFileS3Key.avatar({ teamId, filename }).fileKey;
    await this.copy({ from, to, options: { temporary } });
    return this.prefix.concat(to);
  }
}

export function getS3AvatarSource() {
  if (global.avatarBucket) {
    return global.avatarBucket;
  }
  global.avatarBucket = new S3AvatarSource();
  return global.avatarBucket;
}

/**
 * 丢弃已缓存的头像 bucket 单例。
 * S3AvatarSource 继承 S3PublicBucket，构造期冻结 external endpoint 等运行策略；
 * 存储实例配置变更后必须与 s3BucketMap 一起重建，否则头像公开 URL 仍指向旧地址。
 */
export function resetS3AvatarSource() {
  global.avatarBucket = undefined;
}

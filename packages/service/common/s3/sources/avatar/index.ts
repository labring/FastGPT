import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import type { ClientSession } from 'mongoose';
import { getFileS3Key } from '../../utils';
import { MongoS3TTL } from '../../models/ttl';
import { S3PublicBucket } from '../../buckets/public';
import { avatarAllowedExtensions, createUploadConstraints } from '../../utils/uploadConstraints';

/** 站点图片源对象已不存在，调用方应提示重新上传。 */
export class SiteAvatarReferenceUnavailableError extends Error {
  constructor(avatar: string) {
    super(`Site avatar source no longer exists: ${avatar}`);
    this.name = 'SiteAvatarReferenceUnavailableError';
  }
}

/** 站点图片失去引用后的回收宽限期：留出撤销/改回以及旧异步清理完成的时间。 */
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
   * 为失去引用的站点图片安排延迟删除。
   * 只写入/延长 TTL，不立即删除对象；期间重新引用会由 removeAvatarTTL 取消，
   * 到期后由 S3 清理任务在删除前再次核对最新站点配置。
   */
  async scheduleAvatarDeletion({
    avatar,
    delayMs = SITE_AVATAR_DELETE_DELAY_MS,
    session
  }: {
    avatar: string;
    delayMs?: number;
    session?: ClientSession;
  }): Promise<void> {
    const key = avatar.slice(this.prefix.length);
    await MongoS3TTL.updateOne(
      { minioKey: key, bucketName: this.bucketName },
      { $max: { expiredTime: new Date(Date.now() + delayMs) } },
      { upsert: true, session }
    );
  }

  /**
   * 为站点保存的新引用复制一份独立对象。
   *
   * 旧保存的删除任务可能已经进入队列并正在删除原对象；新配置引用复制后的 key，
   * 不再与旧删除任务共享同一个对象。复制件先带 24 小时临时 TTL，保存成功后的
   * 生命周期同步会移除 TTL；保存失败时由 TTL 自动回收。
   */
  async copyForSiteReference({ avatar }: { avatar: string }): Promise<string> {
    const from = avatar.slice(this.prefix.length);
    if (!(await this.isObjectExists(from))) {
      throw new SiteAvatarReferenceUnavailableError(avatar);
    }

    const { fileKey } = getFileS3Key.avatar({
      teamId: 'site',
      filename: from.split('/').pop()
    });
    try {
      await this.copy({ from, to: fileKey, options: { temporary: true } });
    } catch (error) {
      // 复制期间源对象被旧删除任务删掉：按“需要重新上传”处理，而不是暴露成服务端故障。
      if (!(await this.isObjectExists(from))) {
        throw new SiteAvatarReferenceUnavailableError(avatar);
      }
      throw error;
    }
    return this.prefix.concat(fileKey);
  }

  async deleteAvatar(avatar: string, session?: ClientSession): Promise<void> {
    const key = avatar.slice(this.prefix.length);
    await MongoS3TTL.deleteOne({ minioKey: key, bucketName: this.bucketName }, session);
    await this.removeObject(key);
  }

  /**
   * 更新头像的文件生命周期：新图取消临时 TTL，旧图在替换后删除。
   * undefined/空字符串沿用原调用约定，表示本次不更新；null 明确表示清空头像。
   * session 只覆盖 Mongo TTL 记录，S3 对象删除不属于 Mongo 事务。
   */
  async refreshAvatar(newAvatar?: string | null, oldAvatar?: string, session?: ClientSession) {
    if (newAvatar === undefined || newAvatar === '' || newAvatar === oldAvatar) return;

    if (newAvatar !== null) {
      await this.removeAvatarTTL(newAvatar, session);
    }

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
